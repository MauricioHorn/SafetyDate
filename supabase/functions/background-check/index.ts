/**
 * SafetyDate - Background Check Edge Function
 *
 * Orquestra toda a cadeia:
 * 1. Autentica o usuário
 * 2. Valida plano (free → bloqueia, annual ativo → permite)
 * 3. Busca cadastral via BigDataCorp conforme o modo
 * 4. Envia dados para Claude fazer análise
 * 5. Salva resultado no banco
 * 6. Retorna relatório
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { analisarComClaude } from './claude.ts';
import { classificarBandeira } from './scoring.ts';
import { consultarPessoa, normalizarCpf, normalizarTelefoneParaBdc } from './bigdatacorp.ts';
import type { BdcPessoaCadastro, BdcLookupResult, ProcessoJudicial } from './types.ts';

type SearchMode = 'name_phone' | 'cpf';

type NameMatchStatus =
  | 'match'
  | 'mismatch'
  | 'not_provided'
  | 'not_available';

interface NameCrosscheckAuditoria {
  status: NameMatchStatus;
  nomeDigitadoNormalizado?: string;
  nomeOficialNormalizado?: string;
  primeiroDigitado?: string;
  ultimoDigitado?: string;
  primeiroOficial?: string;
  ultimoOficial?: string;
}

interface BackgroundCheckNamePhoneCacheRow {
  created_at: string;
  raw_data: { bdc?: unknown } | null | undefined;
  target_name: string | null;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 1. Autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonError('Não autenticado', 401);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    if (authError || !user) {
      return jsonError('Não autenticado', 401);
    }

    // 2. Valida plano via perfil (atualizado pelo webhook do RevenueCat)
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, plan_expires_at, searches_count')
      .eq('id', user.id)
      .single();

    const isAnnualActive =
      profile?.plan === 'annual' &&
      profile.plan_expires_at &&
      new Date(profile.plan_expires_at) > new Date();

    if (!isAnnualActive) {
      return jsonError('Assinatura necessária para realizar busca', 402);
    }

    // 3. Body + validação por modo
    const body = await req.json();
    const searchModeRaw = body.searchMode;
    if (searchModeRaw !== 'name_phone' && searchModeRaw !== 'cpf') {
      return jsonError('Modo de pesquisa inválido', 400);
    }
    const searchMode = searchModeRaw as SearchMode;

    let nomeCompleto = '';
    let cpfNormalizado = '';
    let phoneNormalizado = '';
    let birthDateOpt: string | undefined;

    if (searchMode === 'name_phone') {
      const name = body.name;
      if (!name || typeof name !== 'string' || name.trim().length < 3) {
        return jsonError('Nome inválido', 400);
      }
      const phone = body.phone;
      if (phone === undefined || phone === null || typeof phone !== 'string') {
        return jsonError('Telefone inválido', 400);
      }
      phoneNormalizado = normalizarTelefone(phone);
      if (phoneNormalizado.length < 10 || phoneNormalizado.length > 11) {
        return jsonError('Telefone inválido', 400);
      }

      const bd = body.birthDate;
      if (bd !== undefined && bd !== null && bd !== '') {
        if (typeof bd !== 'string' || bd.length < 10) {
          return jsonError('Data de nascimento inválida', 400);
        }
        birthDateOpt = bd;
      }

      nomeCompleto = name.trim();
    } else {
      const cpf = body.cpf;
      if (cpf === undefined || cpf === null || String(cpf).trim() === '') {
        return jsonError('CPF inválido', 400);
      }
      cpfNormalizado = normalizarCpf(String(cpf));
      if (!cpfNormalizado) {
        return jsonError('CPF inválido', 400);
      }
    }

    console.log(
      `[BackgroundCheck] Modo=${searchMode} — nomeJud inicial=${searchMode === 'name_phone' ? nomeCompleto : '(após BDC)'}`,
    );

    // 4. Mini-cache 7d BDC
    let cachedBdc: BdcPessoaCadastro | null = null;
    const limite7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      if (searchMode === 'cpf' && cpfNormalizado) {
        const { data: cachedRows, error: cacheError } = await supabase
          .from('background_checks')
          .select('created_at, raw_data')
          .eq('target_cpf', cpfNormalizado)
          .gt('created_at', limite7d)
          .order('created_at', { ascending: false })
          .limit(1);

        if (cacheError) {
          console.log('[BackgroundCheck] erro no mini-cache BDC (CPF):', cacheError);
        } else {
          const rawBdc = cachedRows?.[0]?.raw_data?.bdc;
          if (isBdcCacheUsable(rawBdc)) {
            cachedBdc = rawBdc as BdcPessoaCadastro;
            console.log('[BackgroundCheck] BDC cache hit (7d, CPF)');
          } else if (rawBdc) {
            console.log('[BackgroundCheck] BDC cache inválido/corrompido; consultando API');
          }
        }
      } else if (searchMode === 'name_phone' && phoneNormalizado) {
        const nomeNormalizadoParaCache = normalizarNomeParaCache(nomeCompleto);
        const { data: cachedRows, error: cacheError } = await supabase
          .from('background_checks')
          .select('created_at, raw_data, target_name')
          .eq('target_phone', phoneNormalizado)
          .gt('created_at', limite7d)
          .order('created_at', { ascending: false })
          .limit(10);

        const cachedRowsTyped = cachedRows as BackgroundCheckNamePhoneCacheRow[] | null;

        const cachedRow = cachedRowsTyped?.find((row) => {
          if (!row.target_name) return false;
          return normalizarNomeParaCache(row.target_name) === nomeNormalizadoParaCache;
        });

        if (cacheError) {
          console.log('[BackgroundCheck] erro no mini-cache BDC (telefone):', cacheError);
        } else {
          const rawBdc = cachedRow?.raw_data?.bdc;
          if (isBdcCacheUsable(rawBdc)) {
            cachedBdc = rawBdc as BdcPessoaCadastro;
            console.log('[BackgroundCheck] BDC cache hit (7d, telefone+nome)');
          } else if (rawBdc) {
            console.log('[BackgroundCheck] BDC cache inválido/corrompido; consultando API');
          }
        }
      }
    } catch (err) {
      console.log('[BackgroundCheck] erro inesperado no mini-cache BDC:', err);
    }

    let bdcResult: BdcLookupResult | null = null;
    let processos: ProcessoJudicial[] = [];

    if (cachedBdc) {
      bdcResult = {
        ok: true,
        fromCache: true,
        data: cachedBdc,
      };
      processos = [];
      console.log('[BackgroundCheck] Usando cache BDC');
    } else {
      const consultaOpts: { cpf?: string; nome?: string; telefone?: string; dataNascimento?: string } =
        searchMode === 'cpf'
          ? { cpf: cpfNormalizado }
          : { nome: nomeCompleto, telefone: phoneNormalizado, dataNascimento: birthDateOpt };

      const consulta = await consultarPessoa(consultaOpts);

      bdcResult = {
        ok: consulta.cadastro.ok,
        fromCache: false,
        data: consulta.cadastro.data,
        errorType: consulta.cadastro.errorType,
        statusCode: consulta.cadastro.statusCode,
      };
      processos = consulta.processos;

      if (!bdcResult.ok || !bdcResult.data) {
        console.log(
          `[BackgroundCheck] BDC falhou ou sem dados: errorType=${bdcResult.errorType}`,
        );
        return new Response(
          JSON.stringify({
            not_found: true,
            reason: 'not_found',
            search_mode: searchMode,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      }
    }

    const bdcData = bdcResult?.ok ? bdcResult.data : null;

    const nameCrosscheck: NameCrosscheckAuditoria = (() => {
      if (searchMode === 'cpf') {
        return { status: 'not_provided' };
      }
      const oficial = bdcData?.nomeCompleto?.trim();
      if (!bdcResult?.ok || !oficial) {
        return { status: 'not_available' };
      }
      return compararNomes(nomeCompleto, oficial);
    })();

    const nomeParaClaude =
      searchMode === 'name_phone'
        ? nomeCompleto
        : (bdcData?.nomeCompleto?.trim() ||
          'a pessoa pesquisada por CPF');

    const bdcMeta = {
      attempted: true,
      searchMode,
      usedCache: Boolean(bdcResult?.fromCache),
      ok: Boolean(bdcResult?.ok),
      errorType: bdcResult?.errorType ?? null,
      statusCode: bdcResult?.statusCode ?? null,
      cacheWindowHours: 168,
    };

    console.log(
      `[BackgroundCheck] Encontrados: ${processos.length} processos, cadastro ${bdcResult?.ok ? 'ok' : 'indisponível'}, name_crosscheck=${nameCrosscheck.status}`,
    );

    const scoring = classificarBandeira(processos, bdcData);
    console.log(
      `[BackgroundCheck] Scoring: bandeira=${scoring.bandeira} motivos=${scoring.motivos.length} graves=${scoring.criminaisGravesCount}`,
    );

    const analise = await analisarComClaude(nomeParaClaude, processos, {
      bdcProfile: bdcData
        ? {
          nomeCompleto: bdcData.nomeCompleto,
          dataNascimento: bdcData.dataNascimento,
          idade: bdcData.idade,
          cidade: bdcData.enderecos?.[0]?.cidade,
          uf: bdcData.enderecos?.[0]?.uf,
        }
        : undefined,
      bandeiraJaClassificada: scoring.bandeira,
    });

    const bandeiraFinal = scoring.bandeira;
    const criminaisFinal = Math.max(
      analise.criminalProcessesCount,
      scoring.criminaisGravesCount + scoring.criminaisLevesCount,
    );

    const targetName =
      searchMode === 'name_phone'
        ? nomeCompleto
        : (bdcData?.nomeCompleto?.trim() || null);
    const targetCpf = searchMode === 'cpf' ? cpfNormalizado : null;
    const targetBirth =
      birthDateOpt !== undefined ? birthDateOpt : null;
    const targetPhone = searchMode === 'name_phone' ? phoneNormalizado : null;

    const { data: saved, error: saveError } = await supabase
      .from('background_checks')
      .insert({
        user_id: user.id,
        target_name: targetName,
        target_cpf: targetCpf,
        target_birth_date: targetBirth,
        target_phone: targetPhone,
        flag: bandeiraFinal,
        summary: analise.summary,
        processes_count: processos.length,
        criminal_processes_count: criminaisFinal,
        raw_data: {
          processes: processos.slice(0, 50),
          bdc: bdcData,
          bdc_meta: bdcMeta,
          name_crosscheck: nameCrosscheck,
          flag_reasons: scoring.motivos,
        },
      })
      .select()
      .single();

    if (saveError) {
      console.log('[BackgroundCheck] erro ao salvar:', saveError);
      return jsonError('Erro ao salvar resultado', 500);
    }

    try {
      const { error: rpcError } = await supabase.rpc(
        'increment_searches',
        { user_id_input: user.id },
      );
      if (rpcError) {
        await supabase
          .from('profiles')
          .update({
            searches_count: (profile?.searches_count ?? 0) + 1,
          })
          .eq('id', user.id);
      }
    } catch {
      await supabase
        .from('profiles')
        .update({
          searches_count: (profile?.searches_count ?? 0) + 1,
        })
        .eq('id', user.id);
    }

    return new Response(
      JSON.stringify({
        id: saved.id,
        flag: saved.flag,
        summary: saved.summary,
        processes_count: saved.processes_count,
        criminal_processes_count: saved.criminal_processes_count,
        cadastro_validado: Boolean(bdcResult?.ok && bdcData),
        search_mode: searchMode,
        name_match_status: nameCrosscheck.status,
        not_found: false,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (err) {
    console.log('[BackgroundCheck] erro geral:', err);
    return jsonError('Erro interno', 500);
  }
});

function normalizarNomeParaComparacao(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function extrairPrimeiroEUltimo(norm: string): { primeiro: string; ultimo: string } {
  const parts = norm.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { primeiro: '', ultimo: '' };
  if (parts.length === 1) return { primeiro: parts[0], ultimo: parts[0] };
  return { primeiro: parts[0], ultimo: parts[parts.length - 1] };
}

function compararNomes(
  digitado: string,
  oficial: string,
): NameCrosscheckAuditoria {
  const dNorm = normalizarNomeParaComparacao(digitado);
  const oNorm = normalizarNomeParaComparacao(oficial);
  const { primeiro: pd, ultimo: ud } = extrairPrimeiroEUltimo(dNorm);
  const { primeiro: po, ultimo: uo } = extrairPrimeiroEUltimo(oNorm);

  const digitadoUmaPalavra =
    dNorm.split(/\s+/).filter(Boolean).length === 1;
  const match = digitadoUmaPalavra
    ? pd.length > 0 && po.length > 0 && pd === po
    : pd.length > 0 && po.length > 0 && ud.length > 0 && uo.length > 0 &&
      pd === po && ud === uo;

  return {
    status: match ? 'match' : 'mismatch',
    nomeDigitadoNormalizado: dNorm,
    nomeOficialNormalizado: oNorm,
    primeiroDigitado: pd,
    ultimoDigitado: ud,
    primeiroOficial: po,
    ultimoOficial: uo,
  };
}

function isBdcCacheUsable(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const d = raw as Record<string, unknown>;

  const nome = typeof d.nomeCompleto === 'string' ? d.nomeCompleto.trim() : '';
  const cpf = typeof d.cpf === 'string' ? d.cpf.trim() : '';
  const dataNascimento =
    typeof d.dataNascimento === 'string' ? d.dataNascimento.trim() : '';

  return Boolean(nome || cpf || dataNascimento);
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

function normalizarNomeParaCache(nome: string): string {
  if (!nome) return '';
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizarTelefone(phone: string): string {
  return phone.replace(/\D/g, '');
}
