import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const SISTEMA_USER_ID = 'a8b103f0-9e08-47bd-9dd7-d040b1324713';

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

    // Client 1: autentica o usuário que está pedindo (usa o token do usuário)
    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) {
      return jsonError('Não autenticado', 401);
    }

    // Client 2: admin puro (service role, SEM header de usuário) — pra operações privilegiadas
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const userId = user.id;

    if (userId === SISTEMA_USER_ID) {
      return jsonError('Operação não permitida', 403);
    }

    const { error: reassignError } = await supabaseAdmin
      .from('background_checks')
      .update({ user_id: SISTEMA_USER_ID })
      .eq('user_id', userId);

    if (reassignError) {
      console.error('[delete-account] erro ao reatribuir background_checks:', reassignError);
      return jsonError('Erro ao processar exclusão (reatribuição)', 500);
    }

    const { error: pushTokensError } = await supabaseAdmin
      .from('push_tokens')
      .delete()
      .eq('user_id', userId);

    if (pushTokensError) {
      console.error('[delete-account] erro ao apagar push_tokens:', pushTokensError);
    }

    const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteUserError) {
      console.error('[delete-account] erro ao deletar auth user:', deleteUserError);
      return jsonError('Erro ao deletar conta', 500);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[delete-account] erro inesperado:', err);
    return jsonError('Erro interno', 500);
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
