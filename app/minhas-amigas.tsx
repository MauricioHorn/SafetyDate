import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  FriendSharingWithMe,
  FriendIShareWith,
  getFriendsSharingWithMe,
  getFriendsIShareWith,
  removeShare,
} from '../lib/location-share';

function Avatar({ name }: { name: string | null }) {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{letter}</Text>
    </View>
  );
}

export default function MinhasAmigasScreen() {
  const [seeing, setSeeing] = useState<FriendSharingWithMe[]>([]);
  const [sharing, setSharing] = useState<FriendIShareWith[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [a, b] = await Promise.all([getFriendsSharingWithMe(), getFriendsIShareWith()]);
      setSeeing(a);
      setSharing(b);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function confirmRemove(shareId: string, name: string | null, label: string) {
    Alert.alert(
      'Remover',
      `Remover ${name || 'essa pessoa'} de ${label}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            const res = await removeShare(shareId);
            if (res.success) load();
            else Alert.alert('Atenção', res.error || 'Erro.');
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF4D7E" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Minhas amigas</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        {/* Seção 1 */}
        <Text style={styles.sectionTitle}>Amigas que eu vejo</Text>
        <Text style={styles.sectionSub}>Compartilham a localização comigo</Text>
        {seeing.length === 0 ? (
          <Text style={styles.empty}>Ninguém compartilha localização com você ainda.</Text>
        ) : (
          seeing.map((f) => (
            <View key={f.share_id} style={styles.card}>
              <Avatar name={f.friend_name} />
              <View style={styles.cardMid}>
                <Text style={styles.name}>{f.friend_name || 'Amiga'}</Text>
                <View style={styles.statusRow}>
                  <View style={[styles.dot, { backgroundColor: f.is_online ? '#3DD68C' : '#7A7A94' }]} />
                  <Text style={styles.statusText}>{f.is_online ? 'Ao vivo agora' : 'Offline'}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => confirmRemove(f.share_id, f.friend_name, 'quem eu vejo')}>
                <Ionicons name="close-circle" size={24} color="#7A7A94" />
              </TouchableOpacity>
            </View>
          ))
        )}

        {/* Seção 2 */}
        <Text style={[styles.sectionTitle, { marginTop: 28 }]}>Quem me vê</Text>
        <Text style={styles.sectionSub}>Eu compartilho minha localização com elas</Text>
        {sharing.length === 0 ? (
          <Text style={styles.empty}>Você ainda não compartilha com ninguém.</Text>
        ) : (
          sharing.map((f) => (
            <View key={f.share_id} style={styles.card}>
              <Avatar name={f.friend_name} />
              <View style={styles.cardMid}>
                <Text style={styles.name}>{f.friend_name || 'Amiga'}</Text>
                <Text style={styles.statusText}>
                  {f.status === 'accepted' ? 'Aceitou' : f.status === 'pending' ? 'Convite pendente' : 'Recusado'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => confirmRemove(f.share_id, f.friend_name, 'quem me vê')}>
                <Ionicons name="close-circle" size={24} color="#7A7A94" />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  container: { flex: 1, backgroundColor: '#0A0A14' },
  loadingContainer: { flex: 1, backgroundColor: '#0A0A14', alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', marginBottom: 2 },
  sectionSub: { fontSize: 13, color: '#7A7A94', marginBottom: 14 },
  empty: { fontSize: 14, color: '#7A7A94', marginBottom: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#151525', borderRadius: 14, padding: 14, marginBottom: 10,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,77,126,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#FF4D7E', fontSize: 18, fontWeight: '800' },
  cardMid: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, color: '#B4B4C7' },
});
