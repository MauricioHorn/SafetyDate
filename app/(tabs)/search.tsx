import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';
import { supabase } from '@/lib/supabase';
import { hasActivePremium } from '@/lib/revenuecat';
import { colors, spacing, typography, radius } from '@/lib/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type NotFoundReason = 'name_not_found' | 'no_match_after_all_filters';

function notFoundReasonFromResponse(value: unknown): NotFoundReason {
  if (value === 'no_match_after_all_filters') return 'no_match_after_all_filters';
  return 'name_not_found';
}

export default function Search() {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [searchMode, setSearchMode] = useState<'name_phone' | 'cpf'>('name_phone');
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
    if (searchMode === 'name_phone') {
      if (name.trim().length < 3) {
        Alert.alert('Ops', 'Digite o nome completo');
        return;
      }
      const cleanedPhone = phone.replace(/\D/g, '');
      if (cleanedPhone.length < 10 || cleanedPhone.length > 11) {
        Alert.alert('Ops', 'Telefone inválido');
        return;
      }
      if (birthDate && birthDate.length < 10) {
        Alert.alert('Ops', 'Data de nascimento inválida');
        return;
      }
    } else {
      const cleanedCpf = cpf.replace(/\D/g, '');
      if (cleanedCpf.length !== 11) {
        Alert.alert('Ops', 'CPF inválido');
        return;
      }
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      // ⚠️ BYPASS TEMPORÁRIO — REMOVER NA FASE 7 (RevenueCat configurado)
      // Verifica premium direto no RevenueCat (fonte da verdade)
      // const isPremium = await hasActivePremium();
      //
      // if (!isPremium) {
      //   // Redireciona para paywall nativo (In-App Purchase)
      //   setLoading(false);
      //   router.push('/paywall');
      //   return;
      // }

      const body = searchMode === 'name_phone'
        ? {
            searchMode: 'name_phone' as const,
            name: name.trim(),
            phone: phone.replace(/\D/g, ''),
            birthDate: birthDate || undefined,
          }
        : {
            searchMode: 'cpf' as const,
            cpf: cpf.replace(/\D/g, ''),
          };

      const { data, error } = await supabase.functions.invoke('background-check', {
        body,
      });

      setLoading(false);

      if (error) {
        Alert.alert('Erro na pesquisa', error.message);
        return;
      }

      if (data?.not_found === true) {
        router.push({
          pathname: '/not-found',
          params: { reason: notFoundReasonFromResponse(data.reason), name: name.trim() },
        });
        return;
      }

      if (data?.id) {
        router.push(`/report/${data.id}`);
      }
    } catch (err) {
      setLoading(false);
      const message = err instanceof Error ? err.message : 'Algo deu errado';
      Alert.alert('Erro', message);
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

          <View style={styles.tabsContainer}>
            <Pressable
              style={[
                styles.tabButton,
                searchMode === 'name_phone' && styles.tabButtonActive,
              ]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSearchMode('name_phone');
              }}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  searchMode === 'name_phone' && styles.tabButtonTextActive,
                ]}
              >
                Nome e Telefone
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.tabButton,
                searchMode === 'cpf' && styles.tabButtonActive,
              ]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setSearchMode('cpf');
              }}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  searchMode === 'cpf' && styles.tabButtonTextActive,
                ]}
              >
                CPF
              </Text>
            </Pressable>
          </View>

          <View style={styles.form}>
            {searchMode === 'name_phone' ? (
              <>
                <Input
                  label="Nome completo *"
                  icon="person"
                  placeholder="Ex: João Silva Santos"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
                <Input
                  label="Telefone *"
                  icon="call"
                  placeholder="(11) 99999-9999"
                  value={phone}
                  onChangeText={(t) => setPhone(formatPhone(t))}
                  keyboardType="phone-pad"
                  maxLength={15}
                />
                <Input
                  label="Data de nascimento (opcional)"
                  icon="calendar"
                  placeholder="DD/MM/AAAA"
                  value={birthDate}
                  onChangeText={(t) => setBirthDate(formatBirthDate(t))}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </>
            ) : (
              <Input
                label="CPF *"
                icon="card"
                placeholder="000.000.000-00"
                value={cpf}
                onChangeText={(t) => setCpf(formatCpf(t))}
                keyboardType="numeric"
                maxLength={14}
              />
            )}

            <Text style={styles.helpText}>
              {searchMode === 'name_phone'
                ? 'Nome e telefone são suficientes para pesquisar. Adicione a data de nascimento se souber, pra evitar homônimos.'
                : 'Pesquisa direta com CPF. Mais precisa quando você já tem o documento da pessoa.'}
            </Text>

            <Button
              label="Pesquisar agora"
              onPress={() => void handleSearch()}
              loading={loading}
            />
          </View>

          <Text style={styles.disclaimerText}>
            Consulta dados públicos oficiais brasileiros.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  tabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    padding: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabButton: {
    flex: 1,
    borderRadius: radius.full,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.primary,
  },
  tabButtonText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: colors.textOnPrimary,
  },
  form: { gap: spacing.sm },
  helpText: {
    ...typography.small,
    color: colors.textMuted,
    lineHeight: 18,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  disclaimerText: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
});
