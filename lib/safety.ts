import { supabase } from './supabase';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import NetInfo from '@react-native-community/netinfo';
import * as SMS from 'expo-sms';
import { Linking } from 'react-native';

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

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  batteryLevel?: number;
  timestamp: string;
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

export async function triggerSOS(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Location permission denied');

  const gps = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Highest,
  });

  const batteryRaw = await Battery.getBatteryLevelAsync().catch(() => null);
  const batteryLevel = batteryRaw !== null ? Math.round(batteryRaw * 100) : undefined;

  const networkState = await NetInfo.fetch();
  const hasInternet = Boolean(networkState.isConnected && networkState.isInternetReachable !== false);

  const contacts = await getEmergencyContacts();
  const prioritizedContact = contacts.find((c) => c.is_primary) || contacts[0];
  const activeSession = await getActiveSession();

  const locationData: LocationData = {
    latitude: gps.coords.latitude,
    longitude: gps.coords.longitude,
    accuracy: gps.coords.accuracy ?? undefined,
    batteryLevel,
    timestamp: new Date().toISOString(),
  };

  const baseMessage =
    '🚨 EMERGÊNCIA SOS - ELAS\n' +
    'Preciso de ajuda urgente.\n' +
    `📍 Localização: https://maps.google.com/?q=${locationData.latitude},${locationData.longitude}\n` +
    `🕐 ${new Date(locationData.timestamp).toLocaleString('pt-BR')}\n` +
    `🔋 Bateria: ${locationData.batteryLevel ?? 0}%`;

  const { data: alertData, error: alertError } = await supabase
    .from('sos_alerts')
    .insert({
      user_id: user.id,
      session_id: activeSession?.id,
      latitude: locationData.latitude,
      longitude: locationData.longitude,
      accuracy_meters: locationData.accuracy,
      message_sent: baseMessage,
      contacts_notified: contacts.length,
      status: 'active',
      whatsapp_contact_id: prioritizedContact?.id ?? null,
    })
    .select('id')
    .single();

  if (alertError) throw alertError;

  await Promise.all([
    hasInternet && prioritizedContact
      ? openWhatsAppPriority(prioritizedContact, locationData)
      : Promise.resolve(),
    !hasInternet && contacts.length > 0
      ? sendSMSFallback(contacts, locationData)
      : Promise.resolve(),
  ]);

  return alertData.id;
}

export async function markAsFalseAlarm(alertId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('sos_alerts')
    .update({
      status: 'false_alarm',
      resolved_at: new Date().toISOString(),
      resolution_note: 'Foi engano',
    })
    .eq('id', alertId)
    .eq('user_id', user.id);

  if (error) throw error;

  const contacts = await getEmergencyContacts();
  const prioritizedContact = contacts.find((c) => c.is_primary) || contacts[0];

  if (prioritizedContact) {
    const fallbackLocation: LocationData = {
      latitude: 0,
      longitude: 0,
      timestamp: new Date().toISOString(),
    };
    await openWhatsAppPriority(prioritizedContact, fallbackLocation, true);
  }
}

export async function keepAlertActive(alertId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('sos_alerts')
    .update({ status: 'active', resolution_note: null })
    .eq('id', alertId)
    .eq('user_id', user.id);

  if (error) throw error;
}

export async function sendSMSFallback(
  contacts: EmergencyContact[],
  location: LocationData
): Promise<void> {
  const canSendSms = await SMS.isAvailableAsync();
  if (!canSendSms || contacts.length === 0) return;

  const timestamp = new Date(location.timestamp).toLocaleString('pt-BR');
  const message =
    '🚨 EMERGÊNCIA SOS - ELAS\n' +
    'Preciso de ajuda urgente.\n' +
    `📍 Localização: https://maps.google.com/?q=${location.latitude},${location.longitude}\n` +
    `🕐 ${timestamp}\n` +
    `🔋 Bateria: ${location.batteryLevel ?? 0}%`;

  await SMS.sendSMSAsync(
    contacts.map((contact) => contact.phone),
    message
  );
}

export async function openWhatsAppPriority(
  contact: EmergencyContact,
  location: LocationData,
  calmingMessage = false
): Promise<void> {
  const cleanNumber = contact.phone.replace(/\D/g, '');
  const timestamp = new Date(location.timestamp).toLocaleString('pt-BR');
  const message = calmingMessage
    ? 'Oi! Foi um acionamento acidental do SOS, eu estou segura agora. Obrigada por se preocupar.'
    : '🚨 EMERGÊNCIA SOS - ELAS\n' +
      'Preciso de ajuda urgente.\n' +
      `📍 Localização: https://maps.google.com/?q=${location.latitude},${location.longitude}\n` +
      `🕐 ${timestamp}\n` +
      `🔋 Bateria: ${location.batteryLevel ?? 0}%`;

  const url = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;
  const canOpen = await Linking.canOpenURL(url);
  if (!canOpen) return;
  await Linking.openURL(url);
}

export async function registerPushToken(token: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: user.id,
        expo_push_token: token,
      },
      { onConflict: 'expo_push_token' }
    );

  if (error) throw error;
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
