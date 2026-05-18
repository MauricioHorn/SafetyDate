import React, { useRef } from 'react';
import { StyleSheet, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

export function SosFab() {
  const router = useRouter();
  const pulseTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearPulseTimers = () => {
    pulseTimers.current.forEach((t) => clearTimeout(t));
    pulseTimers.current = [];
  };

  const handlePressIn = () => {
    clearPulseTimers();
    // Pulso 1 — leve, em 1 segundo
    pulseTimers.current.push(
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
      }, 1000)
    );
    // Pulso 2 — médio, em 2.5 segundos
    pulseTimers.current.push(
      setTimeout(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => null);
      }, 2500)
    );
    // Pulso 3 é disparado pelo onLongPress (4s) — não duplicar aqui
  };

  const handlePressOut = () => {
    // Usuário soltou antes dos 4s — cancela tudo
    clearPulseTimers();
  };

  const handleLongPress = async () => {
    clearPulseTimers();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    router.push('/sos-countdown');
  };

  const handlePress = async () => {
    // Tap rápido (menos de 4s): não faz nada além de feedback discreto
    await Haptics.selectionAsync();
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onLongPress={handleLongPress}
      delayLongPress={4000}
      style={({ pressed }) => [
        styles.fab,
        pressed && styles.fabPressed,
      ]}
      accessibilityLabel="Botão de emergência SOS"
      accessibilityHint="Mantenha pressionado por 4 segundos para acionar"
    >
      <View style={styles.iconWrapper}>
        <Ionicons name="alert" size={22} color={colors.flagRed} />
      </View>
    </Pressable>
  );
}

// Mantendo export antigo pra retrocompatibilidade caso outro arquivo importe
export const SosButton = SosFab;

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 110,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.flagRedBorder,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  fabPressed: {
    backgroundColor: colors.flagRedBg,
    transform: [{ scale: 0.95 }],
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.flagRedBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
