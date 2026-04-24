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
    const { alert_id, user_id } = await req.json();
    if (!alert_id || !user_id) {
      return jsonError('alert_id e user_id são obrigatórios', 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user_id)
      .maybeSingle();

    const senderName = profile?.full_name?.split(' ')[0] || 'Alguém';

    const { data: contacts } = await supabase
      .from('emergency_contacts')
      .select('id')
      .eq('user_id', user_id)
      .limit(5);

    const contactIds = (contacts || []).map((contact: { id: string }) => contact.id);
    if (contactIds.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: recipientTokens } = await supabase
      .from('push_tokens')
      .select('expo_push_token')
      .in('user_id', contactIds);

    const messages = (recipientTokens || []).map((tokenRow: { expo_push_token: string }) => ({
      to: tokenRow.expo_push_token,
      sound: 'default',
      title: `🚨 ${senderName} precisa de você!`,
      body: 'Toque pra ver localização',
      data: { alert_id, type: 'sos_alert' },
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
    console.error('[send-sos-push] error:', error);
    return jsonError('Erro interno', 500);
  }
});

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
