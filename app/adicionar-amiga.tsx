import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  ContactWithApp,
  getContactsWithAppStatus,
  inviteFriend,
} from '../lib/location-share';
import { useToast } from '@/contexts/ToastContext';

export default function AdicionarAmigaScreen() {
  const { showToast } = useToast();
  const [items, setItems] = useState<ContactWithApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getContactsWithAppStatus();
      setItems(data);
    } catch (error) {
      showToast('Não foi possível carregar os contatos.', 'error');
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

  async function handleInvite(item: ContactWithApp) {
    if (!item.appUserId) return;
    setInvitingId(item.appUserId);
    const res = await inviteFriend(item.appUserId);
    setInvitingId(null);
    if (res.success) {
      showToast(`Convite enviado! ${item.contact.name} vai poder ver sua localização quando aceitar e você ligar o compartilhamento.`, 'success');
      load();
    } else {
      showToast(res.error || 'Não foi possível enviar.', 'error');
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
        <Text style={styles.topTitle}>Adicionar amiga</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Compartilhar localização</Text>
          <Text style={styles.subtitle}>
            Escolha entre seus contatos de confiança quem poderá ver sua localização no mapa. Você controla quando aparecer.
          </Text>
        </View>

        {items.length === 0 && (
          <View>
            <Text style={styles.empty}>
              Você ainda não tem contatos de confiança cadastrados.
            </Text>
            <TouchableOpacity style={styles.manageBtn} onPress={() => router.push('/emergency-contacts')}>
              <Ionicons name="add-circle-outline" size={20} color="#FF4D7E" />
              <Text style={styles.manageBtnText}>Cadastrar contatos de confiança</Text>
            </TouchableOpacity>
          </View>
        )}

        {items.map((item) => (
          <View key={item.contact.id} style={styles.card}>
            <View style={styles.cardLeft}>
              <Text style={styles.contactName}>{item.contact.name}</Text>
              <Text style={styles.contactPhone}>{item.contact.phone}</Text>
            </View>
            <View style={styles.cardRight}>
              {!item.appUserId ? (
                <View style={styles.tagGray}>
                  <Text style={styles.tagGrayText}>Sem ELAS</Text>
                </View>
              ) : item.alreadyShared ? (
                <View style={styles.tagGreen}>
                  <Ionicons name="checkmark" size={14} color="#0A0A14" />
                  <Text style={styles.tagGreenText}>Compartilhado</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.inviteBtn}
                  onPress={() => handleInvite(item)}
                  disabled={invitingId === item.appUserId}
                >
                  {invitingId === item.appUserId ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.inviteBtnText}>Compartilhar</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
        {items.length > 0 && (
          <TouchableOpacity style={styles.manageBtn} onPress={() => router.push('/emergency-contacts')}>
            <Ionicons name="add-circle-outline" size={20} color="#FF4D7E" />
            <Text style={styles.manageBtnText}>Gerenciar contatos de confiança</Text>
          </TouchableOpacity>
        )}
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
  empty: { fontSize: 15, color: '#7A7A94', textAlign: 'center', marginTop: 40, lineHeight: 22 },
  card: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#151525', borderRadius: 14, padding: 16, marginBottom: 12,
  },
  cardLeft: { flex: 1 },
  contactName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  contactPhone: { fontSize: 14, color: '#7A7A94' },
  cardRight: { marginLeft: 12 },
  inviteBtn: { backgroundColor: '#FF4D7E', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  inviteBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  tagGray: { backgroundColor: '#1E1E35', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tagGrayText: { color: '#7A7A94', fontWeight: '600', fontSize: 13 },
  tagGreen: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3DD68C', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  tagGreenText: { color: '#0A0A14', fontWeight: '700', fontSize: 13 },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FF4D7E',
    borderStyle: 'dashed',
  },
  manageBtnText: {
    color: '#FF4D7E',
    fontWeight: '600',
    fontSize: 14,
  },
});
