import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
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
  const [savingToFiles, setSavingToFiles] = useState(false);

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

  const handleSaveToFiles = async () => {
    if (!docInfo) return;
    setSavingToFiles(true);
    try {
      // Copia o arquivo do cache temp pra Documents do app (que aparece em Files)
      const documentsDir = FileSystem.documentDirectory;
      if (!documentsDir) {
        throw new Error('Pasta de documentos não disponível.');
      }
      const targetPath = `${documentsDir}${docInfo.filename}`;

      // Apaga se já existir (pra evitar erro de "já existe")
      const info = await FileSystem.getInfoAsync(targetPath);
      if (info.exists) {
        await FileSystem.deleteAsync(targetPath, { idempotent: true });
      }

      await FileSystem.copyAsync({
        from: docInfo.fileUri,
        to: targetPath,
      });

      Alert.alert(
        'Documento salvo',
        'O arquivo foi salvo na pasta do ELAS dentro do app Arquivos do iPhone.'
      );
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível salvar.';
      Alert.alert('Erro ao salvar', message);
    } finally {
      setSavingToFiles(false);
    }
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

        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnSecondary]}
          onPress={handleSaveToFiles}
          disabled={savingToFiles}
        >
          {savingToFiles ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Ionicons name="download-outline" size={20} color={colors.text} />
          )}
          <Text style={styles.actionTextSecondary}>
            {savingToFiles ? 'Salvando...' : 'Salvar no iPhone'}
          </Text>
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
  actionBtnSecondary: { backgroundColor: colors.surface },
  deleteBtn: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#EF4444' },
  actionTextSecondary: { color: colors.text, fontSize: 15, fontWeight: '600' },
  actionTextPrimary: { color: '#fff', fontSize: 15, fontWeight: '600' },
  actionTextDanger: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
});
