import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
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

    const userId = user.id;

    const profile = await fetchProfile(supabase, userId);
    const backgroundChecks = await fetchRows(
      supabase,
      'background_checks',
      () =>
        supabase
          .from('background_checks')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
    );
    const payments = await fetchRows(supabase, 'payments', () =>
      supabase.from('payments').select('*').eq('user_id', userId),
    );
    const pushTokens = await fetchRows(supabase, 'push_tokens', () =>
      supabase.from('push_tokens').select('*').eq('user_id', userId),
    );
    const emergencyContacts = await fetchRows(supabase, 'emergency_contacts', () =>
      supabase.from('emergency_contacts').select('*').eq('user_id', userId),
    );
    const safePlaces = await fetchRows(supabase, 'safe_places', () =>
      supabase.from('safe_places').select('*').eq('user_id', userId),
    );
    const safetySessions = await fetchRows(supabase, 'safety_sessions', () =>
      supabase
        .from('safety_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('started_at', { ascending: false }),
    );
    const sosAlerts = await fetchRows(supabase, 'sos_alerts', () =>
      supabase
        .from('sos_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }),
    );

    const exportData = {
      exportadoEm: new Date().toISOString(),
      conta: {
        id: userId,
        email: user.email,
        criadaEm: user.created_at,
      },
      perfil: profile,
      pesquisas: backgroundChecks,
      pagamentos: payments,
      tokensNotificacao: pushTokens,
      contatosEmergencia: emergencyContacts,
      lugaresSeguros: safePlaces,
      sessoesModoSeguro: safetySessions,
      alertasSos: sosAlerts,
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[export-data] erro inesperado:', err);
    return jsonError('Erro interno', 500);
  }
});

async function fetchProfile(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) {
    console.error('[export-data] erro ao buscar profiles:', error);
    return null;
  }

  return data;
}

async function fetchRows<T>(
  supabase: SupabaseClient,
  table: string,
  query: () => Promise<{ data: T[] | null; error: { message?: string; code?: string } | null }>,
): Promise<T[]> {
  try {
    const { data, error } = await query();

    if (error) {
      console.error(`[export-data] erro ao buscar ${table}:`, error);
      return [];
    }

    return data ?? [];
  } catch (err) {
    console.error(`[export-data] erro inesperado ao buscar ${table}:`, err);
    return [];
  }
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
