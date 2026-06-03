import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import {
  addVaultItem,
  deleteVaultItem,
  listVaultItems,
  decryptVaultItem,
  getKeyFromKeychain,
} from '@/lib/vault';
import { colors, spacing } from '@/lib/theme';

export default function VaultNoteEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = params.id;

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(!!editingId);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      if (editingId) {
        try {
          const items = await listVaultItems(user.id, 'note');
          const item = items.find((i) => i.id === editingId);
          if (!item) {
            Alert.alert('Erro', 'Nota não encontrada.');
            router.back();
            return;
          }
          const key = await getKeyFromKeychain(user.id);
          if (!key) {
            Alert.alert('Erro', 'Cofre trancado.');
            router.back();
            return;
          }
          const { filename, content: noteContent } = await decryptVaultItem(item, key);
          setTitle(filename);
          setContent(noteContent);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : 'Não foi possível abrir a nota.';
          Alert.alert('Erro', message);
          router.back();
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [editingId, router]);

  const handleSave = async () => {
    if (!userId) return;
    if (!title.trim()) {
      Alert.alert('Erro', 'A nota precisa de um título.');
      return;
    }
    if (content.length > 100000) {
      Alert.alert('Erro', 'A nota está muito grande (limite 100KB).');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await deleteVaultItem(userId, editingId);
      }
      await addVaultItem({
        userId,
        type: 'note',
        filename: title.trim(),
        content,
      });
      router.back();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Tente de novo.';
      Alert.alert('Erro ao salvar', message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editingId || !userId) return;
    Alert.alert('Apagar nota', 'Tem certeza? Não dá pra desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await deleteVaultItem(userId, editingId);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: editingId ? 'Editar nota' : 'Nova nota',
          headerShown: true,
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}>
        <TextInput
          style={styles.titleInput}
          placeholder="Título"
          placeholderTextColor={colors.textSecondary}
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
        <TextInput
          style={styles.contentInput}
          placeholder="Escreva aqui..."
          placeholderTextColor={colors.textSecondary}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Salvar</Text>
          )}
        </TouchableOpacity>

        {editingId && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color="#fff" />
            <Text style={styles.saveBtnText}>Apagar nota</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  titleInput: {
    fontSize: 18,
    color: colors.text,
    fontWeight: '600',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contentInput: {
    fontSize: 15,
    color: colors.text,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 300,
  },
  saveBtn: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: '#EF4444',
  },
});
