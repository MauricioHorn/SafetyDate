import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Switch,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { Button } from '@/components/Button';
import { colors, spacing, typography, radius } from '@/lib/theme';
import { supabase } from '@/lib/supabase';

/**
 * LIMITAÇÃO: não é possível imitar a tela de chamada NATIVA do sistema (iOS/Android).
 * Esta feature usa uma tela dentro do app + notificação local agendada.
 * Disparo confiável em background depende de build real (não Expo Go em todos os casos).
 */

const FAKE_CALL_NOTIFICATION_TYPE = 'fake-call';
const ANDROID_CHANNEL_ID = 'fake-call';

let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
let scheduledNotificationId: string | null = null;
let notificationListenersAttached = false;
let navigatingToIncoming = false;

type FakeCallParams = {
  callerName: string;
  photoUri: string;
  audioOn: string;
};

function navigateToIncoming(params: FakeCallParams) {
  if (navigatingToIncoming) return;
  navigatingToIncoming = true;
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  router.push({
    pathname: '/fake-call-incoming',
    params,
  });
  setTimeout(() => {
    navigatingToIncoming = false;
  }, 3000);
}

function paramsFromNotificationData(
  data: Record<string, unknown> | undefined
): FakeCallParams | null {
  if (!data || data.type !== FAKE_CALL_NOTIFICATION_TYPE) return null;
  return {
    callerName: String(data.callerName ?? 'Desconhecido'),
    photoUri: String(data.photoUri ?? ''),
    audioOn: String(data.audioOn ?? '0'),
  };
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
    name: 'Ligação falsa',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 500, 200, 500],
    sound: 'default',
  });
}

function attachFakeCallNotificationListeners() {
  if (notificationListenersAttached) return;
  notificationListenersAttached = true;

  Notifications.addNotificationReceivedListener((notification) => {
    const params = paramsFromNotificationData(
      notification.request.content.data as Record<string, unknown>
    );
    if (params) navigateToIncoming(params);
  });

  Notifications.addNotificationResponseReceivedListener((response) => {
    const params = paramsFromNotificationData(
      response.notification.request.content.data as Record<string, unknown>
    );
    if (params) navigateToIncoming(params);
  });
}

function clearPendingSchedule() {
  if (pendingTimeout) {
    clearTimeout(pendingTimeout);
    pendingTimeout = null;
  }
  if (scheduledNotificationId) {
    void Notifications.cancelScheduledNotificationAsync(scheduledNotificationId);
    scheduledNotificationId = null;
  }
}

function clampMinutes(value: number): number {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.floor(value), 24 * 60);
}

function parseMinutesInput(text: string, fallback: number): number {
  const digits = text.replace(/\D/g, '');
  if (digits === '') return fallback;
  return clampMinutes(parseInt(digits, 10));
}

async function incrementFakeCallCount(): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('fake_call_count')
      .eq('id', user.id)
      .single();

    const { error } = await supabase
      .from('profiles')
      .update({ fake_call_count: (profile?.fake_call_count ?? 0) + 1 })
      .eq('id', user.id);

    if (error) console.error('[fake-call] increment fake_call_count failed:', error);
  } catch (error) {
    console.error('[fake-call] increment fake_call_count failed:', error);
  }
}

function callerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function FakeCallSetupScreen() {
  const [callerName, setCallerName] = useState('Mãe');
  const [minutes, setMinutes] = useState(30);
  const [minutesText, setMinutesText] = useState('30');
  const [audioOn, setAudioOn] = useState(true);
  const [scheduling, setScheduling] = useState(false);
  const minutesInputRef = useRef<TextInput>(null);

  useEffect(() => {
    attachFakeCallNotificationListeners();
    void ensureAndroidChannel();

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }, []);

  const syncMinutes = (next: number) => {
    const clamped = clampMinutes(next);
    setMinutes(clamped);
    setMinutesText(String(clamped));
  };

  const handleMinutesChangeText = (text: string) => {
    setMinutesText(text);
    if (text === '') return;
    const parsed = parseInt(text.replace(/\D/g, ''), 10);
    if (!Number.isNaN(parsed)) setMinutes(clampMinutes(parsed));
  };

  const handleMinutesBlur = () => {
    syncMinutes(parseMinutesInput(minutesText, minutes));
  };

  const handleCallNow = () => {
    void incrementFakeCallCount();
    const params: FakeCallParams = {
      callerName: callerName.trim() || 'Desconhecido',
      photoUri: '',
      audioOn: audioOn ? '1' : '0',
    };
    navigateToIncoming(params);
  };

  const scheduleCall = async () => {
    const name = callerName.trim() || 'Desconhecido';
    const mins = clampMinutes(minutes);
    const delayMs = mins * 60 * 1000;
    const params: FakeCallParams = {
      callerName: name,
      photoUri: '',
      audioOn: audioOn ? '1' : '0',
    };

    setScheduling(true);
    try {
      clearPendingSchedule();

      const hasPermission = await ensureNotificationPermissions();
      if (!hasPermission) {
        Alert.alert(
          'Permissão necessária',
          'Ative notificações para a ligação falsa tocar no horário agendado (especialmente com o app em segundo plano).'
        );
      }

      if (hasPermission) {
        await ensureAndroidChannel();
        scheduledNotificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Chamada recebida',
            body: name,
            sound: 'default',
            data: {
              type: FAKE_CALL_NOTIFICATION_TYPE,
              ...params,
            },
            ...(Platform.OS === 'android' && { channelId: ANDROID_CHANNEL_ID }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: Math.max(mins * 60, 1),
          },
        });
      }

      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        if (scheduledNotificationId) {
          void Notifications.cancelScheduledNotificationAsync(scheduledNotificationId);
          scheduledNotificationId = null;
        }
        navigateToIncoming(params);
      }, delayMs);

      void incrementFakeCallCount();

      Alert.alert(
        'Ligação agendada',
        `Em ${mins} minuto${mins === 1 ? '' : 's'} você receberá a chamada simulada de "${name}".\n\n` +
          'Com o app aberto, a tela abre automaticamente. Em segundo plano, use a notificação (build real recomendado).'
      );
      router.back();
    } catch (error) {
      console.error('[fake-call] schedule failed:', error);
      Alert.alert('Erro', 'Não foi possível agendar a ligação. Tente novamente.');
    } finally {
      setScheduling(false);
    }
  };

  const initials = callerInitials(callerName);

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
          <Text style={styles.title}>Ligação falsa</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.lead}>
            Agende uma chamada simulada para ter uma desculpa de sair com segurança. Não substitui
            a tela nativa do telefone — é uma simulação dentro do app.
          </Text>

          <Text style={styles.label}>Quem está ligando</Text>
          <TextInput
            style={styles.input}
            value={callerName}
            onChangeText={setCallerName}
            placeholder="Ex: Mãe, Chefe..."
            placeholderTextColor={colors.textMuted}
            maxLength={40}
          />

          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <Text style={styles.avatarHint}>
              Foto opcional: por enquanto usamos as iniciais do nome.
            </Text>
          </View>

          <Text style={styles.label}>Em quantos minutos</Text>
          <View style={styles.minutesRow}>
            <Pressable
              style={styles.stepBtn}
              onPress={() => syncMinutes(minutes - 1)}
              accessibilityLabel="Diminuir minutos"
            >
              <Ionicons name="remove" size={24} color={colors.text} />
            </Pressable>
            <TextInput
              ref={minutesInputRef}
              style={styles.minutesInput}
              value={minutesText}
              onChangeText={handleMinutesChangeText}
              onBlur={handleMinutesBlur}
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={4}
              selectTextOnFocus
            />
            <Pressable
              style={styles.stepBtn}
              onPress={() => syncMinutes(minutes + 1)}
              accessibilityLabel="Aumentar minutos"
            >
              <Ionicons name="add" size={24} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.toggleRow}>
            <View style={styles.toggleTextWrap}>
              <Text style={styles.toggleLabel}>Tocar áudio ao atender</Text>
              <Text style={styles.toggleHint}>Voz pré-gravada simulando conversa</Text>
            </View>
            <Switch
              value={audioOn}
              onValueChange={setAudioOn}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.text}
            />
          </View>

          <Button
            label="Ligar agora"
            onPress={handleCallNow}
            style={{ marginTop: spacing.xl }}
          />
          <Button
            label="Agendar ligação"
            variant="secondary"
            onPress={scheduleCall}
            loading={scheduling}
            style={{ marginTop: spacing.md }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.h3, color: colors.text },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  lead: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },
  label: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
    marginBottom: spacing.lg,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: colors.text },
  avatarHint: { flex: 1, ...typography.caption, color: colors.textSecondary },
  minutesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  stepBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  minutesInput: {
    minWidth: 88,
    textAlign: 'center',
    ...typography.h2,
    color: colors.text,
    paddingVertical: spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  toggleTextWrap: { flex: 1 },
  toggleLabel: { ...typography.bodyBold, color: colors.text },
  toggleHint: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
});
