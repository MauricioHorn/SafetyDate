/**
 * SafetyDate - RevenueCat Webhook
 *
 * O RevenueCat notifica este endpoint quando eventos de assinatura acontecem:
 * - INITIAL_PURCHASE   → primeira compra
 * - RENEWAL            → renovou a assinatura
 * - CANCELLATION       → usuário cancelou (ainda tem acesso até expirar)
 * - EXPIRATION         → assinatura expirou de fato (perde acesso)
 * - PRODUCT_CHANGE     → upgrade/downgrade
 * - NON_RENEWING_PURCHASE → compra de produto não-renovável (ex: consulta avulsa)
 *
 * O RevenueCat é a "fonte da verdade" da assinatura — este webhook
 * apenas mantém o profile do Supabase sincronizado para uso em relatórios.
 *
 * Configuração em:
 * https://app.revenuecat.com → Seu app → Integrations → Webhooks
 */

import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');

serve(async (req) => {
  try {
    // 1. Valida o secret do webhook (enviado pelo RevenueCat no header Authorization)
    if (WEBHOOK_SECRET) {
      const authHeader = req.headers.get('Authorization');
      if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
        console.log('[revenuecat-webhook] secret inválido');
        return new Response('unauthorized', { status: 401 });
      }
    }

    const body = await req.json();
    const event = body.event;

    if (!event) {
      return new Response('no event', { status: 400 });
    }

    const eventType = event.type;
    const appUserId = event.app_user_id; // = user.id do Supabase
    const productId = event.product_id;
    const expirationMs = event.expiration_at_ms;
    const eventTimestamp = event.event_timestamp_ms;

    console.log(`[revenuecat-webhook] ${eventType} - user ${appUserId} - product ${productId}`);

    if (!appUserId) {
      return new Response('no user id', { status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // 2. Define novo plano baseado no tipo de evento
    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE':
      case 'UNCANCELLATION': {
        // Assinatura ativa → plano = annual
        const expiresAt = expirationMs ? new Date(expirationMs).toISOString() : null;

        await supabase
          .from('profiles')
          .update({
            plan: 'annual',
            plan_expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        break;
      }

      case 'EXPIRATION':
      case 'SUBSCRIPTION_PAUSED':
      case 'BILLING_ISSUE': {
        // Expirou ou problema no pagamento → volta para free
        await supabase
          .from('profiles')
          .update({
            plan: 'free',
            plan_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', appUserId);
        break;
      }

      case 'NON_RENEWING_PURCHASE': {
        // Compra avulsa (R$ 27) — dá 1 crédito de busca
        // Nota: o ideal é usar entitlements do RevenueCat também aqui,
        // mas mantemos registro para histórico
        await supabase.from('payments').insert({
          user_id: appUserId,
          plan: 'single',
          amount: 27,
          status: 'approved',
          mp_payment_id: event.transaction_id || null,
        }).catch(() => {});
        break;
      }

      case 'CANCELLATION':
        // Usuário cancelou, mas ainda tem acesso até expirar.
        // Não muda nada aqui — quando chegar EXPIRATION, a gente atualiza.
        console.log(`[revenuecat-webhook] ${appUserId} cancelou, mantém acesso até ${expirationMs}`);
        break;

      default:
        console.log(`[revenuecat-webhook] evento ignorado: ${eventType}`);
    }

    return new Response('ok', { status: 200 });
  } catch (err) {
    console.log('[revenuecat-webhook] erro:', err);
    return new Response('error', { status: 500 });
  }
});
