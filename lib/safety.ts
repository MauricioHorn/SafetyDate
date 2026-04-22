import { supabase } from './supabase';

// =====================================================
// TYPES
// =====================================================

export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  relationship: string | null;
  is_primary: boolean;
  created_at: string;
}

export interface SafePlace {
  id: string;
  user_id: string;
  name: string;
  icon_emoji: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  address: string | null;
}

export interface SafetySession {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: 'arrived_safe_place' | 'manual' | 'sos' | 'timeout' | 'other' | null;
  safe_place_id: string | null;
  current_latitude: number | null;
  current_longitude: number | null;
  battery_level: number | null;
  last_location_update: string;
  is_active: boolean;
}

// =====================================================
// EMERGENCY CONTACTS
// =====================================================

export async function getEmergencyContacts(): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('*')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addEmergencyContact(contact: {
  name: string;
  phone: string;
  relationship?: string;
}): Promise<EmergencyContact> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const existing = await getEmergencyContacts();

  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({
      user_id: user.id,
      name: contact.name,
      phone: contact.phone,
      relationship: contact.relationship || null,
      is_primary: existing.length === 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('emergency_contacts')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// =====================================================
// SAFE PLACES
// =====================================================

export async function getSafePlaces(): Promise<SafePlace[]> {
  const { data, error } = await supabase
    .from('safe_places')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function addSafePlace(place: {
  name: string;
  icon_emoji?: string;
  latitude: number;
  longitude: number;
  address?: string;
  radius_meters?: number;
}): Promise<SafePlace> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('safe_places')
    .insert({
      user_id: user.id,
      name: place.name,
      icon_emoji: place.icon_emoji || '🏠',
      latitude: place.latitude,
      longitude: place.longitude,
      address: place.address,
      radius_meters: place.radius_meters || 100,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSafePlace(id: string): Promise<void> {
  const { error } = await supabase.from('safe_places').delete().eq('id', id);
  if (error) throw error;
}

// =====================================================
// SAFETY SESSIONS (Safety Mode)
// =====================================================

export async function getActiveSession(): Promise<SafetySession | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('safety_sessions')
    .select('*')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function startSafetySession(params: {
  latitude: number;
  longitude: number;
  batteryLevel?: number;
}): Promise<SafetySession> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Encerra qualquer sessão ativa anterior (segurança)
  await supabase
    .from('safety_sessions')
    .update({ ended_at: new Date().toISOString(), end_reason: 'other' })
    .eq('user_id', user.id)
    .is('ended_at', null);

  const { data, error } = await supabase
    .from('safety_sessions')
    .insert({
      user_id: user.id,
      current_latitude: params.latitude,
      current_longitude: params.longitude,
      battery_level: params.batteryLevel,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateSessionLocation(
  sessionId: string,
  location: { latitude: number; longitude: number; accuracy?: number; battery?: number }
): Promise<void> {
  const { error } = await supabase
    .from('safety_sessions')
    .update({
      current_latitude: location.latitude,
      current_longitude: location.longitude,
      current_accuracy_meters: location.accuracy,
      battery_level: location.battery,
      last_location_update: new Date().toISOString(),
    })
    .eq('id', sessionId);

  if (error) throw error;
}

export async function endSafetySession(
  sessionId: string,
  reason: 'arrived_safe_place' | 'manual' | 'sos' | 'timeout',
  safePlaceId?: string
): Promise<void> {
  const { error } = await supabase
    .from('safety_sessions')
    .update({
      ended_at: new Date().toISOString(),
      end_reason: reason,
      safe_place_id: safePlaceId,
    })
    .eq('id', sessionId);

  if (error) throw error;
}

// =====================================================
// SESSION SHARING (Tokens for contacts)
// =====================================================

export async function createSessionViews(
  sessionId: string,
  contacts: EmergencyContact[]
): Promise<Array<{ contact: EmergencyContact; viewToken: string; url: string }>> {
  const WEB_BASE_URL = 'https://safetydate.app'; // Vai mudar pro seu domínio

  const views = contacts.map(c => ({
    session_id: sessionId,
    contact_id: c.id,
    viewer_phone: c.phone,
    viewer_name: c.name,
  }));

  const { data, error } = await supabase
    .from('safety_session_views')
    .insert(views)
    .select();

  if (error) throw error;

  return (data || []).map(view => {
    const contact = contacts.find(c => c.id === view.contact_id)!;
    return {
      contact,
      viewToken: view.view_token,
      url: `${WEB_BASE_URL}/track/${view.view_token}`,
    };
  });
}

// =====================================================
// SOS ALERT
// =====================================================

export async function recordSosAlert(params: {
  sessionId?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  message: string;
  contactsNotified: number;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('sos_alerts').insert({
    user_id: user.id,
    session_id: params.sessionId,
    latitude: params.latitude,
    longitude: params.longitude,
    accuracy_meters: params.accuracy,
    message_sent: params.message,
    contacts_notified: params.contactsNotified,
  });
}

// =====================================================
// GEOFENCING: Check if user arrived at safe place
// =====================================================

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function checkArrivalAtSafePlace(
  currentLat: number,
  currentLon: number,
  safePlaces: SafePlace[]
): SafePlace | null {
  for (const place of safePlaces) {
    const distance = calculateDistance(
      currentLat,
      currentLon,
      place.latitude,
      place.longitude
    );
    if (distance <= place.radius_meters) {
      return place;
    }
  }
  return null;
}
