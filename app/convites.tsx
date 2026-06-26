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
  PendingInvite,
  getPendingInvites,
  acceptInvite,
  rejectInvite,
} from '../lib/location-share';

export default function ConvitesScreen() {
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getPendingInvites();
      setInvites(data);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar os convites.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function confirmAccept(invite: PendingInvite) {
    const name = invite.owner_name || 'Essa pessoa';
    Alert.alert(
      `Aceitar ${name}?`,
      `Você poderá ver a localização de ${name} quando ela ativar o ao vivo. Quer também compartilhar a sua localização com ela?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Só receber', onPress: () => doAccept(invite, false) },
        { text: 'Receber e compartilhar', onPress: () => doAccept(invite, true) },
      ]
    );
  }

  async function doAccept(invite: PendingInvite, shareBack: boolean) {
    setBusyId(invite.share_id);
    const res = await acceptInvite(invite.share_id, shareBack);
    setBusyId(null);
    if (res.success) {
      Alert.alert('Pronto!', shareBack
        ? 'Vocês agora podem se ver quando ativarem o ao vivo.'
        : 'Você vai poder ver a localização dela quando ela ativar o ao vivo.');
      load();
    } else {
      Alert.alert('Atenção', res.error || 'Erro ao aceitar.');
    }
  }

  async function handleReject(invite: PendingInvite) {
    setBusyId(invite.share_id);
    const res = await rejectInvite(invite.share_id);
    setBusyId(null);
    if (res.success) {
      load();
    } else {
      Alert.alert('Atenção', res.error || 'Erro ao recusar.');
    }
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
        <Text style={styles.topTitle}>Convites</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Convites recebidos</Text>
          <Text style={styles.subtitle}>
            Pessoas que querem compartilhar localização com você.
          </Text>
        </View>

        {invites.length === 0 && (
          <Text style={styles.empty}>Nenhum convite no momento.</Text>
        )}

        {invites.map((invite) => (
          <View key={invite.share_id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={20} color="#FF4D7E" />
              </View>
              <Text style={styles.name}>{invite.owner_name || 'Amiga'}</Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.rejectBtn}
                onPress={() => handleReject(invite)}
                disabled={busyId === invite.share_id}
              >
                <Text style={styles.rejectText}>Recusar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.acceptBtn}
                onPress={() => confirmAccept(invite)}
                disabled={busyId === invite.share_id}
              >
                {busyId === invite.share_id ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.acceptText}>Aceitar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A14' },
  loadingContainer: { flex: 1, backgroundColor: '#0A0A14', alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  subtitle: { fontSize: 15, color: '#B4B4C7', lineHeight: 21 },
  empty: { fontSize: 15, color: '#7A7A94', textAlign: 'center', marginTop: 40 },
  card: { backgroundColor: '#151525', borderRadius: 14, padding: 16, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,77,126,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  name: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  actions: { flexDirection: 'row', gap: 10 },
  rejectBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#1E1E35', alignItems: 'center',
  },
  rejectText: { color: '#B4B4C7', fontWeight: '600', fontSize: 14 },
  acceptBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#FF4D7E', alignItems: 'center',
  },
  acceptText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
