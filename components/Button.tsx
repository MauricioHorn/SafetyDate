import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { colors, radius, typography } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  onPress: () => void;
  label: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  onPress,
  label,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth = true,
  style,
}: ButtonProps) {
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  const isDisabled = disabled || loading;

  const containerStyle: ViewStyle = {
    ...styles.base,
    ...sizes[size],
    ...(fullWidth && { width: '100%' }),
    ...(isDisabled && { opacity: 0.5 }),
    ...style,
  };

  const textStyle: TextStyle = {
    ...styles.text,
    ...textSizes[size],
    ...(variant === 'secondary' && { color: colors.text }),
    ...(variant === 'ghost' && { color: colors.primary }),
  };

  if (variant === 'primary') {
    return (
      <Pressable onPress={handlePress} disabled={isDisabled} style={{ width: fullWidth ? '100%' : undefined }}>
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={containerStyle}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={textStyle}>{label}</Text>
          )}
        </LinearGradient>
      </Pressable>
    );
  }

  const bgByVariant: Record<Variant, string> = {
    primary: colors.primary,
    secondary: colors.surfaceElevated,
    ghost: 'transparent',
    danger: colors.danger,
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={[containerStyle, { backgroundColor: bgByVariant[variant] }]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={textStyle}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  text: {
    color: colors.textOnPrimary,
    fontWeight: '700',
  },
});

const sizes: Record<Size, ViewStyle> = {
  sm: { paddingVertical: 10, paddingHorizontal: 16 },
  md: { paddingVertical: 14, paddingHorizontal: 20 },
  lg: { paddingVertical: 18, paddingHorizontal: 24 },
};

const textSizes: Record<Size, TextStyle> = {
  sm: typography.caption,
  md: typography.bodyBold,
  lg: typography.h3,
};
