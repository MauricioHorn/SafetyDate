import { supabase } from './supabase';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import { getEmergencyContacts, EmergencyContact } from './safety';

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
