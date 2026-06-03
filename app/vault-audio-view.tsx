import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { supabase } from '@/lib/supabase';
import { getAudioFromVault, deleteAudioFromVault } from '@/lib/vault';
import { colors, spacing } from '@/lib/theme';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function VaultAudioViewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const itemId = params.id;

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [audioInfo, setAudioInfo] = useState<{ fileUri: string; filename: string; mimeType: string } | null>(null);

  // Cria o player só quando o áudio estiver descriptografado
  const player = useAudioPlayer(audioInfo?.fileUri || null);
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !itemId) {
        router.back();
        return;
      }
      setUserId(user.id);
      try {
        const info = await getAudioFromVault(user.id, itemId);
        setAudioInfo(info);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Não foi possível abrir o áudio.';
        Alert.alert('Erro', message);
        router.back();
      } finally {
        setLoading(false);
      }
    })();
  }, [itemId, router]);

  // Auto-toca quando o áudio estiver carregado
  useEffect(() => {
    if (audioInfo && player && status?.isLoaded) {
      player.play();
    }
  }, [audioInfo, player, status?.isLoaded]);

  const handlePlayPause = useCallback(() => {
    if (!player) return;
    if (status?.playing) {
      player.pause();
    } else {
      player.play();
    }
  }, [player, status?.playing]);

  const handleSkip = useCallback((seconds: number) => {
    if (!player || !status) return;
    const newPosition = Math.max(0, Math.min(status.duration || 0, (status.currentTime || 0) + seconds));
    player.seekTo(newPosition);
  }, [player, status]);

  const handleDelete = () => {
    if (!userId || !itemId) return;
    Alert.alert('Apagar áudio', 'Tem certeza? Não dá pra desfazer.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Apagar',
        style: 'destructive',
        onPress: async () => {
          if (player) player.pause();
          await deleteAudioFromVault(userId, itemId);
          router.back();
        },
      },
    ]);
  };

  if (loading || !audioInfo) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Áudio', headerBackTitle: 'Voltar', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.loadingText}>Descriptografando...</Text>
      </View>
    );
  }

  const currentTime = status?.currentTime || 0;
  const duration = status?.duration || 0;
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Áudio', headerBackTitle: 'Voltar', headerStyle: { backgroundColor: colors.background }, headerTintColor: colors.text }} />

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="musical-notes" size={100} color={colors.primary} />
        </View>

        <Text style={styles.filename} numberOfLines={2}>{audioInfo.filename}</Text>

        <View style={styles.progressBarWrap}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
          <View style={styles.timeRow}>
            <Text style={styles.time}>{formatTime(currentTime)}</Text>
            <Text style={styles.time}>{formatTime(duration)}</Text>
          </View>
        </View>

        <View style={styles.controls}>
          <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(-15)}>
            <Ionicons name="play-back" size={28} color={colors.text} />
            <Text style={styles.skipLabel}>15s</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.playBtn} onPress={handlePlayPause}>
            <Ionicons
              name={status?.playing ? 'pause' : 'play'}
              size={40}
              color="#fff"
            />
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={() => handleSkip(15)}>
            <Ionicons name="play-forward" size={28} color={colors.text} />
            <Text style={styles.skipLabel}>15s</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={handleDelete}>
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
          <Text style={styles.actionTextDanger}>Apagar áudio</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 12 },
  loadingText: { color: colors.textSecondary, fontSize: 13 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  iconWrap: { padding: spacing.lg, backgroundColor: colors.surface, borderRadius: 80, marginBottom: spacing.md },
  filename: { fontSize: 17, color: colors.text, fontWeight: '600', textAlign: 'center', paddingHorizontal: spacing.md },
  progressBarWrap: { width: '100%', gap: 8, marginTop: spacing.md },
  progressBg: { height: 4, backgroundColor: colors.surface, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { fontSize: 12, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.md },
  skipBtn: { alignItems: 'center', gap: 2, padding: spacing.sm },
  skipLabel: { fontSize: 11, color: colors.textSecondary, fontWeight: '500' },
  playBtn: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  actions: { padding: spacing.md },
  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: spacing.md, borderRadius: 12 },
  deleteBtn: { borderWidth: 1, borderColor: '#EF4444' },
  actionTextDanger: { color: '#EF4444', fontSize: 14, fontWeight: '500' },
});
