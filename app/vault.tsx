import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import {
  VaultItem,
  listVaultItems,
  lockVault,
  deleteVaultItem,
  decryptVaultItem,
  getKeyFromKeychain,
} from '@/lib/vault';
import { colors, spacing } from '@/lib/theme';

type Tab = 'note' | 'photo' | 'video' | 'document' | 'audio';

const TABS: { id: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'note', label: 'Notas', icon: 'document-text-outline' },
  { id: 'photo', label: 'Fotos', icon: 'image-outline' },
  { id: 'video', label: 'Vídeos', icon: 'videocam-outline' },
  { id: 'document', label: 'Docs', icon: 'document-outline' },
  { id: 'audio', label: 'Áudios', icon: 'mic-outline' },
];

export default function VaultScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('note');
  const [items, setItems] = useState<Array<VaultItem & { filename: string; content: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const loadItems = useCallback(async (uid: string, tab: Tab) => {
    setLoading(true);
    try {
      const rawItems = await listVaultItems(uid, tab);
      const key = await getKeyFromKeychain(uid);
      if (!key) {
        throw new Error('Cofre trancado.');
      }
      const decrypted = await Promise.all(
        rawItems.map(async (item) => {
          try {
            const { filename, content } = await decryptVaultItem(item, key);
            return { ...item, filename, content };
          } catch {
            return { ...item, filename: '[erro ao descriptografar]', content: '' };
          }
        })
      );
      setItems(decrypted);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível carregar itens.';
      Alert.alert('Erro', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.replace('/login');
          return;
        }
        setUserId(user.id);
        await loadItems(user.id, activeTab);
      })();
    }, [activeTab, loadItems, router])
  );

  const handleLock = async () => {
    if (!userId) return;
    await lockVault(userId);
    router.replace('/(tabs)');
  };

  const handleDelete = (item: VaultItem & { filename: string }) => {
    Alert.alert('Apagar', `Apagar "${item.filename}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          if (!userId) return;
          await deleteVaultItem(userId, item.id);
          await loadItems(userId, activeTab);
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Cofre',
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <TouchableOpacity onPress={handleLock} style={{ marginRight: 12 }}>
              <Ionicons name="lock-closed" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          ),
        }}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsBar}
        contentContainerStyle={{ paddingHorizontal: spacing.md, gap: 8 }}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}
          >
            <Ionicons
              name={tab.icon}
              size={16}
              color={activeTab === tab.id ? '#fff' : colors.textSecondary}
            />
            <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activeTab === 'note' ? (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>Nenhuma nota ainda.</Text>
              <Text style={styles.emptyHint}>Toque no + pra criar a primeira.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 8 }}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.noteCard}
                  onPress={() => router.push(`/vault-note-edit?id=${item.id}`)}
                  onLongPress={() => handleDelete(item)}
                >
                  <Text style={styles.noteTitle} numberOfLines={1}>
                    {item.filename}
                  </Text>
                  <Text style={styles.notePreview} numberOfLines={2}>
                    {item.content}
                  </Text>
                  <Text style={styles.noteDate}>
                    {new Date(item.created_at).toLocaleDateString('pt-BR')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.fab} onPress={() => router.push('/vault-note-edit')}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="construct-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>Em breve.</Text>
          <Text style={styles.emptyHint}>
            Fotos, vídeos, documentos e áudios virão nas próximas atualizações.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabsBar: { maxHeight: 50, paddingVertical: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textSecondary, fontWeight: '500' },
  tabTextActive: { color: '#fff', fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: 8 },
  emptyText: { fontSize: 16, color: colors.text, fontWeight: '500' },
  emptyHint: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  noteCard: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noteTitle: { fontSize: 15, color: colors.text, fontWeight: '600', marginBottom: 4 },
  notePreview: { fontSize: 13, color: colors.textSecondary, marginBottom: 8 },
  noteDate: { fontSize: 11, color: colors.textSecondary },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
