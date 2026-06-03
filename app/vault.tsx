import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Stack, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import {
  VaultItem,
  listVaultItems,
  lockVault,
  deleteVaultItem,
  deletePhotoFromVault,
  deleteDocumentFromVault,
  deleteAudioFromVault,
  addDocumentToVault,
  addAudioToVault,
  decryptVaultItem,
  decryptString,
  getKeyFromKeychain,
  addPhotoToVault,
  getVaultUsage,
} from '@/lib/vault';
import { colors, spacing } from '@/lib/theme';

type Tab = 'note' | 'photo' | 'video' | 'document' | 'audio';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  const [usage, setUsage] = useState<{ used: number; limit: number; percent: number } | null>(null);

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
            if (tab === 'photo') {
              const [thumbCipher, thumbIv] = (item.encrypted_metadata || '').split(':');
              const [fnameCipher, fnameIv] = item.encrypted_filename.split(':');
              const thumbBase64 =
                thumbCipher && thumbIv ? await decryptString(thumbCipher, thumbIv, key) : '';
              const filename = await decryptString(fnameCipher, fnameIv, key);
              return { ...item, filename, content: thumbBase64 };
            } else if (tab === 'document') {
              const [fnameCipher, fnameIv] = item.encrypted_filename.split(':');
              const filename = await decryptString(fnameCipher, fnameIv, key);
              let mimeType = '';
              if (item.encrypted_metadata) {
                try {
                  const [metaCipher, metaIv] = item.encrypted_metadata.split(':');
                  const metaStr = await decryptString(metaCipher, metaIv, key);
                  const meta = JSON.parse(metaStr);
                  mimeType = meta.mimeType || '';
                } catch {
                  // metadata opcional
                }
              }
              return { ...item, filename, content: mimeType };
            } else if (tab === 'audio') {
              const [fnameCipher, fnameIv] = item.encrypted_filename.split(':');
              const filename = await decryptString(fnameCipher, fnameIv, key);
              let mimeType = '';
              if (item.encrypted_metadata) {
                try {
                  const [metaCipher, metaIv] = item.encrypted_metadata.split(':');
                  const metaStr = await decryptString(metaCipher, metaIv, key);
                  const meta = JSON.parse(metaStr);
                  mimeType = meta.mimeType || '';
                } catch {
                  // metadata opcional
                }
              }
              return { ...item, filename, content: mimeType };
            } else {
              const { filename, content } = await decryptVaultItem(item, key);
              return { ...item, filename, content };
            }
          } catch {
            return { ...item, filename: '[erro]', content: '' };
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
        try {
          const u = await getVaultUsage(user.id);
          setUsage(u);
        } catch {
          setUsage(null);
        }
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
          if (item.item_type === 'photo') {
            await deletePhotoFromVault(userId, item.id);
          } else if (item.item_type === 'document') {
            await deleteDocumentFromVault(userId, item.id);
          } else if (item.item_type === 'audio') {
            await deleteAudioFromVault(userId, item.id);
          } else {
            await deleteVaultItem(userId, item.id);
          }
          await loadItems(userId, activeTab);
        },
      },
    ]);
  };

  const handleAddPhoto = async () => {
    if (!userId) return;

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert(
        'Sem permissão',
        'O ELAS precisa de permissão pra acessar suas fotos. Vá em Ajustes pra permitir.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsMultipleSelection: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];
    setLoading(true);
    try {
      await addPhotoToVault({ userId, imageUri: asset.uri });
      await loadItems(userId, activeTab);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Tente de novo.';
      Alert.alert('Erro ao salvar foto', message);
      setLoading(false);
    }
  };

  const handleAddDocument = async () => {
    if (!userId) return;

    const result = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];
    setLoading(true);
    try {
      await addDocumentToVault({
        userId,
        fileUri: asset.uri,
        filename: asset.name,
        mimeType: asset.mimeType || 'application/octet-stream',
      });
      await loadItems(userId, activeTab);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Tente de novo.';
      Alert.alert('Erro ao salvar documento', message);
      setLoading(false);
    }
  };

  const handleAddAudio = async () => {
    if (!userId) return;

    const result = await DocumentPicker.getDocumentAsync({
      type: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) return;

    const asset = result.assets[0];
    setLoading(true);
    try {
      await addAudioToVault({
        userId,
        fileUri: asset.uri,
        filename: asset.name,
        mimeType: asset.mimeType || 'audio/mpeg',
      });
      await loadItems(userId, activeTab);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Tente de novo.';
      Alert.alert('Erro ao salvar áudio', message);
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Cofre',
          headerShown: true,
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerRight: () => (
            <TouchableOpacity onPress={handleLock} style={{ marginRight: 12 }}>
              <Ionicons name="lock-closed" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          ),
        }}
      />

      {usage && (
        <View style={styles.usageBar}>
          <Ionicons
            name="archive-outline"
            size={14}
            color={usage.percent >= 95 ? '#EF4444' : usage.percent >= 80 ? '#F59E0B' : colors.textSecondary}
          />
          <Text
            style={[
              styles.usageText,
              usage.percent >= 95 && { color: '#EF4444' },
              usage.percent >= 80 && usage.percent < 95 && { color: '#F59E0B' },
            ]}
          >
            {formatBytes(usage.used)} de 1 GB ({usage.percent}%)
          </Text>
        </View>
      )}

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
      ) : activeTab === 'photo' ? (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="image-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Nenhuma foto ainda.</Text>
              <Text style={styles.emptyHint}>Toque no + pra adicionar.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 4 }}>
              <View style={styles.photoGrid}>
                {items.map((item) => {
                  const thumbDataUri = item.content
                    ? `data:image/jpeg;base64,${item.content}`
                    : null;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.photoTile}
                      onPress={() => router.push(`/vault-photo-view?id=${item.id}`)}
                      onLongPress={() => handleDelete(item)}
                    >
                      {thumbDataUri ? (
                        <Image source={{ uri: thumbDataUri }} style={styles.photoThumb} />
                      ) : (
                        <View
                          style={[
                            styles.photoThumb,
                            {
                              backgroundColor: colors.surface,
                              alignItems: 'center',
                              justifyContent: 'center',
                            },
                          ]}
                        >
                          <Ionicons
                            name="alert-circle-outline"
                            size={20}
                            color={colors.textSecondary}
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          )}

          <TouchableOpacity style={styles.fab} onPress={handleAddPhoto}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : activeTab === 'document' ? (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="document-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Nenhum documento ainda.</Text>
              <Text style={styles.emptyHint}>Toque no + pra adicionar PDF, DOC ou TXT.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 8 }}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.docCard}
                  onPress={() => router.push(`/vault-doc-view?id=${item.id}`)}
                  onLongPress={() => handleDelete(item)}
                >
                  <Ionicons name="document-text-outline" size={28} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.docName} numberOfLines={1}>
                      {item.filename}
                    </Text>
                    <Text style={styles.docMeta}>
                      {item.content || 'documento'} · {formatBytes(item.size_bytes)}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.fab} onPress={handleAddDocument}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : activeTab === 'audio' ? (
        <View style={{ flex: 1 }}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : items.length === 0 ? (
            <View style={styles.center}>
              <Ionicons name="mic-outline" size={48} color={colors.textSecondary} />
              <Text style={styles.emptyText}>Nenhum áudio ainda.</Text>
              <Text style={styles.emptyHint}>Toque no + pra adicionar.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: spacing.md, gap: 8 }}>
              {items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.docCard}
                  onPress={() => router.push(`/vault-audio-view?id=${item.id}`)}
                  onLongPress={() => handleDelete(item)}
                >
                  <Ionicons name="musical-notes-outline" size={28} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.docName} numberOfLines={1}>
                      {item.filename}
                    </Text>
                    <Text style={styles.docMeta}>{formatBytes(item.size_bytes)}</Text>
                  </View>
                  <Ionicons name="play-circle-outline" size={28} color={colors.primary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.fab} onPress={handleAddAudio}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.center}>
          <Ionicons name="construct-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyText}>Em breve.</Text>
          <Text style={styles.emptyHint}>Vídeos virão numa próxima atualização.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  usageBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingTop: 8,
    paddingBottom: 4,
  },
  usageText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
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
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  photoTile: {
    width: '32%',
    aspectRatio: 1,
    marginBottom: 4,
    marginRight: '1%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  photoThumb: {
    width: '100%',
    height: '100%',
  },
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
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  docName: { fontSize: 15, color: colors.text, fontWeight: '600', marginBottom: 2 },
  docMeta: { fontSize: 12, color: colors.textSecondary },
});
