import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { colors, spacing, typography } from '@/lib/theme';
import { supabase } from '@/lib/supabase';
import { unlockVault } from '@/lib/vault';
import { useToast } from '@/contexts/ToastContext';

export default function VaultUnlockScreen() {
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleUnlock = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      showToast('Erro: Você precisa estar logada.', 'error');
      return;
    }

    setLoading(true);
    try {
      await unlockVault(user.id, password);
      router.replace('/vault');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível destrancar.';
      if (message === 'Senha incorreta.') {
        showToast('Senha incorreta: Verifique sua senha e tente novamente.', 'error');
      } else {
        showToast(`Erro: ${message}`, 'error');
      }
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
            title: 'Destranque seu cofre',
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
            Digite sua senha. Você vai usar Face ID logo depois.
          </Text>

          <Input
            label="Senha"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
          />

          <Button label="Destrancar" onPress={handleUnlock} loading={loading} />

          <TouchableOpacity
            onPress={() => router.push('/vault-reset')}
            style={{ marginTop: 16, padding: 12, alignItems: 'center' }}
          >
            <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
              Esqueci minha senha
            </Text>
          </TouchableOpacity>
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
