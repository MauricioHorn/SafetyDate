import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { getPhotoFromVault, deletePhotoFromVault } from '@/lib/vault';
import { colors, spacing } from '@/lib/theme';

export default function VaultPhotoViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const itemId = params.id;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [savingToGallery, setSavingToGallery] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !itemId) {
        router.back();
        return;
      }
      setUserId(user.id);
      try {
        const dataUri = await getPhotoFromVault(user.id, itemId);
        setPhotoUri(dataUri);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Não foi possível abrir a foto.';
        Alert.alert('Erro', message);
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [itemId, router]);

  const handleDelete = () => {
    if (!userId || !itemId) return;
    Alert.alert('Apagar foto', 'Tem certeza? Não dá pra desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          await deletePhotoFromVault(userId, itemId);
          router.back();
        },
      },
    ]);
  };

  const handleSaveToGallery = async () => {
    if (!photoUri) {
      Alert.alert('Erro', 'Foto não disponível.');
      return;
    }

    setSavingToGallery(true);
    try {
      const perm = await MediaLibrary.requestPermissionsAsync(true);
      if (perm.status !== 'granted') {
        Alert.alert(
          'Sem permissão',
          'O ELAS precisa de permissão pra salvar fotos na sua galeria. Você pode permitir nos Ajustes.'
        );
        return;
      }

      const base64 = photoUri.replace(/^data:image\/jpeg;base64,/, '');
      const tempPath = `${FileSystem.cacheDirectory}vault_export_${Date.now()}.jpg`;
      await FileSystem.writeAsStringAsync(tempPath, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      await MediaLibrary.saveToLibraryAsync(tempPath);

      await FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});

      Alert.alert('Pronto', 'Foto salva na sua galeria.');
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível salvar.';
      Alert.alert('Erro ao salvar', message);
    } finally {
      setSavingToGallery(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Foto',
          headerShown: true,
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : photoUri ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          maximumZoomScale={3}
          minimumZoomScale={1}
        >
          <Image source={{ uri: photoUri }} style={styles.fullImage} resizeMode="contain" />
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={styles.errorText}>Foto não disponível.</Text>
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={handleSaveToGallery}
          disabled={savingToGallery}
        >
          {savingToGallery ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Ionicons name="download-outline" size={20} color={colors.text} />
          )}
          <Text style={styles.actionText}>
            {savingToGallery ? 'Salvando...' : 'Salvar na galeria'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
          <Text style={[styles.actionText, { color: '#EF4444' }]}>Apagar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%', minHeight: 400 },
  errorText: { color: colors.textSecondary, fontSize: 14 },
  actions: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  deleteBtn: { backgroundColor: colors.surface },
  actionText: { color: colors.text, fontSize: 14, fontWeight: '500' },
});
