/**
 * RevenueCat - Gerenciamento de In-App Purchase (iOS + Android)
 *
 * Abstrai Apple StoreKit + Google Play Billing numa única API.
 *
 * IDs de produto configurados:
 * - safetydate_single     → Consulta avulsa (R$ 27, non-consumable de 1 uso)
 * - safetydate_annual     → Plano anual (R$ 97/ano, auto-renewable subscription)
 *
 * Entitlement:
 * - "premium" → libera buscas ilimitadas
 */

import { Platform } from 'react-native';
import Purchases, {
  PurchasesOffering,
  PurchasesPackage,
  CustomerInfo,
} from 'react-native-purchases';

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY!;

export const ENTITLEMENT_ID = 'premium';
export const PRODUCT_SINGLE = 'safetydate_single';
export const PRODUCT_ANNUAL = 'safetydate_annual';

let initialized = false;

/**
 * Inicializa o RevenueCat. Chamar no root layout do app, uma única vez.
 */
export async function initRevenueCat(userId: string) {
  if (initialized) {
    await Purchases.logIn(userId);
    return;
  }

  const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
  if (!apiKey) {
    console.log('[RevenueCat] chave não configurada para', Platform.OS);
    return;
  }

  Purchases.configure({ apiKey, appUserID: userId });
  initialized = true;
}

/**
 * Busca a oferta atual configurada no dashboard do RevenueCat.
 * A "current offering" é o que será mostrado no paywall.
 */
export async function fetchOffering(): Promise<PurchasesOffering | null> {
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (err) {
    console.log('[RevenueCat] erro ao buscar ofertas:', err);
    return null;
  }
}

/**
 * Compra um pacote (single ou annual).
 * Dispara o fluxo nativo de compra da Apple/Google.
 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<{
  success: boolean;
  isPremium: boolean;
  error?: string;
  userCancelled?: boolean;
}> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    const isPremium = customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;

    return { success: true, isPremium };
  } catch (err: any) {
    if (err.userCancelled) {
      return { success: false, isPremium: false, userCancelled: true };
    }
    return {
      success: false,
      isPremium: false,
      error: err.message || 'Erro no pagamento',
    };
  }
}

/**
 * Restaura compras anteriores (obrigatório pela Apple).
 * Usado em caso de troca de celular / reinstalação.
 */
export async function restorePurchases(): Promise<boolean> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return customerInfo.entitlements.active[ENTITLEMENT_ID] !== undefined;
  } catch (err) {
    console.log('[RevenueCat] erro ao restaurar:', err);
    return false;
  }
}

/**
 * Verifica status atual de assinatura do usuário logado.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  try {
    return await Purchases.getCustomerInfo();
  } catch (err) {
    console.log('[RevenueCat] erro ao buscar customer info:', err);
    return null;
  }
}

/**
 * Verifica se o usuário tem acesso premium ativo.
 */
export async function hasActivePremium(): Promise<boolean> {
  const info = await getCustomerInfo();
  return info?.entitlements.active[ENTITLEMENT_ID] !== undefined;
}

/**
 * Faz logout do RevenueCat (chamar no signOut do Supabase).
 */
export async function logoutRevenueCat() {
  try {
    await Purchases.logOut();
  } catch {
    // ignora erro se não estava logado
  }
}
