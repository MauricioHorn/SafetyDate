import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { colors, spacing, typography } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { lockVault } from '@/lib/vault';

export default function VaultScreen() {
  const [locking, setLocking] = useState(false);

  const handleLock = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.back();
      return;
    }

    setLocking(true);
    try {
      await lockVault(user.id);
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível trancar o cofre.';
      Alert.alert('Erro', message);
    } finally {
      setLocking(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Cofre',
          headerShown: true,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <View style={styles.content}>
        <Text style={styles.placeholder}>
          Seu cofre está aberto. Conteúdo (fotos, vídeos, notas, documentos, áudios) será
          adicionado na próxima fase.
        </Text>

        <Button
          label="Trancar cofre"
          variant="secondary"
          onPress={handleLock}
          loading={locking}
          style={{ marginTop: spacing.xl }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  placeholder: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
});
