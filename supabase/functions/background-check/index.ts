/**
 * SafetyDate - Background Check Edge Function
 *
 * Orquestra toda a cadeia:
 * 1. Autentica o usuário
 * 2. Valida plano (free → bloqueia, annual ativo → permite)
 * 3. Busca paralela em DataJud + DOU (e Direct Data conforme o modo)
 * 4. Envia dados para Claude fazer análise
 * 5. Salva resultado no banco
 * 6. Retorna relatório
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { classificarProcesso } from './datajud.ts';
// NOTA: buscarProcessosPorNome (DataJud) foi desativado temporariamente.
// A API pública do CNJ não suporta busca por nome de forma confiável.
// Substituir por outra fonte de dados quando integrar (Direct Data, Escavador, DataLawyer, etc).
import { buscarNoDOU } from './dou.ts';
import { analisarComClaude } from './claude.ts';
import { classificarBandeira } from './scoring.ts';
import {
  buscarCadastroPorCpf,
  calcularRangeDataPorIdade,
  compararTelefone,
  interseccaoCandidatos,
  normalizarCpf,
  normalizarTelefone,
  processarIdsCandidato,
  pesquisaAvancadaPorNome,
  pesquisaAvancadaPorTelefone,
  viewSearchPorUid,
  type DirectdCadastroSanitizado,
  type DirectdLookupResult,
  type PesquisaAvancadaCandidato,
  type PhoneCrosscheck,
} from './directd.ts';

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

type NeedsMoreInfo = 'age' | 'exact_date';
type NotFoundReason = 'name_not_found' | 'no_match_after_all_filters';
type IntermediateReason = 'multiple_matches' | 'no_intersection' | 'no_results_after_filter';

interface AdditionalFilters {
  idadeAproximada?: number;
  dataNascimento?: string;
}

interface ResolucaoMatchSucesso {
  type: 'match';
  cpf: string;
  candidato: PesquisaAvancadaCandidato;
}
interface ResolucaoNeedsInfo {
  type: 'needs_more_info';
  needsMoreInfo: NeedsMoreInfo;
  reason: IntermediateReason;
  candidateCount: number;
}
interface ResolucaoNotFound {
  type: 'not_found';
  reason: NotFoundReason;
}
interface ResolucaoErro {
  type: 'error';
  message: string;
}
type ResolucaoResultado = ResolucaoMatchSucesso | ResolucaoNeedsInfo | ResolucaoNotFound | ResolucaoErro;

interface BackgroundCheckNamePhoneCacheRow {
  created_at: string;
  raw_data: { directd?: unknown } | null | undefined;
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
    let additionalFilters: AdditionalFilters | undefined;

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

      const af = body.additionalFilters;
      if (af && typeof af === 'object') {
        additionalFilters = {};
        if (typeof af.idadeAproximada === 'number' && af.idadeAproximada > 0 && af.idadeAproximada < 150) {
          additionalFilters.idadeAproximada = Math.floor(af.idadeAproximada);
        }
        if (typeof af.dataNascimento === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(af.dataNascimento)) {
          additionalFilters.dataNascimento = af.dataNascimento;
        }
      }
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
      `[BackgroundCheck] Modo=${searchMode} — nomeJud inicial=${searchMode === 'name_phone' ? nomeCompleto : '(após DirectD)'}`,
    );

    // 4. Mini-cache 7d Direct Data
    let cachedDirectd: DirectdCadastroSanitizado | null = null;
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
          console.log('[BackgroundCheck] erro no mini-cache DirectD (CPF):', cacheError);
        } else {
          const rawDirectd = cachedRows?.[0]?.raw_data?.directd;
          if (isDirectdCacheUsable(rawDirectd)) {
            cachedDirectd = rawDirectd as DirectdCadastroSanitizado;
            console.log('[BackgroundCheck] DirectD cache hit (7d, CPF)');
          } else if (rawDirectd) {
            console.log('[BackgroundCheck] DirectD cache inválido/corrompido; consultando API');
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

        // Filtra em memória pra encontrar cache que bata com nome também (normalizado)
        const cachedRow = cachedRowsTyped?.find((row) => {
          if (!row.target_name) return false;
          return normalizarNomeParaCache(row.target_name) === nomeNormalizadoParaCache;
        });

        if (cacheError) {
          console.log('[BackgroundCheck] erro no mini-cache DirectD (telefone):', cacheError);
        } else {
          const rawDirectd = cachedRow?.raw_data?.directd;
          if (isDirectdCacheUsable(rawDirectd)) {
            cachedDirectd = rawDirectd as DirectdCadastroSanitizado;
            console.log('[BackgroundCheck] DirectD cache hit (7d, telefone+nome)');
          } else if (rawDirectd) {
            console.log('[BackgroundCheck] DirectD cache inválido/corrompido; consultando API');
          }
        }
      }
    } catch (err) {
      console.log('[BackgroundCheck] erro inesperado no mini-cache DirectD:', err);
    }

    let directdResult: DirectdLookupResult | null = null;
    let processos: Parameters<typeof classificarProcesso>[0][];
    let publicacoesDOU: Awaited<ReturnType<typeof buscarNoDOU>>;

    if (searchMode === 'name_phone') {
      if (cachedDirectd) {
        directdResult = {
          ok: true,
          fromCache: true,
          data: cachedDirectd,
        };
        processos = [];
        publicacoesDOU = await buscarNoDOU(nomeCompleto);
        console.log('[BackgroundCheck] DataJud desativado temporariamente — processos=[]');
      } else {
        const resolucao = await resolverCandidatoPorNomeETelefone(
          nomeCompleto,
          phoneNormalizado,
          additionalFilters,
        );

        if (resolucao.type === 'needs_more_info') {
          return new Response(
            JSON.stringify({
              needs_more_info: resolucao.needsMoreInfo,
              reason: resolucao.reason,
              candidate_count: resolucao.candidateCount,
              search_mode: searchMode,
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (resolucao.type === 'not_found') {
          return new Response(
            JSON.stringify({
              not_found: true,
              reason: resolucao.reason,
              search_mode: searchMode,
            }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (resolucao.type === 'error') {
          return jsonError(resolucao.message, 502);
        }

        // Match certeiro. Vai buscar dados completos via ProcessingIds + ViewSearch.
        const proc = await processarIdsCandidato(
          [resolucao.candidato.id],
          `ELAS - ${nomeCompleto}`,
        );
        if (proc.ok && proc.searchUid) {
          const view = await viewSearchPorUid(proc.searchUid);
          if (view.ok && view.data) {
            directdResult = view;
          } else {
            console.log('[BackgroundCheck] viewSearchPorUid falhou — usando cadastro parcial do candidato');
            directdResult = {
              ok: true,
              fromCache: false,
              data: cadastroParcialDoCandidato(resolucao.candidato),
            };
          }
        } else {
          console.log('[BackgroundCheck] processarIdsCandidato falhou — usando cadastro parcial do candidato');
          directdResult = {
            ok: true,
            fromCache: false,
            data: cadastroParcialDoCandidato(resolucao.candidato),
          };
        }

        const nomeJud =
          directdResult.data?.nomeCompleto?.trim() || nomeCompleto;
        processos = [];
        publicacoesDOU = await buscarNoDOU(nomeJud);
        console.log('[BackgroundCheck] DataJud desativado temporariamente — processos=[]');
      }
    } else {
      const directdPromise: Promise<DirectdLookupResult | null> = cachedDirectd
        ? Promise.resolve({
          ok: true,
          fromCache: true,
          data: cachedDirectd,
        } as DirectdLookupResult)
        : buscarCadastroPorCpf(cpfNormalizado);

      directdResult = await directdPromise;
      const nomeJud =
        directdResult?.ok && directdResult.data?.nomeCompleto?.trim()
          ? directdResult.data.nomeCompleto.trim()
          : '';
      if (!nomeJud) {
        console.log(
          '[BackgroundCheck] Modo CPF sem nome no cadastro — DataJud/DOU com nome vazio (fail-soft)',
        );
      }
      processos = [];
      publicacoesDOU = await buscarNoDOU(nomeJud);
      console.log('[BackgroundCheck] DataJud desativado temporariamente — processos=[]');
    }

    const directdData = directdResult?.ok ? directdResult.data : null;

    const phoneForCrosscheck =
      searchMode === 'name_phone'
        ? phoneNormalizado
        : undefined;
    const phoneCrosscheck: PhoneCrosscheck = compararTelefone(
      phoneForCrosscheck,
      directdData?.telefones,
    );

    const nameCrosscheck: NameCrosscheckAuditoria = (() => {
      if (searchMode === 'cpf') {
        return { status: 'not_provided' };
      }
      const oficial = directdData?.nomeCompleto?.trim();
      if (!directdResult?.ok || !oficial) {
        return { status: 'not_available' };
      }
      return compararNomes(nomeCompleto, oficial);
    })();

    const nomeParaClaude =
      searchMode === 'name_phone'
        ? nomeCompleto
        : (directdData?.nomeCompleto?.trim() ||
          'a pessoa pesquisada por CPF');

    const directdMeta = {
      attempted: true,
      searchMode,
      usedCache: Boolean(directdResult?.fromCache),
      ok: Boolean(directdResult?.ok),
      errorType: directdResult?.errorType ?? null,
      statusCode: directdResult?.statusCode ?? null,
      cacheWindowHours: 168,
    };

    console.log(
      `[BackgroundCheck] Encontrados: ${processos.length} processos, ${publicacoesDOU.length} publicações DOU, cadastro ${directdResult?.ok ? 'ok' : 'indisponível'}, name_crosscheck=${nameCrosscheck.status}`,
    );

    // 6. Análise via Claude
    const scoring = classificarBandeira(processos, publicacoesDOU, directdData);
    console.log(
      `[BackgroundCheck] Scoring: bandeira=${scoring.bandeira} motivos=${scoring.motivos.length} graves=${scoring.criminaisGravesCount}`,
    );

    const analise = await analisarComClaude(nomeParaClaude, processos, publicacoesDOU, {
      directdProfile: directdData
        ? {
          nomeCompleto: directdData.nomeCompleto,
          dataNascimento: directdData.dataNascimento,
          idade: directdData.idade,
          cidade: directdData.enderecos?.[0]?.cidade,
          uf: directdData.enderecos?.[0]?.uf,
        }
        : undefined,
      phoneCrosscheck: phoneCrosscheck
        ? { status: phoneCrosscheck.status }
        : undefined,
      bandeiraJaClassificada: scoring.bandeira,
    });

    const criminaisLocal = processos.filter(
      (p) => classificarProcesso(p) === 'criminal',
    ).length;

    const bandeiraFinal = scoring.bandeira;
    const criminaisFinal = Math.max(
      analise.criminalProcessesCount,
      scoring.criminaisGravesCount,
      criminaisLocal,
    );

    const targetName =
      searchMode === 'name_phone'
        ? nomeCompleto
        : (directdData?.nomeCompleto?.trim() || null);
    const targetCpf = searchMode === 'cpf' ? cpfNormalizado : null;
    const targetBirth =
      birthDateOpt !== undefined ? birthDateOpt : null;
    const targetPhone = searchMode === 'name_phone' ? phoneNormalizado : null;

    // 7. Salva no banco
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
          dou: publicacoesDOU.slice(0, 20),
          directd: directdData,
          directd_meta: directdMeta,
          phone_crosscheck: phoneCrosscheck,
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
        cadastro_validado: Boolean(directdResult?.ok && directdData),
        phone_match_status: phoneCrosscheck.status,
        search_mode: searchMode,
        name_match_status: nameCrosscheck.status,
        needs_more_info: null,
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

async function resolverCandidatoPorNomeETelefone(
  nome: string,
  telefone: string,
  filtros?: AdditionalFilters,
): Promise<ResolucaoResultado> {
  const filtrosBusca: { dateOfBirthStart?: string; dateOfBirthEnd?: string } = {};
  if (filtros?.dataNascimento) {
    filtrosBusca.dateOfBirthStart = filtros.dataNascimento;
    filtrosBusca.dateOfBirthEnd = filtros.dataNascimento;
  } else if (filtros?.idadeAproximada) {
    const range = calcularRangeDataPorIdade(filtros.idadeAproximada, 3);
    filtrosBusca.dateOfBirthStart = range.dateOfBirthStart;
    filtrosBusca.dateOfBirthEnd = range.dateOfBirthEnd;
  }

  const buscaA = await pesquisaAvancadaPorNome(nome, filtrosBusca);
  if (!buscaA.ok) {
    console.log(`[Resolver] busca por nome falhou: ${buscaA.errorType}`);
    return { type: 'error', message: 'Falha ao consultar Direct Data (nome)' };
  }

  const listaA = buscaA.candidatos;

  if (listaA.length === 1) {
    return { type: 'match', cpf: listaA[0].cpf, candidato: listaA[0] };
  }

  if (listaA.length === 0) {
    if (filtros?.idadeAproximada !== undefined && filtros?.dataNascimento === undefined) {
      return {
        type: 'needs_more_info',
        needsMoreInfo: 'exact_date',
        reason: 'no_results_after_filter',
        candidateCount: 0,
      };
    }
    if (filtros?.dataNascimento) {
      return { type: 'not_found', reason: 'no_match_after_all_filters' };
    }
    return { type: 'not_found', reason: 'name_not_found' };
  }

  let candidatosFiltrados = listaA;

  const semFiltrosAplicados =
    filtros === undefined ||
    (filtros.idadeAproximada === undefined && filtros.dataNascimento === undefined);

  if (semFiltrosAplicados) {
    const buscaB = await pesquisaAvancadaPorTelefone(telefone);
    if (!buscaB.ok) {
      console.log(`[Resolver] busca por telefone falhou: ${buscaB.errorType} — caindo para escada de filtros`);
    } else {
      const intersec = interseccaoCandidatos(listaA, buscaB.candidatos);
      console.log(`[Resolver] interseccao: A=${listaA.length} B=${buscaB.candidatos.length} ∩=${intersec.length}`);
      if (intersec.length === 1) {
        return { type: 'match', cpf: intersec[0].cpf, candidato: intersec[0] };
      }
      if (intersec.length > 1) {
        candidatosFiltrados = intersec;
      }
    }
  }

  if (filtros?.dataNascimento) {
    return { type: 'not_found', reason: 'no_match_after_all_filters' };
  }
  if (filtros?.idadeAproximada !== undefined) {
    return {
      type: 'needs_more_info',
      needsMoreInfo: 'exact_date',
      reason: 'multiple_matches',
      candidateCount: candidatosFiltrados.length,
    };
  }
  return {
    type: 'needs_more_info',
    needsMoreInfo: 'age',
    reason: candidatosFiltrados.length === listaA.length ? 'no_intersection' : 'multiple_matches',
    candidateCount: candidatosFiltrados.length,
  };
}

function cadastroParcialDoCandidato(c: PesquisaAvancadaCandidato): DirectdCadastroSanitizado {
  return {
    nomeCompleto: c.fullName?.trim() || undefined,
    dataNascimento: c.dateOfBirth?.trim() || undefined,
    nomeMae: c.motherName?.trim() || undefined,
    telefones: [],
    enderecos: [],
    source: 'directd',
    consultadoEm: new Date().toISOString(),
  };
}

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

function isDirectdCacheUsable(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const d = raw as Record<string, unknown>;

  const nome = typeof d.nomeCompleto === 'string' ? d.nomeCompleto.trim() : '';
  const dataNascimento =
    typeof d.dataNascimento === 'string' ? d.dataNascimento.trim() : '';
  const telefones = Array.isArray(d.telefones) ? d.telefones : [];
  const enderecos = Array.isArray(d.enderecos) ? d.enderecos : [];

  return Boolean(nome || dataNascimento || telefones.length > 0 || enderecos.length > 0);
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
