import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Button } from '@/components/Button';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import {
  getActiveSession,
  getEmergencyContacts,
  startLiveShare,
  stopLiveShare,
  openWhatsAppLiveShare,
  SafetySession,
} from '@/lib/safety';

const FEATURE_NAME = 'Tô Aqui';

const CONTEXT_OPTIONS = [
  'Estou numa festa',
  'Saindo com alguém',
  'Na academia',
  'Voltando pra casa',
  'Outro',
] as const;

const LIVESHARE_CONTEXT_STORAGE_KEY = '@live_share/context';
const LIVESHARE_REMINDER_NOTIFICATION_TYPE = 'liveshare-reminder';
const LIVESHARE_REMINDER_SECONDS = 3 * 60 * 60;
const ANDROID_CHANNEL_ID = 'live-share';

let scheduledReminderId: string | null = null;

function formatElapsed(startedAt: string): string {
  const diffMs = Date.now() - new Date(startedAt).getTime();
  if (diffMs < 0) return 'agora';
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}min`;
  }
  if (minutes > 0) {
    return `${minutes} min`;
  }
  return 'menos de 1 min';
}

async function ensureNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === 'granted';
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: FEATURE_NAME,
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

async function cancelLiveShareReminder() {
  if (!scheduledReminderId) return;
  await Notifications.cancelScheduledNotificationAsync(scheduledReminderId);
  scheduledReminderId = null;
}

async function scheduleLiveShareReminder() {
  await cancelLiveShareReminder();

  const hasPermission = await ensureNotificationPermissions();
  if (!hasPermission) return;

  await ensureAndroidChannel();

  scheduledReminderId = await Notifications.scheduleNotificationAsync({
    content: {
      title: FEATURE_NAME,
      body: 'Você ainda está compartilhando sua localização. Deseja parar?',
      sound: 'default',
      data: { type: LIVESHARE_REMINDER_NOTIFICATION_TYPE },
      ...(Platform.OS === 'android' && { channelId: ANDROID_CHANNEL_ID }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: LIVESHARE_REMINDER_SECONDS,
    },
  });
}

async function askLocationPermissions(): Promise<boolean> {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    Alert.alert(
      'Permissão de localização necessária',
      'Precisamos da sua localização para compartilhar onde você está.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
      ]
    );
    return false;
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    Alert.alert(
      'Localização limitada',
      'Sem permissão "Sempre", sua localização só atualiza com o app aberto. Você pode continuar assim ou abrir Ajustes.',
      [
        { text: 'Continuar', style: 'default' },
        { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
      ]
    );
  }

  return true;
}

export default function LiveShareScreen() {
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [activeSession, setActiveSession] = useState<SafetySession | null>(null);
  const [selectedContext, setSelectedContext] = useState<string>(CONTEXT_OPTIONS[0]);
  const [customContext, setCustomContext] = useState('');
  const [activeContext, setActiveContext] = useState('');
  const [elapsedLabel, setElapsedLabel] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resolvedContext =
    selectedContext === 'Outro'
      ? customContext.trim() || 'Outro'
      : selectedContext;

  const refreshSession = useCallback(async () => {
    try {
      const session = await getActiveSession();
      if (session) {
        const storedContext = await AsyncStorage.getItem(LIVESHARE_CONTEXT_STORAGE_KEY);
        setActiveSession(session);
        setActiveContext(storedContext || '');
        setSharing(true);
        setElapsedLabel(formatElapsed(session.started_at));
      } else {
        setActiveSession(null);
        setActiveContext('');
        setSharing(false);
      }
    } catch (error) {
      console.error('[live-share] refresh failed:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshSession();
    }, [refreshSession])
  );

  useEffect(() => {
    if (!sharing || !activeSession) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const tick = () => setElapsedLabel(formatElapsed(activeSession.started_at));
    tick();
    timerRef.current = setInterval(tick, 30000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sharing, activeSession?.id, activeSession?.started_at]);

  const handleStart = async () => {
    if (selectedContext === 'Outro' && !customContext.trim()) {
      Alert.alert('Contexto', 'Descreva brevemente onde você está ou o que está fazendo.');
      return;
    }

    try {
      const contacts = await getEmergencyContacts();
      if (contacts.length === 0) {
        Alert.alert(
          'Adicione contatos',
          'Cadastre pelo menos uma amiga de confiança para compartilhar sua localização.',
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Cadastrar', onPress: () => router.push('/emergency-contacts') },
          ]
        );
        return;
      }

      const granted = await askLocationPermissions();
      if (!granted) return;

      setStarting(true);
      const sessionId = await startLiveShare(resolvedContext);
      await AsyncStorage.setItem(LIVESHARE_CONTEXT_STORAGE_KEY, resolvedContext);
      await scheduleLiveShareReminder();
      await refreshSession();
      setActiveContext(resolvedContext);

      // Abre WhatsApp do contato principal com a mensagem pronta.
      // O usuário ainda precisa tocar em "Enviar" no WhatsApp — não enviamos automaticamente.
      try {
        const primary = contacts.find((c) => c.is_primary) || contacts[0];
        if (primary) {
          const gps = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const batteryRaw = await Battery.getBatteryLevelAsync().catch(() => null);
          const batteryLevel = batteryRaw !== null ? Math.round(batteryRaw * 100) : undefined;

          // Busca o view_token específico do contato principal pra montar o link /track.
          // Se falhar (ex: rede), seguimos sem o link — o WhatsApp ainda abre com o pin do Maps.
          let trackUrl: string | undefined;
          try {
            const { data: viewRow } = await supabase
              .from('safety_session_views')
              .select('view_token')
              .eq('session_id', sessionId)
              .eq('contact_id', primary.id)
              .maybeSingle();
            if (viewRow?.view_token) {
              trackUrl = `https://elasapp.com.br/track/${viewRow.view_token}`;
            }
          } catch (tokenErr) {
            console.warn('[live-share] fetch view_token failed:', tokenErr);
          }

          await openWhatsAppLiveShare(
            primary,
            {
              latitude: gps.coords.latitude,
              longitude: gps.coords.longitude,
              accuracy: gps.coords.accuracy ?? undefined,
              batteryLevel,
              timestamp: new Date().toISOString(),
            },
            resolvedContext,
            trackUrl
          );
        }
      } catch (whatsErr) {
        console.warn('[live-share] open whatsapp failed:', whatsErr);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Não foi possível compartilhar.';
      Alert.alert('Erro', message);
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    if (!activeSession) return;

    Alert.alert(
      'Parar de compartilhar?',
      'Suas amigas deixarão de ver sua localização ao vivo.',
      [
        { text: 'Continuar compartilhando', style: 'cancel' },
        {
          text: 'Parar',
          style: 'destructive',
          onPress: async () => {
            try {
              setStopping(true);
              await stopLiveShare(activeSession.id);
              await AsyncStorage.removeItem(LIVESHARE_CONTEXT_STORAGE_KEY);
              await cancelLiveShareReminder();
              setSharing(false);
              setActiveSession(null);
              setActiveContext('');
            } catch (error: unknown) {
              const message =
                error instanceof Error ? error.message : 'Não foi possível encerrar.';
              Alert.alert('Erro', message);
            } finally {
              setStopping(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={colors.text} />
          </Pressable>
          <Text style={styles.screenTitle}>{FEATURE_NAME}</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {sharing && activeSession ? (
            <View style={styles.activeBlock}>
              <View style={styles.activeIconWrap}>
                <Ionicons name="navigate" size={36} color={colors.primary} />
              </View>
              <Text style={styles.activeTitle}>
                Você está compartilhando sua localização
              </Text>
              {activeContext ? (
                <Text style={styles.activeContext}>{activeContext}</Text>
              ) : null}
              <Text style={styles.activeElapsed}>Ativo há {elapsedLabel}</Text>
              <Button
                label="Parar de compartilhar"
                variant="danger"
                onPress={handleStop}
                loading={stopping}
                style={{ marginTop: spacing.xl }}
              />
            </View>
          ) : (
            <>
              <Text style={styles.lead}>
                Compartilhe onde você está, agora, com suas amigas.
              </Text>

              <Text style={styles.sectionLabel}>O que está acontecendo?</Text>
              <View style={styles.chipsWrap}>
                {CONTEXT_OPTIONS.map((option) => {
                  const selected = selectedContext === option;
                  return (
                    <Pressable
                      key={option}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setSelectedContext(option)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {selectedContext === 'Outro' && (
                <TextInput
                  style={styles.customInput}
                  value={customContext}
                  onChangeText={setCustomContext}
                  placeholder="Descreva o contexto..."
                  placeholderTextColor={colors.textMuted}
                  maxLength={120}
                  multiline
                />
              )}

              <Button
                label="Compartilhar agora"
                onPress={handleStart}
                loading={starting}
                style={{ marginTop: spacing.xl }}
              />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: { flex: 1 },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    ...typography.h3,
    color: colors.text,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  lead: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    lineHeight: 24,
  },
  sectionLabel: {
    ...typography.bodyBold,
    color: colors.text,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySubtle,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextSelected: {
    color: colors.primary,
  },
  customInput: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    color: colors.text,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  activeBlock: {
    alignItems: 'center',
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  activeTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  activeContext: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  activeElapsed: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
});
