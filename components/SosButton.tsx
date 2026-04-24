import React from 'react';
import { View, Text, StyleSheet, Pressable, ViewStyle, StyleProp } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

interface Props {
  style?: StyleProp<ViewStyle>;
}

export function SosButton({ style }: Props) {
  const router = useRouter();

  const handlePress = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/sos-countdown');
  };

  return (
    <View style={[styles.container, style]}>
      <Pressable onPress={handlePress} style={styles.button}>
        <Text style={styles.icon}>🚨</Text>
        <Text style={styles.label}>EMERGÊNCIA</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  button: {
    minHeight: 64,
    backgroundColor: '#DC2626',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  icon: {
    fontSize: 24,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
});
