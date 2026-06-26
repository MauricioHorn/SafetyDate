import { Animated, StyleSheet, Text } from 'react-native';
import { colors, radius } from '@/lib/theme';

export type ToastType = 'success' | 'error';

type ToastProps = {
  message: string;
  type: ToastType;
  opacity: Animated.Value;
};

function formatMessage(message: string, type: ToastType): string {
  if (type === 'success' && !message.includes('✓')) {
    return `✓ ${message}`;
  }
  return message;
}

export function Toast({ message, type, opacity }: ToastProps) {
  const accentColor = type === 'error' ? colors.danger : colors.success;

  return (
    <Animated.View
      style={[styles.toast, { opacity, borderLeftColor: accentColor }]}
      pointerEvents="none"
    >
      <Text style={styles.toastText}>{formatMessage(message, type)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    left: 24,
    right: 24,
    backgroundColor: colors.surfaceElevated,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  toastText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
