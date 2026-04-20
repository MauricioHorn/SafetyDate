/**
 * SafetyDate - Background Check Edge Function
 *
 * Orquestra toda a cadeia:
 * 1. Autentica o usuário
 * 2. Valida plano (free → bloqueia, annual ativo → permite)
 * 3. Busca paralela em DataJud + DOU
 * 4. Envia dados para Claude fazer análise
 * 5. Salva resultado no banco
 * 6. Retorna relatório
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { buscarProcessosPorNome, classificarProcesso } from './datajud.ts';
import { buscarNoDOU } from './dou.ts';
import { analisarComClaude } from './claude.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
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
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return jsonError('Não autenticado', 401);
    }

    // 2. Valida plano via perfil (atualizado pelo webhook do RevenueCat)
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, plan_expires_at')
      .eq('id', user.id)
      .single();

    const isAnnualActive =
      profile?.plan === 'annual' &&
      profile.plan_expires_at &&
      new Date(profile.plan_expires_at) > new Date();

    if (!isAnnualActive) {
      return jsonError('Assinatura necessária para realizar busca', 402);
    }

    // 3. Valida input
    const { name, birthDate, cpf, phone } = await req.json();

    if (!name || typeof name !== 'string' || name.trim().length < 3) {
      return jsonError('Nome inválido', 400);
    }
    if (!birthDate || birthDate.length < 10) {
      return jsonError('Data de nascimento inválida', 400);
    }

    const nomeCompleto = name.trim();

    console.log(`[BackgroundCheck] Iniciando busca para: ${nomeCompleto}`);

    // 4. Busca em paralelo DataJud + DOU
    const [processos, publicacoesDOU] = await Promise.all([
      buscarProcessosPorNome(nomeCompleto, birthDate),
      buscarNoDOU(nomeCompleto),
    ]);

    console.log(
      `[BackgroundCheck] Encontrados: ${processos.length} processos, ${publicacoesDOU.length} publicações DOU`
    );

    // 5. Análise via Claude
    const analise = await analisarComClaude(nomeCompleto, processos, publicacoesDOU);

    // Conta criminais via classificador local (double check)
    const criminaisLocal = processos.filter(
      (p) => classificarProcesso(p) === 'criminal'
    ).length;

    const criminaisFinal = Math.max(
      analise.criminalProcessesCount,
      criminaisLocal
    );

    // 6. Salva no banco
    const { data: saved, error: saveError } = await supabase
      .from('background_checks')
      .insert({
        user_id: user.id,
        target_name: nomeCompleto,
        target_cpf: cpf || null,
        target_birth_date: birthDate,
        target_phone: phone || null,
        flag: analise.flag,
        summary: analise.summary,
        processes_count: processos.length,
        criminal_processes_count: criminaisFinal,
        raw_data: {
          processes: processos.slice(0, 50),
          dou: publicacoesDOU.slice(0, 20),
        },
      })
      .select()
      .single();

    if (saveError) {
      console.log('[BackgroundCheck] erro ao salvar:', saveError);
      return jsonError('Erro ao salvar resultado', 500);
    }

    // Incrementa contador
    await supabase.rpc('increment_searches', { user_id_input: user.id }).catch(() => {
      // Fallback: update direto
      supabase
        .from('profiles')
        .update({ searches_count: (profile as any)?.searches_count + 1 || 1 })
        .eq('id', user.id);
    });

    return new Response(
      JSON.stringify({
        id: saved.id,
        flag: saved.flag,
        summary: saved.summary,
        processes_count: saved.processes_count,
        criminal_processes_count: saved.criminal_processes_count,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (err) {
    console.log('[BackgroundCheck] erro geral:', err);
    return jsonError('Erro interno', 500);
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
