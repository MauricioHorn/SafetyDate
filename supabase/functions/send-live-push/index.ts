import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

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
    const { session_id, user_id, note } = await req.json();
    if (!user_id) {
      return jsonError('user_id é obrigatório', 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // nome de quem ativou
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user_id)
      .maybeSingle();
    const senderName = profile?.full_name?.split(' ')[0] || 'Uma amiga';

    // destinatários = quem aceitou ver a localização dessa pessoa (viewers)
    const { data: shares } = await supabase
      .from('location_shares')
      .select('viewer_id')
      .eq('owner_id', user_id)
      .eq('status', 'accepted');

    const viewerIds = (shares || []).map((s: { viewer_id: string }) => s.viewer_id);
    if (viewerIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: recipientTokens } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .in('user_id', viewerIds);

    const cleanNote = (note || '').toString().trim();
    const body = cleanNote
      ? `${senderName} ativou a localização ao vivo: ${cleanNote}`
      : `${senderName} ativou a localização ao vivo`;

    const messages = (recipientTokens || []).map((tokenRow: { expo_push_token: string }) => ({
      to: tokenRow.expo_push_token,
      sound: 'default',
      title: '📍 ELAS',
      body,
      data: { session_id, type: 'live_started' },
    }));

    if (messages.length > 0) {
      await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messages),
      });
    }

    return new Response(JSON.stringify({ sent: messages.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    console.error('[send-live-push] error:', error);
    return jsonError('Erro interno', 500);
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
