import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { colors, spacing, typography } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { createVault } from '@/lib/vault';
import { useToast } from '@/contexts/ToastContext';

export default function VaultCreateScreen() {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (password.length < 8) {
      showToast('Senha fraca: A senha precisa ter pelo menos 8 caracteres.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Senhas diferentes: As senhas não coincidem.', 'error');
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      showToast('Erro: Você precisa estar logada para criar o cofre.', 'error');
      return;
    }

    setLoading(true);
    try {
      await createVault(user.id, password);
      router.replace('/vault');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível criar o cofre.';
      showToast(`Erro: ${message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Stack.Screen
          options={{
            title: 'Crie seu cofre',
            headerShown: true,
            headerBackButtonDisplayMode: 'minimal',
            headerBackTitle: '',
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.text,
          }}
        />

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.lead}>
            O cofre é seu espaço privado. Nem o ELAS pode ver o que você guarda dentro. Defina uma
            senha — se você esquecer, vai precisar resetar e perde tudo.
          </Text>

          <Input
            label="Senha do cofre"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
          />
          <Input
            label="Confirme a senha"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="newPassword"
          />

          <Button label="Criar cofre" onPress={handleCreate} loading={loading} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  lead: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xl,
  },
});
