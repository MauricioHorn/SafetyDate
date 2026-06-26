import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Modal,
  TextInput,
  Image,
  Switch,
  ScrollView,
  Pressable,
} from 'react-native';
import { Stack, useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import {
  LiveFriend,
  getLiveFriends,
  getPendingInvites,
  startLiveShare,
  stopLiveShare,
  sendLinkToPrimaryContact,
} from '../lib/location-share';
import { getActiveSession, getSafePlaces, type SafePlace } from '../lib/safety';
import { supabase } from '../lib/supabase';
import * as Location from 'expo-location';
import { useToast } from '@/contexts/ToastContext';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function defaultWindowTimes() {
  const now = new Date();
  return {
    startH: (now.getHours() + 1) % 24,
    startM: now.getMinutes(),
    endH: (now.getHours() + 2) % 24,
    endM: now.getMinutes(),
  };
}

function timeToIso(hours: number, minutes: number): string {
  const now = new Date();
  const d = new Date(now);
  d.setSeconds(0, 0);
  d.setHours(hours, minutes, 0, 0);
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

function hmToDisplay(hours: number, minutes: number): string {
  return `${pad2(hours)}:${pad2(minutes)}`;
}

function adjustTimeByMinutes(hours: number, minutes: number, delta: number): { h: number; m: number } {
  let total = hours * 60 + minutes + delta;
  total = Math.max(0, Math.min(23 * 60 + 59, total));
  return { h: Math.floor(total / 60), m: total % 60 };
}

function formatTimeInputText(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function parseAndClampTimeDigits(digits: string): { h: number; m: number; digits: string } | null {
  if (digits.length < 4) return null;
  let h = parseInt(digits.slice(0, 2), 10);
  let m = parseInt(digits.slice(2, 4), 10);
  if (h > 23) h = 23;
  if (m > 59) m = 59;
  return { h, m, digits: `${pad2(h)}${pad2(m)}` };
}

function EditableTimeField({
  hours,
  minutes,
  onChange,
}: {
  hours: number;
  minutes: number;
  onChange: (h: number, m: number) => void;
}) {
  const [text, setText] = useState(() => hmToDisplay(hours, minutes));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) {
      setText(hmToDisplay(hours, minutes));
    }
  }, [hours, minutes]);

  const applyDelta = (delta: number) => {
    const next = adjustTimeByMinutes(hours, minutes, delta);
    onChange(next.h, next.m);
  };

  const handleChangeText = (raw: string) => {
    let digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 2) {
      const h = parseInt(digits.slice(0, 2), 10);
      if (h > 23) digits = `23${digits.slice(2)}`;
    }
    if (digits.length >= 4) {
      const m = parseInt(digits.slice(2, 4), 10);
      if (m > 59) digits = `${digits.slice(0, 2)}59`;
    }
    setText(formatTimeInputText(digits));
    const parsed = parseAndClampTimeDigits(digits);
    if (parsed) {
      onChange(parsed.h, parsed.m);
      setText(hmToDisplay(parsed.h, parsed.m));
    }
  };

  const handleBlur = () => {
    focusedRef.current = false;
    setText(hmToDisplay(hours, minutes));
  };

  return (
    <View style={styles.timeFieldWrap}>
      <Pressable style={styles.timeAdjustBtn} onPress={() => applyDelta(-15)}>
        <Text style={styles.timeAdjustBtnText}>-15</Text>
      </Pressable>
      <TextInput
        style={styles.timeInput}
        value={text}
        onChangeText={handleChangeText}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={handleBlur}
        keyboardType="number-pad"
        maxLength={5}
        placeholder="00:00"
        placeholderTextColor="#7A7A94"
        selectTextOnFocus
      />
      <Pressable style={styles.timeAdjustBtn} onPress={() => applyDelta(15)}>
        <Text style={styles.timeAdjustBtnText}>+15</Text>
      </Pressable>
    </View>
  );
}

function ArrivalWindowTimes({
  startH,
  startM,
  endH,
  endM,
  onStartChange,
  onEndChange,
}: {
  startH: number;
  startM: number;
  endH: number;
  endM: number;
  onStartChange: (h: number, m: number) => void;
  onEndChange: (h: number, m: number) => void;
}) {
  return (
    <View style={styles.arrivalWindowBlock}>
      <Text style={styles.arrivalWindowLabel}>Devo chegar entre</Text>
      <View style={styles.arrivalWindowTimesRow}>
        <EditableTimeField hours={startH} minutes={startM} onChange={onStartChange} />
        <Text style={styles.arrivalWindowAnd}>e</Text>
        <EditableTimeField hours={endH} minutes={endM} onChange={onEndChange} />
      </View>
    </View>
  );
}

export default function MapaAmigasScreen() {
  const [friends, setFriends] = useState<LiveFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [arrivalEnabled, setArrivalEnabled] = useState(false);
  const [safePlaces, setSafePlaces] = useState<SafePlace[]>([]);
  const [selectedHomePlaceId, setSelectedHomePlaceId] = useState<string | null>(null);
  const [windowStartH, setWindowStartH] = useState(0);
  const [windowStartM, setWindowStartM] = useState(0);
  const [windowEndH, setWindowEndH] = useState(0);
  const [windowEndM, setWindowEndM] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [myProfile, setMyProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView | null>(null);
  const { showToast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLiveFriends();
      setFriends(data);
      // verifica se EU já estou compartilhando ao vivo
      try {
        const myActive = await getActiveSession();
        setIsSharing(!!myActive);
      } catch {}
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single();
          if (prof) setMyProfile(prof);
        }
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setMyCoords({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch (e) {
        console.log('[mapa-amigas] erro ao carregar meu perfil/posição:', e);
      }
      try {
        const invites = await getPendingInvites();
        setPendingCount(invites.length);
      } catch {}
      // centraliza no primeiro, se houver
      if (data.length > 0 && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: data[0].latitude,
          longitude: data[0].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 500);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useFocusEffect(
    useCallback(() => {
      const interval = setInterval(() => {
        // só atualiza as amigas ao vivo, silenciosamente (sem mexer no loading)
        getLiveFriends().then((data) => setFriends(data)).catch(() => {});
      }, 15000);
      return () => clearInterval(interval);
    }, [])
  );

  async function handleToggleShare() {
    if (isSharing) {
      setBusy(true);
      const res = await stopLiveShare();
      if (res.success) setIsSharing(false);
      else showToast(res.error || 'Erro ao parar.', 'error');
      setBusy(false);
    } else {
      const defaults = defaultWindowTimes();
      setNoteText('');
      setArrivalEnabled(false);
      setSelectedHomePlaceId(null);
      setWindowStartH(defaults.startH);
      setWindowStartM(defaults.startM);
      setWindowEndH(defaults.endH);
      setWindowEndM(defaults.endM);
      setShowNoteModal(true);
      try {
        const places = await getSafePlaces();
        setSafePlaces(places);
        if (places.length === 1) setSelectedHomePlaceId(places[0].id);
      } catch {
        setSafePlaces([]);
      }
    }
  }

  async function confirmActivate() {
    if (arrivalEnabled) {
      if (safePlaces.length === 0) {
        showToast('Cadastre um Local Seguro primeiro.', 'error');
        return;
      }
      if (!selectedHomePlaceId) {
        showToast('Escolha o local de casa.', 'error');
        return;
      }
      const windowStart = timeToIso(windowStartH, windowStartM);
      const windowEnd = timeToIso(windowEndH, windowEndM);
      if (windowEnd <= windowStart) {
        showToast('O horário "Chego até" deve ser depois de "Chego a partir de".', 'error');
        return;
      }
      setShowNoteModal(false);
      setBusy(true);
      const res = await startLiveShare(noteText.trim() || undefined, {
        enabled: true,
        windowStart,
        windowEnd,
        homePlaceId: selectedHomePlaceId,
        graceMinutes: 15,
      });
      if (res.success) {
        setIsSharing(true);
        showToast('Você está ao vivo — suas amigas já podem ver sua localização', 'success');
      } else {
        showToast(res.error || 'Não foi possível ativar.', 'error');
      }
      setBusy(false);
      return;
    }

    setShowNoteModal(false);
    setBusy(true);
    const res = await startLiveShare(noteText.trim() || undefined);
    if (res.success) {
      setIsSharing(true);
      showToast('Você está ao vivo — suas amigas já podem ver sua localização', 'success');
    } else {
      showToast(res.error || 'Não foi possível ativar.', 'error');
    }
    setBusy(false);
  }

  async function handleSendLink() {
    const res = await sendLinkToPrimaryContact();
    if (res.noContact) {
      showToast('Você ainda não tem um contato de confiança cadastrado para enviar o link.', 'error');
    } else if (!res.success) {
      showToast(res.error || 'Não foi possível enviar.', 'error');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: -23.5505,
          longitude: -46.6333,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {myCoords && (
          <Marker coordinate={myCoords}>
            <View style={styles.meMarker}>
              {myProfile?.avatar_url ? (
                <Image source={{ uri: myProfile.avatar_url }} style={styles.meMarkerImg} />
              ) : (
                <View style={styles.meMarkerFallback}>
                  <Text style={styles.meMarkerLetter}>{(myProfile?.full_name || 'V').trim().charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <Callout tooltip>
              <View style={styles.callout}>
                {myProfile?.avatar_url ? (
                  <Image source={{ uri: myProfile.avatar_url }} style={styles.calloutAvatar} />
                ) : null}
                <Text style={styles.calloutName}>{myProfile?.full_name || 'Você'}</Text>
                <Text style={styles.calloutStatus}>Você está aqui</Text>
              </View>
            </Callout>
          </Marker>
        )}
        {friends.map((f) => {
          const statusLine = f.battery_level != null ? `Bateria ${f.battery_level}%` : '';
          return (
            <Marker
              key={f.friend_id}
              coordinate={{ latitude: f.latitude, longitude: f.longitude }}
              pinColor="#FF4D7E"
            >
              <Callout tooltip>
                <View style={styles.callout}>
                  {f.avatar_url ? (
                    <Image source={{ uri: f.avatar_url }} style={styles.calloutAvatar} />
                  ) : null}
                  <Text style={styles.calloutName}>{f.full_name || 'Amiga'}</Text>
                  {f.note ? <Text style={styles.calloutNote}>{f.note}</Text> : null}
                  {statusLine ? <Text style={styles.calloutStatus}>{statusLine}</Text> : null}
                </View>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      <SafeAreaView edges={['top']} style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.topRight}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/convites')}>
            <Ionicons name="mail-outline" size={22} color="#FFFFFF" />
            {pendingCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount}</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.push('/adicionar-amiga')}>
            <Ionicons name="person-add-outline" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Painel inferior flutuante */}
      <View style={styles.panel}>
        <View style={styles.grabber} />
        <View style={styles.shareRow}>
          <TouchableOpacity
            style={[styles.shareBtn, isSharing && styles.shareBtnActive]}
            onPress={handleToggleShare}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name={isSharing ? 'eye-off' : 'navigate'} size={18} color="#FFFFFF" />
                <Text style={styles.shareBtnText}>
                  {isSharing ? 'Parar de compartilhar' : 'Aparecer pras minhas amigas'}
                </Text>
              </>
            )}
          </TouchableOpacity>
          {isSharing && (
            <TouchableOpacity style={styles.linkBtn} onPress={handleSendLink}>
              <Ionicons name="link" size={20} color="#FF4D7E" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.manageFriendsBtn} onPress={() => router.push('/minhas-amigas')}>
          <Ionicons name="people" size={16} color="#B4B4C7" />
          <Text style={styles.manageFriendsText}>Minhas amigas</Text>
        </TouchableOpacity>
        {loading ? (
          <View style={styles.panelContent}>
            <ActivityIndicator size="small" color="#FF4D7E" />
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.panelContent}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="location-outline" size={26} color="#FF4D7E" />
            </View>
            <Text style={styles.emptyTitle}>Nenhuma amiga ao vivo</Text>
            <Text style={styles.emptySub}>
              Elas aparecem aqui quando ativam a localização ao vivo
            </Text>
            <TouchableOpacity style={styles.refreshGhost} onPress={load}>
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.refreshGhostText}>Atualizar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.panelHeaderRow}>
            <View style={styles.liveDotRow}>
              <View style={styles.liveDot} />
              <Text style={styles.countText}>
                {friends.length} {friends.length === 1 ? 'amiga ao vivo' : 'amigas ao vivo'}
              </Text>
            </View>
            <TouchableOpacity style={styles.refreshIcon} onPress={load}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={showNoteModal} transparent animationType="fade" onRequestClose={() => setShowNoteModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Quer deixar um aviso?</Text>
              <Text style={styles.modalSub}>Suas amigas vão ver junto com a notificação. (opcional)</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Ex: saindo com o boy, indo numa festa..."
                placeholderTextColor="#7A7A94"
                value={noteText}
                onChangeText={setNoteText}
                maxLength={120}
                multiline
              />

              <View style={styles.arrivalToggleRow}>
                <Text style={styles.arrivalToggleLabel}>Avisar quando eu chegar em casa?</Text>
                <Switch
                  value={arrivalEnabled}
                  onValueChange={setArrivalEnabled}
                  trackColor={{ false: '#3A3A52', true: '#FF4D7E' }}
                  thumbColor="#FFFFFF"
                />
              </View>

              {arrivalEnabled && (
                <View style={styles.arrivalSection}>
                  <Text style={styles.arrivalSectionLabel}>Casa</Text>
                  {safePlaces.length === 0 ? (
                    <Text style={styles.arrivalHint}>Cadastre um Local Seguro primeiro</Text>
                  ) : (
                    <View style={styles.placeList}>
                      {safePlaces.map((place) => {
                        const selected = selectedHomePlaceId === place.id;
                        return (
                          <TouchableOpacity
                            key={place.id}
                            style={[styles.placeChip, selected && styles.placeChipSelected]}
                            onPress={() => setSelectedHomePlaceId(place.id)}
                          >
                            <Text style={styles.placeEmoji}>{place.icon_emoji}</Text>
                            <Text style={[styles.placeName, selected && styles.placeNameSelected]}>{place.name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}

                  <ArrivalWindowTimes
                    startH={windowStartH}
                    startM={windowStartM}
                    endH={windowEndH}
                    endM={windowEndM}
                    onStartChange={(h, m) => {
                      setWindowStartH(h);
                      setWindowStartM(m);
                    }}
                    onEndChange={(h, m) => {
                      setWindowEndH(h);
                      setWindowEndM(m);
                    }}
                  />
                </View>
              )}

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowNoteModal(false)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalConfirm,
                    arrivalEnabled && safePlaces.length === 0 && styles.modalConfirmDisabled,
                  ]}
                  onPress={confirmActivate}
                  disabled={arrivalEnabled && safePlaces.length === 0}
                >
                  <Text style={styles.modalConfirmText}>Ativar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A14' },
  map: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  topRight: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    margin: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(10,10,20,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#FF4D7E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: '#151525',
    borderRadius: 22,
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A52',
    marginBottom: 10,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  manageFriendsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginBottom: 10,
  },
  manageFriendsText: {
    color: '#B4B4C7',
    fontSize: 13,
    fontWeight: '600',
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF4D7E',
    paddingVertical: 13,
    borderRadius: 12,
  },
  shareBtnActive: {
    backgroundColor: '#3A3A52',
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  linkBtn: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: 'rgba(255,77,126,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelContent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  emptyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,77,126,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: '#7A7A94',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  refreshGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF4D7E',
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 12,
  },
  refreshGhostText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3DD68C',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  refreshIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E35',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#151525',
    borderRadius: 20,
    padding: 22,
    maxHeight: '85%',
  },
  modalTitle: { fontSize: 19, fontWeight: '800', color: '#FFFFFF', marginBottom: 6 },
  modalSub: { fontSize: 13.5, color: '#B4B4C7', marginBottom: 16, lineHeight: 19 },
  modalInput: {
    backgroundColor: '#1E1E35',
    borderRadius: 12,
    padding: 14,
    color: '#FFFFFF',
    fontSize: 15,
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalBtns: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#1E1E35', alignItems: 'center',
  },
  modalCancelText: { color: '#B4B4C7', fontWeight: '600', fontSize: 15 },
  modalConfirm: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#FF4D7E', alignItems: 'center',
  },
  modalConfirmText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  modalConfirmDisabled: { opacity: 0.45 },
  arrivalToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 12,
  },
  arrivalToggleLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '600',
    lineHeight: 20,
  },
  arrivalSection: {
    marginBottom: 18,
  },
  arrivalSectionLabel: {
    color: '#B4B4C7',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  arrivalHint: {
    color: '#7A7A94',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  placeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E1E35',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  placeChipSelected: {
    borderColor: '#FF4D7E',
    backgroundColor: 'rgba(255,77,126,0.12)',
  },
  placeEmoji: { fontSize: 16 },
  placeName: { color: '#B4B4C7', fontSize: 14, fontWeight: '600' },
  placeNameSelected: { color: '#FFFFFF' },
  arrivalWindowBlock: {
    marginTop: 4,
  },
  arrivalWindowLabel: {
    color: '#B4B4C7',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  arrivalWindowTimesRow: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
  },
  arrivalWindowAnd: {
    color: '#7A7A94',
    fontSize: 14,
    fontWeight: '600',
    alignSelf: 'center',
    paddingVertical: 2,
  },
  timeFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
  },
  timeInput: {
    minWidth: 100,
    width: 100,
    flexShrink: 0,
    backgroundColor: '#1E1E35',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#2A2A42',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  timeAdjustBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#1E1E35',
    borderWidth: 1,
    borderColor: '#2A2A42',
    minWidth: 34,
    alignItems: 'center',
  },
  timeAdjustBtnText: {
    color: '#B4B4C7',
    fontSize: 11,
    fontWeight: '700',
  },
  callout: {
    width: 220,
    backgroundColor: '#151525',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  calloutAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignSelf: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#FF4D7E',
  },
  calloutName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  calloutNote: {
    fontSize: 14,
    color: '#FF4D7E',
    fontWeight: '600',
    marginBottom: 6,
    lineHeight: 19,
  },
  calloutStatus: {
    fontSize: 12.5,
    color: '#B4B4C7',
  },
  meMarker: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meMarkerImg: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 3, borderColor: '#3B82F6',
  },
  meMarkerFallback: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#3B82F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFFFFF',
  },
  meMarkerLetter: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
});
