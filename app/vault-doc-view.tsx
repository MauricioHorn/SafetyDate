import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import { supabase } from '@/lib/supabase';
import { getDocumentFromVault, deleteDocumentFromVault } from '@/lib/vault';
import { colors, spacing } from '@/lib/theme';

export default function VaultDocViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const itemId = params.id;

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [docInfo, setDocInfo] = useState<{ fileUri: string; filename: string; mimeType: string } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !itemId) {
        router.back();
        return;
      }
      setUserId(user.id);
      try {
        const info = await getDocumentFromVault(user.id, itemId);
        setDocInfo(info);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Não foi possível abrir o documento.';
        Alert.alert('Erro', message);
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [itemId, router]);

  const handleOpen = async () => {
    if (!docInfo) return;
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      Alert.alert('Erro', 'Compartilhamento não disponível neste aparelho.');
      return;
    }
    await Sharing.shareAsync(docInfo.fileUri, {
      mimeType: docInfo.mimeType,
      dialogTitle: docInfo.filename,
    });
  };

  const handleDelete = () => {
    if (!userId || !itemId) return;
    Alert.alert('Apagar documento', 'Tem certeza? Não dá pra desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await deleteDocumentFromVault(userId, itemId);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Documento', headerBackTitle: 'Voltar', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Descriptografando...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Documento', headerBackTitle: 'Voltar', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />

      <View style={styles.docPreview}>
        <Ionicons name="document-text" size={80} color={colors.primary} />
        <Text style={styles.filename} numberOfLines={2}>{docInfo?.filename || ''}</Text>
        <Text style={styles.hint}>O arquivo será aberto pelo app que você escolher.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleOpen}>
          <Ionicons name="open-outline" size={20} color="#fff" />
          <Text style={styles.actionTextPrimary}>Abrir documento</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
          <Text style={styles.actionTextDanger}>Apagar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 12 },
  loadingText: { color: colors.textSecondary, fontSize: 13 },
  docPreview: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  filename: { fontSize: 16, color: colors.text, fontWeight: '500', textAlign: 'center' },
  hint: { fontSize: 13, color: colors.textSecondary, textAlign: 'center' },
  actions: { padding: spacing.md, gap: spacing.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: spacing.md, borderRadius: 12, backgroundColor: colors.primary },
  deleteBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' },
  actionTextPrimary: { color: '#fff', fontSize: 15, fontWeight: '600' },
  actionTextDanger: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
});
