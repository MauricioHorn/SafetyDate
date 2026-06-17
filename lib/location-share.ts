import { Linking } from 'react-native';
import { supabase } from './supabase';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as SMS from 'expo-sms';
import {
  getEmergencyContacts,
  EmergencyContact,
  startSafetySession,
  endSafetySession,
  getActiveSession,
  createSessionViews,
  type SafetySession,
} from './safety';
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from './background-location';

/**
 * Salva a localização atual da usuária em user_locations.
 * NÃO pede permissão — só captura se já foi concedida antes (SOS/Modo Seguro).
 * Se não houver permissão, não faz nada (silencioso).
 * Não altera is_sharing (o liga/desliga é controlado separadamente).
 */
export async function updateMyLocation(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Só prossegue se a permissão JÁ existe — não dispara popup.
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== 'granted') return;

    const gps = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    let battery: number | null = null;
    try {
      battery = Math.round((await Battery.getBatteryLevelAsync()) * 100);
    } catch {}

    // upsert: cria a linha se não existir, atualiza se existir.
    // Preserva is_sharing (não mexe nele aqui).
    await supabase
      .from('user_locations')
      .upsert(
        {
          user_id: user.id,
          latitude: gps.coords.latitude,
          longitude: gps.coords.longitude,
          accuracy_meters: gps.coords.accuracy ?? null,
          battery_level: battery,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
  } catch (err) {
    // Falha de localização nunca deve quebrar o app — só loga.
    console.log('[location-share] updateMyLocation falhou:', err);
  }
}

export interface FoundUser {
  user_id: string;
  full_name: string | null;
}

export interface LocationShare {
  id: string;
  owner_id: string;
  viewer_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

/**
 * Busca uma usuária do ELAS pelo telefone (via função segura no banco).
 * Retorna null se ninguém encontrado.
 */
export async function findFriendByPhone(phone: string): Promise<FoundUser | null> {
  const { data, error } = await supabase.rpc('find_user_by_phone', {
    search_phone: phone,
  });
  if (error) {
    console.log('[location-share] findFriendByPhone erro:', error);
    return null;
  }
  if (!data || data.length === 0) return null;
  return data[0] as FoundUser;
}

/**
 * Cria um convite: EU (owner) compartilho minha localização com viewerId.
 * Status começa 'pending' até a outra pessoa aceitar.
 */
export async function inviteFriend(viewerId: string): Promise<{ success: boolean; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Não autenticado' };
  if (user.id === viewerId) return { success: false, error: 'Não pode adicionar você mesma' };

  const { error } = await supabase
    .from('location_shares')
    .insert({
      owner_id: user.id,
      viewer_id: viewerId,
      status: 'pending',
    });

  if (error) {
    // 23505 = violação de unique (convite já existe)
    if (error.code === '23505') {
      return { success: false, error: 'Você já compartilha com essa pessoa' };
    }
    console.log('[location-share] inviteFriend erro:', error);
    return { success: false, error: 'Não foi possível enviar o convite' };
  }
  return { success: true };
}

/**
 * Lista os compartilhamentos que EU criei (onde sou owner) — minhas amigas que podem me ver.
 */
export async function getMyShares(): Promise<LocationShare[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('location_shares')
    .select('*')
    .eq('owner_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    console.log('[location-share] getMyShares erro:', error);
    return [];
  }
  return (data ?? []) as LocationShare[];
}

export interface ContactWithApp {
  contact: EmergencyContact;
  appUserId: string | null;   // null = não tem ELAS
  alreadyShared: boolean;     // true = já existe convite/compartilhamento
}

/**
 * Pega os contatos de emergência e descobre quais têm conta no ELAS
 * e com quais já existe compartilhamento.
 */
export async function getContactsWithAppStatus(): Promise<ContactWithApp[]> {
  const contacts = await getEmergencyContacts();
  const shares = await getMyShares();
  const sharedViewerIds = new Set(shares.map((s) => s.viewer_id));

  const results: ContactWithApp[] = [];
  for (const contact of contacts) {
    const found = await findFriendByPhone(contact.phone);
    results.push({
      contact,
      appUserId: found?.user_id ?? null,
      alreadyShared: found ? sharedViewerIds.has(found.user_id) : false,
    });
  }
  return results;
}

export interface LiveFriend {
  friend_id: string;
  full_name: string | null;
  latitude: number;
  longitude: number;
  battery_level: number | null;
  last_update: string;
}

/**
 * Lista as amigas que estão ao vivo agora (compartilham comigo + sessão ativa).
 */
export async function getLiveFriends(): Promise<LiveFriend[]> {
  const { data, error } = await supabase.rpc('get_live_friends');
  if (error) {
    console.log('[location-share] getLiveFriends erro:', error);
    return [];
  }
  return (data ?? []) as LiveFriend[];
}

export interface PendingInvite {
  share_id: string;
  owner_id: string;
  owner_name: string | null;
  created_at: string;
}

/**
 * Lista os convites que EU recebi (sou viewer, status pending).
 */
export async function getPendingInvites(): Promise<PendingInvite[]> {
  const { data, error } = await supabase.rpc('get_pending_invites');
  if (error) {
    console.log('[location-share] getPendingInvites erro:', error);
    return [];
  }
  return (data ?? []) as PendingInvite[];
}

/**
 * Aceita um convite. shareBack = true também compartilha minha localização de volta.
 */
export async function acceptInvite(shareId: string, shareBack: boolean): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.rpc('accept_invite', {
    p_share_id: shareId,
    p_share_back: shareBack,
  });
  if (error) {
    console.log('[location-share] acceptInvite erro:', error);
    return { success: false, error: 'Não foi possível aceitar o convite' };
  }
  return { success: true };
}

/**
 * Recusa um convite (deleta o share).
 */
export async function rejectInvite(shareId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('location_shares')
    .delete()
    .eq('id', shareId);
  if (error) {
    console.log('[location-share] rejectInvite erro:', error);
    return { success: false, error: 'Não foi possível recusar' };
  }
  return { success: true };
}

async function invokeLivePush(sessionId: string, userId: string, note?: string): Promise<void> {
  try {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;

    const response = await fetch(`${supabaseUrl}/functions/v1/send-live-push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ session_id: sessionId, user_id: userId, note: note || null }),
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('[location-share] send-live-push falhou:', response.status, errorText);
    }
  } catch (error) {
    console.warn('[location-share] send-live-push falhou:', error);
  }
}

/**
 * Ativa o compartilhamento ao vivo: liga a sessão (aparece no mapa das amigas
 * que aceitaram) + tenta ligar o background. NÃO exige contato nem local seguro.
 * Retorna a sessão criada.
 */
export async function startLiveShare(note?: string): Promise<{ success: boolean; session?: SafetySession; error?: string }> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      return { success: false, error: 'Precisamos da sua localização para compartilhar ao vivo.' };
    }

    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    let battery: number | undefined;
    try {
      battery = Math.round((await Battery.getBatteryLevelAsync()) * 100);
    } catch {}

    const session = await startSafetySession({
      latitude: loc.coords.latitude,
      longitude: loc.coords.longitude,
      batteryLevel: battery,
      note: note,
    });

    // tenta background; se a permissão "Sempre" não foi dada, segue limitado (não quebra)
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      if (bg.status === 'granted') {
        await startBackgroundLocationUpdates(session.id);
      }
    } catch (e) {
      console.log('[location-share] background não iniciou (segue limitado):', e);
    }

    // dispara push pras viewers (fire-and-forget, não bloqueia)
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      void invokeLivePush(session.id, user.id, note);
    }

    return { success: true, session };
  } catch (err: any) {
    console.log('[location-share] startLiveShare erro:', err);
    return { success: false, error: err?.message || 'Não foi possível ativar.' };
  }
}

/**
 * Encerra o compartilhamento ao vivo: encerra a sessão + para o background.
 */
export async function stopLiveShare(): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getActiveSession();
    if (session) {
      await endSafetySession(session.id, 'manual');
    }
    await stopBackgroundLocationUpdates().catch(() => {});
    return { success: true };
  } catch (err: any) {
    console.log('[location-share] stopLiveShare erro:', err);
    return { success: false, error: 'Não foi possível encerrar.' };
  }
}

/**
 * Manda o link de acompanhamento por SMS pro contato PRINCIPAL.
 * Requer uma sessão ativa. Se não houver contato, retorna noContact.
 */
export async function sendLinkToPrimaryContact(): Promise<{ success: boolean; noContact?: boolean; error?: string }> {
  try {
    const session = await getActiveSession();
    if (!session) return { success: false, error: 'Ative o compartilhamento ao vivo primeiro.' };

    const contacts = await getEmergencyContacts();
    const primary = contacts.find((c) => c.is_primary) || contacts[0];
    if (!primary) return { success: false, noContact: true };

    const views = await createSessionViews(session.id, [primary]);
    const view = views[0];
    if (!view) return { success: false, error: 'Não foi possível gerar o link.' };

    const message =
      `🛡️ ELAS\n\n` +
      `Estou compartilhando minha localização em tempo real. Você pode me acompanhar aqui:\n\n` +
      `${view.url}\n\n` +
      `Se algo der errado, vou apertar o botão SOS.`;

    // wa.me precisa do número só com dígitos (sem +)
    const waNumber = primary.phone.replace(/\D/g, '');
    const waUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(message)}`;

    const canOpen = await Linking.canOpenURL(waUrl);
    if (!canOpen) {
      return { success: false, error: 'Não foi possível abrir o WhatsApp.' };
    }
    await Linking.openURL(waUrl);

    return { success: true };
  } catch (err: any) {
    console.log('[location-share] sendLinkToPrimaryContact erro:', err);
    return { success: false, error: 'Não foi possível enviar o link.' };
  }
}

export interface FriendSharingWithMe {
  share_id: string;
  friend_id: string;
  friend_name: string | null;
  is_online: boolean;
}

export interface FriendIShareWith {
  share_id: string;
  friend_id: string;
  friend_name: string | null;
  status: 'pending' | 'accepted' | 'rejected';
}

/** Amigas que compartilham comigo (que eu vejo). */
export async function getFriendsSharingWithMe(): Promise<FriendSharingWithMe[]> {
  const { data, error } = await supabase.rpc('get_friends_sharing_with_me');
  if (error) {
    console.log('[location-share] getFriendsSharingWithMe erro:', error);
    return [];
  }
  return (data ?? []) as FriendSharingWithMe[];
}

/** Pessoas com quem eu compartilho (que me veem). */
export async function getFriendsIShareWith(): Promise<FriendIShareWith[]> {
  const { data, error } = await supabase.rpc('get_friends_i_share_with');
  if (error) {
    console.log('[location-share] getFriendsIShareWith erro:', error);
    return [];
  }
  return (data ?? []) as FriendIShareWith[];
}

/** Remove um compartilhamento (deleta o vínculo). */
export async function removeShare(shareId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('location_shares').delete().eq('id', shareId);
  if (error) {
    console.log('[location-share] removeShare erro:', error);
    return { success: false, error: 'Não foi possível remover.' };
  }
  return { success: true };
}
