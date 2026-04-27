import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { hasActivePremium } from '@/lib/revenuecat';
import { colors, spacing, typography, radius } from '@/lib/theme';

export default function Search() {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [loading, setLoading] = useState(false);

  function formatBirthDate(text: string) {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 4) return `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
    return `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
  }

  function formatCpf(text: string) {
    const cleaned = text.replace(/\D/g, '').slice(0, 11);
    if (cleaned.length <= 3) return cleaned;
    if (cleaned.length <= 6) return `${cleaned.slice(0, 3)}.${cleaned.slice(3)}`;
    if (cleaned.length <= 9) return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6)}`;
    return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
  }

  function formatPhone(text: string) {
    const cleaned = text.replace(/\D/g, '').slice(0, 11);
    if (cleaned.length <= 2) return cleaned;
    if (cleaned.length <= 7) return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }

  async function handleSearch() {
    if (!name.trim()) {
      Alert.alert('Ops', 'Digite o nome completo da pessoa');
      return;
    }
    if (!birthDate || birthDate.length < 10) {
      Alert.alert('Ops', 'Digite a data de nascimento completa');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // Verifica premium direto no RevenueCat (fonte da verdade)
      const isPremium = await hasActivePremium();

      if (!isPremium) {
        // Redireciona para paywall nativo (In-App Purchase)
        setLoading(false);
        router.push('/paywall');
        return;
      }

      // Invoca a edge function de background check
      const { data, error } = await supabase.functions.invoke('background-check', {
        body: {
          name: name.trim(),
          birthDate,
          phone: phone.replace(/\D/g, ''),
          cpf: cpf.replace(/\D/g, ''),
        },
      });

      setLoading(false);

      if (error) {
        Alert.alert('Erro na pesquisa', error.message);
        return;
      }

      if (data?.id) {
        router.push(`/report/${data.id}`);
      }
    } catch (err: any) {
      setLoading(false);
      Alert.alert('Erro', err.message || 'Algo deu errado');
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Nova pesquisa</Text>
            <Text style={styles.subtitle}>
              Preencha os dados da pessoa que você quer verificar
            </Text>
          </View>

          <Card style={styles.infoCard}>
            <View style={styles.infoIcon}>
              <Ionicons name="lock-closed" size={18} color={colors.flagGreen} />
            </View>
            <Text style={styles.infoText}>
              100% anônimo. A pessoa pesquisada nunca é notificada.
            </Text>
          </Card>

          <View style={styles.form}>
            <Input
              label="Nome completo *"
              icon="person"
              placeholder="Ex: João Silva Santos"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Input
              label="Data de nascimento *"
              icon="calendar"
              placeholder="DD/MM/AAAA"
              value={birthDate}
              onChangeText={(t) => setBirthDate(formatBirthDate(t))}
              keyboardType="numeric"
              maxLength={10}
            />
            <Input
              label="CPF (opcional, mas recomendado)"
              icon="card"
              placeholder="000.000.000-00"
              value={cpf}
              onChangeText={(t) => setCpf(formatCpf(t))}
              keyboardType="numeric"
              maxLength={14}
            />
            <Input
              label="Celular (opcional)"
              icon="call"
              placeholder="(11) 99999-9999"
              value={phone}
              onChangeText={(t) => setPhone(formatPhone(t))}
              keyboardType="phone-pad"
              maxLength={15}
            />

            <Text style={styles.helpText}>
              Quanto mais dados você fornecer, mais precisa será a busca. O nome e a data de nascimento são obrigatórios para evitar homônimos.
            </Text>

            <Button
              label="Pesquisar agora"
              onPress={handleSearch}
              loading={loading}
            />
          </View>

          <View style={styles.sources}>
            <Text style={styles.sourcesTitle}>Fontes consultadas:</Text>
            <View style={styles.sourcesList}>
              <SourceBadge label="CNJ DataJud (Tribunais)" />
              <SourceBadge label="Diário Oficial da União" />
              <SourceBadge label="Análise assistida por IA" />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SourceBadge({ label }: { label: string }) {
  return (
    <View style={styles.sourceBadge}>
      <Ionicons name="checkmark-circle" size={14} color={colors.flagGreen} />
      <Text style={styles.sourceBadgeText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  header: { marginBottom: spacing.lg },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
    backgroundColor: colors.flagGreenBg,
    borderColor: colors.flagGreen + '33',
  },
  infoIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.flagGreenBg,
    alignItems: 'center', justifyContent: 'center',
  },
  infoText: { flex: 1, ...typography.caption, color: colors.text, fontWeight: '600' },
  form: { gap: spacing.sm },
  helpText: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  sources: { marginTop: spacing.xl },
  sourcesTitle: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm, fontWeight: '600' },
  sourcesList: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourceBadgeText: { ...typography.small, color: colors.text, fontWeight: '600' },
});
