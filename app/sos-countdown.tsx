import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { triggerSOS } from '@/lib/safety';

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
      <Text style={styles.emoji}>🚨</Text>
      <Text style={styles.title}>ALERTA SERA ENVIADO</Text>
      <Text style={styles.subtitle}>Cancele se foi engano</Text>
      <Text style={styles.counter}>{Math.max(secondsLeft, 0)}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>
      <Text style={styles.remaining}>segundos restantes</Text>

      <Pressable style={styles.cancelButton} onPress={handleCancel} disabled={submitting}>
        <Text style={styles.cancelText}>CANCELAR</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emoji: {
    fontSize: 72,
    marginBottom: 20,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  subtitle: {
    marginTop: 12,
    color: '#FEE2E2',
    fontSize: 20,
    fontWeight: '500',
  },
  counter: {
    marginTop: 24,
    color: '#FFFFFF',
    fontSize: 140,
    fontWeight: '900',
    lineHeight: 156,
  },
  progressTrack: {
    width: '100%',
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFFFFF',
  },
  remaining: {
    marginTop: 8,
    color: '#FEE2E2',
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 42,
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  cancelText: {
    color: '#DC2626',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
