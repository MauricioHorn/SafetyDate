import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography } from '@/lib/theme';

export default function Signup() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignup() {
    if (!fullName || !email || !password) {
      Alert.alert('Ops', 'Preencha todos os campos obrigatórios');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Ops', 'Senha deve ter pelo menos 6 caracteres');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, phone },
      },
    });
    setLoading(false);

    if (error) {
      Alert.alert('Erro ao cadastrar', error.message);
      return;
    }

    if (data.user) {
      Alert.alert(
        'Conta criada!',
        'Verifique seu e-mail para confirmar o cadastro.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      );
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.back}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Criar conta</Text>
            <Text style={styles.subtitle}>É grátis e leva menos de 1 minuto</Text>
          </View>

          <View style={styles.form}>
            <Input
              label="Nome completo"
              icon="person"
              placeholder="Maria Silva"
              value={fullName}
              onChangeText={setFullName}
            />
            <Input
              label="E-mail"
              icon="mail"
              placeholder="seu@email.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Input
              label="Celular (opcional)"
              icon="call"
              placeholder="(11) 99999-9999"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
            />
            <Input
              label="Senha"
              icon="lock-closed"
              placeholder="Mínimo 6 caracteres"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <Button label="Criar minha conta" onPress={handleSignup} loading={loading} />

            <Text style={styles.terms}>
              Ao criar sua conta você concorda com nossos{' '}
              <Text style={styles.link}>Termos de Uso</Text> e{' '}
              <Text style={styles.link}>Política de Privacidade</Text>.
            </Text>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Já tem conta?</Text>
              <Pressable onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.link}>Entrar</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: spacing.lg },
  back: { marginBottom: spacing.lg },
  header: { marginBottom: spacing.xl },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary },
  form: { gap: spacing.sm },
  terms: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
  },
  footerText: { ...typography.caption, color: colors.textSecondary },
  link: { color: colors.primary, fontWeight: '700' },
});
