import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Stack } from 'expo-router';

/**
 * Web stub: react-native-maps is native-only. Expo Go / mobile use `safe-places.tsx`.
 */
export default function SafePlacesWeb() {
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Locais Seguros' }} />
      <View style={styles.body}>
        <Text style={styles.title}>Mapa no app</Text>
        <Text style={styles.sub}>
          Locais seguros e mapa usam o app no celular (Expo Go). O preview web não
          carrega o mapa.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 24, justifyContent: 'center' },
  container: { flex: 1, backgroundColor: '#0A0A14' },
  sub: { fontSize: 14, color: '#B4B4C7', lineHeight: 20, textAlign: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 12, textAlign: 'center' },
});
