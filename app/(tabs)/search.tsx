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
  Modal,
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

type NeedsMoreInfo = 'age' | 'exact_date';
type IntermediateReason = 'multiple_matches' | 'no_intersection' | 'no_results_after_filter';
type NotFoundReason = 'name_not_found' | 'no_match_after_all_filters';

function parseIntermediateReason(value: unknown): IntermediateReason | null {
  if (
    value === 'multiple_matches' ||
    value === 'no_intersection' ||
    value === 'no_results_after_filter'
  ) {
    return value;
  }
  return null;
}

function notFoundReasonFromResponse(value: unknown): NotFoundReason {
  if (value === 'no_match_after_all_filters') return 'no_match_after_all_filters';
  return 'name_not_found';
}

interface BottomSheetState {
  visible: boolean;
  type: NeedsMoreInfo | null;
  candidateCount: number;
  reason: IntermediateReason | null;
}

interface AdditionalFilters {
  idadeAproximada?: number;
  dataNascimento?: string; // "YYYY-MM-DD"
}

export default function Search() {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [cpf, setCpf] = useState('');
  const [searchMode, setSearchMode] = useState<'name_phone' | 'cpf'>('name_phone');
  const [loading, setLoading] = useState(false);
  const [bottomSheet, setBottomSheet] = useState<BottomSheetState>({
    visible: false,
    type: null,
    candidateCount: 0,
    reason: null,
  });
  const [ageInput, setAgeInput] = useState('');
  const [exactDateInput, setExactDateInput] = useState('');
  const [accumulatedFilters, setAccumulatedFilters] = useState<AdditionalFilters>({});

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

  function openBottomSheet(
    type: NeedsMoreInfo,
    candidateCount: number,
    reason: IntermediateReason | null,
  ) {
    setAgeInput('');
    setExactDateInput('');
    setBottomSheet({ visible: true, type, candidateCount, reason });
  }

  function closeBottomSheet() {
    setBottomSheet({ visible: false, type: null, candidateCount: 0, reason: null });
  }

  async function handleSearch(extraFilters?: AdditionalFilters) {
    const isFollowUp = extraFilters !== undefined;

    if (!isFollowUp) {
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
      setAccumulatedFilters({});
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

      const filtersToSend = isFollowUp ? extraFilters : undefined;

      const body = searchMode === 'name_phone'
        ? {
            searchMode: 'name_phone' as const,
            name: name.trim(),
            phone: phone.replace(/\D/g, ''),
            birthDate: birthDate || undefined,
            ...(filtersToSend ? { additionalFilters: filtersToSend } : {}),
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

      if (data?.needs_more_info === 'age' || data?.needs_more_info === 'exact_date') {
        openBottomSheet(
          data.needs_more_info,
          data.candidate_count ?? 0,
          parseIntermediateReason(data.reason),
        );
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

  function submitAge() {
    const ageNum = parseInt(ageInput, 10);
    if (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum >= 150) {
      Alert.alert('Ops', 'Idade inválida. Digite um número entre 1 e 149.');
      return;
    }
    const newFilters: AdditionalFilters = {
      ...accumulatedFilters,
      idadeAproximada: ageNum,
    };
    setAccumulatedFilters(newFilters);
    closeBottomSheet();
    void handleSearch(newFilters);
  }

  function submitExactDate() {
    const cleaned = exactDateInput.replace(/\D/g, '');
    if (cleaned.length !== 8) {
      Alert.alert('Ops', 'Data inválida. Use o formato DD/MM/AAAA.');
      return;
    }
    const dd = cleaned.slice(0, 2);
    const mm = cleaned.slice(2, 4);
    const yyyy = cleaned.slice(4, 8);
    const isoDate = `${yyyy}-${mm}-${dd}`;
    const yearNum = parseInt(yyyy, 10);
    const currentYear = new Date().getFullYear();
    if (yearNum < 1900 || yearNum > currentYear) {
      Alert.alert('Ops', 'Ano de nascimento inválido.');
      return;
    }
    const newFilters: AdditionalFilters = {
      ...accumulatedFilters,
      dataNascimento: isoDate,
    };
    setAccumulatedFilters(newFilters);
    closeBottomSheet();
    void handleSearch(newFilters);
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

      <Modal
        visible={bottomSheet.visible}
        transparent
        animationType="slide"
        onRequestClose={closeBottomSheet}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={closeBottomSheet} />
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHandle} />

              {bottomSheet.type === 'age' && (
                <>
                  <View style={styles.modalIconWrap}>
                    <Ionicons name="calendar-outline" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.modalTitle}>
                    Mais ou menos quantos anos {(name.trim().split(' ')[0]) || 'essa pessoa'} tem?
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {bottomSheet.candidateCount > 0
                      ? `Encontramos ${bottomSheet.candidateCount} pessoas com esse nome. ${bottomSheet.reason === 'no_intersection' ? 'O telefone não ajudou a identificar.' : ''} A idade aproximada vai ajudar a achar a certa.`
                      : `Encontramos várias pessoas com esse nome. A idade aproximada ajuda a identificar a certa.`}
                  </Text>
                  <Input
                    label=""
                    icon="person"
                    placeholder="Ex: 35"
                    value={ageInput}
                    onChangeText={(t) => setAgeInput(t.replace(/\D/g, '').slice(0, 3))}
                    keyboardType="numeric"
                    maxLength={3}
                    autoFocus
                  />
                  <Text style={styles.modalHelpText}>
                    Não precisa ser exato. Vamos buscar 3 anos pra mais ou pra menos.
                  </Text>
                  <Button label="Continuar pesquisa" onPress={submitAge} loading={loading} />
                  <Pressable onPress={closeBottomSheet} style={styles.modalCancel}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </Pressable>
                </>
              )}

              {bottomSheet.type === 'exact_date' && (
                <>
                  <View style={styles.modalIconWrap}>
                    <Ionicons name="calendar" size={32} color={colors.primary} />
                  </View>
                  <Text style={styles.modalTitle}>
                    Você sabe a data exata de nascimento?
                  </Text>
                  <Text style={styles.modalSubtitle}>
                    {bottomSheet.reason === 'no_results_after_filter'
                      ? 'Não encontramos com a idade aproximada. Talvez a idade seja diferente — a data exata resolve.'
                      : `Ainda temos ${bottomSheet.candidateCount} possíveis. A data exata vai dar match certeiro.`}
                  </Text>
                  <Input
                    label=""
                    icon="calendar"
                    placeholder="DD/MM/AAAA"
                    value={exactDateInput}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/\D/g, '').slice(0, 8);
                      if (cleaned.length <= 2) setExactDateInput(cleaned);
                      else if (cleaned.length <= 4)
                        setExactDateInput(`${cleaned.slice(0, 2)}/${cleaned.slice(2)}`);
                      else
                        setExactDateInput(
                          `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4)}`,
                        );
                    }}
                    keyboardType="numeric"
                    maxLength={10}
                    autoFocus
                  />
                  <Text style={styles.modalHelpText}>
                    Se não souber, melhor cancelar e tentar com outros dados.
                  </Text>
                  <Button label="Continuar pesquisa" onPress={submitExactDate} loading={loading} />
                  <Pressable onPress={closeBottomSheet} style={styles.modalCancel}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </Pressable>
                </>
              )}
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.xl ?? 24,
    borderTopRightRadius: radius.xl ?? 24,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  modalScrollContent: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.sm,
  },
  modalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySubtle ?? colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  modalTitle: {
    ...typography.h2,
    color: colors.text,
    textAlign: 'center',
  },
  modalSubtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalHelpText: {
    ...typography.small,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  modalCancel: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  modalCancelText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
