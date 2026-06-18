import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Modal,
  TextInput,
  Image,
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
import { getActiveSession } from '../lib/safety';
import { supabase } from '../lib/supabase';
import * as Location from 'expo-location';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}

export default function MapaAmigasScreen() {
  const [friends, setFriends] = useState<LiveFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSharing, setIsSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [myProfile, setMyProfile] = useState<{ full_name: string | null; avatar_url: string | null } | null>(null);
  const [myCoords, setMyCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const mapRef = useRef<MapView | null>(null);

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
      else Alert.alert('Atenção', res.error || 'Erro ao parar.');
      setBusy(false);
    } else {
      // vai ativar: abre o modal pra escrever o aviso
      setNoteText('');
      setShowNoteModal(true);
    }
  }

  async function confirmActivate() {
    setShowNoteModal(false);
    setBusy(true);
    const res = await startLiveShare(noteText.trim() || undefined);
    if (res.success) {
      setIsSharing(true);
      Alert.alert('Você está ao vivo', 'Suas amigas que aceitaram já podem ver sua localização no mapa.');
    } else {
      Alert.alert('Atenção', res.error || 'Não foi possível ativar.');
    }
    setBusy(false);
  }

  async function handleSendLink() {
    const res = await sendLinkToPrimaryContact();
    if (res.noContact) {
      Alert.alert('Cadastre um contato', 'Você ainda não tem um contato de confiança cadastrado para enviar o link.');
    } else if (!res.success) {
      Alert.alert('Atenção', res.error || 'Não foi possível enviar.');
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
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setShowNoteModal(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmActivate}>
                <Text style={styles.modalConfirmText}>Ativar</Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: 18,
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
