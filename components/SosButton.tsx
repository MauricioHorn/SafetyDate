import React, { useEffect } from 'react';
import { StyleSheet, Pressable, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { colors } from '@/lib/theme';

const QUICK_ACTION_ID = 'unlock';

export function SosFab() {
  const router = useRouter();
  useQuickActionRouting();

  useEffect(() => {
    QuickActions.setItems([
      {
        id: QUICK_ACTION_ID,
        title: 'Desbloquear',
        icon:
          Platform.OS === 'ios'
            ? 'symbol:lock.open'
            : 'shortcut_unlock',
        params: { href: '/sos-unlock' },
      },
    ]).catch(() => null);
  }, []);

  const handlePress = () => {
    router.push('/sos-unlock');
  };

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.fab,
        pressed && styles.fabPressed,
      ]}
      accessibilityLabel="Atalho"
      accessibilityHint="Abre a tela de desbloqueio"
    >
      <View style={styles.iconWrapper}>
        <Ionicons name="lock-closed" size={22} color={colors.flagRed} />
      </View>
    </Pressable>
  );
}

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
