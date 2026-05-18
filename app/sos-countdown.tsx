import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { triggerSOS } from '@/lib/safety';
import { colors, radius, spacing } from '@/lib/theme';

const TOTAL_SECONDS = 10;

export default function SosCountdownScreen() {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [submitting, setSubmitting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const progress = useMemo(() => (secondsLeft / TOTAL_SECONDS) * 100, [secondsLeft]);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setSecondsLeft((current) => {
        const next = current - 1;
        if (next >= 0) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (secondsLeft > 0 || submitting) return;

    if (intervalRef.current) clearInterval(intervalRef.current);

    const fireSOS = async () => {
      try {
        setSubmitting(true);
        const alertId = await triggerSOS();
        router.replace({ pathname: '/sos-aftermath', params: { alertId } });
      } catch (error) {
        console.error('Failed to trigger SOS:', error);
        Alert.alert('Erro', 'Não foi possível disparar o SOS agora.');
        router.back();
      } finally {
        setSubmitting(false);
      }
    };

    fireSOS();
  }, [secondsLeft, submitting]);

  const handleCancel = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.eyebrow}>SOS</Text>
      <Text style={styles.title}>Acionando emergência</Text>
      <Text style={styles.subtitle}>ALERTA SERA ENVIADO</Text>
      <Text style={styles.counter}>{Math.max(secondsLeft, 0)}</Text>
      <Text style={styles.remaining}>segundos para enviar</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.helper}>
        Solte se foi engano. Suas amigas serão notificadas com sua localização e bateria atual.
      </Text>
      <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={submitting}>
        <Text style={styles.cancelText}>Cancelar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  eyebrow: {
    color: colors.flagRed,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: spacing.xl,
  },
  counter: {
    color: colors.flagRed,
    fontSize: 120,
    fontWeight: '900',
    lineHeight: 130,
    letterSpacing: -4,
  },
  remaining: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
    fontSize: 15,
    marginBottom: spacing.lg,
  },
  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    overflow: 'hidden',
    marginBottom: spacing.xl,
  },
  progressBar: {
    height: '100%',
    backgroundColor: colors.flagRed,
  },
  helper: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.md,
  },
  cancelButton: {
    width: '100%',
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
});
