import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '@/lib/theme';

type Flag = 'green' | 'yellow' | 'red';

interface FlagBadgeProps {
  flag: Flag;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
}

const flagConfig: Record<Flag, { color: string; bg: string; icon: string; label: string }> = {
  green: {
    color: colors.flagGreen,
    bg: colors.flagGreenBg,
    icon: 'shield-checkmark',
    label: 'Sem alertas',
  },
  yellow: {
    color: colors.flagYellow,
    bg: colors.flagYellowBg,
    icon: 'warning',
    label: 'Atenção',
  },
  red: {
    color: colors.flagRed,
    bg: colors.flagRedBg,
    icon: 'alert-circle',
    label: 'Alto risco',
  },
};

export function FlagBadge({ flag, label, size = 'md' }: FlagBadgeProps) {
  const config = flagConfig[flag];
  const iconSize = size === 'sm' ? 14 : size === 'lg' ? 22 : 18;

  return (
    <View style={[styles.container, { backgroundColor: config.bg }, sizeStyles[size]]}>
      <Ionicons name={config.icon as any} size={iconSize} color={config.color} />
      <Text style={[styles.text, { color: config.color }, textSizeStyles[size]]}>
        {label ?? config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.full,
    gap: 6,
  },
  text: {
    fontWeight: '700',
  },
});

const sizeStyles = {
  sm: { paddingHorizontal: 8, paddingVertical: 4 },
  md: { paddingHorizontal: 12, paddingVertical: 6 },
  lg: { paddingHorizontal: 16, paddingVertical: 10 },
};

const textSizeStyles = {
  sm: { fontSize: 11 },
  md: { fontSize: 13 },
  lg: { fontSize: 15 },
};
