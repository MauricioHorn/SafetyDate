import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { FlagBadge } from '@/components/FlagBadge';
import { supabase, BackgroundCheck } from '@/lib/supabase';
import { colors, spacing, typography, radius } from '@/lib/theme';

type FlagReason = { texto: string; nivel: 'critico' | 'atencao' | 'positivo' };

interface DirectdAddress {
  cidade?: string;
  uf?: string;
}

interface DirectdData {
  nomeCompleto?: string;
  dataNascimento?: string;
  idade?: number;
  nomeMae?: string;
  signo?: string;
  cpf?: string;
  enderecos?: DirectdAddress[];
}

type MatchStatus = 'match' | 'mismatch' | 'not_provided' | 'not_available';

type ReportWithDirectd = BackgroundCheck & {
  search_mode?: 'name_phone' | 'cpf';
  phone_match_status?: MatchStatus;
  name_match_status?: MatchStatus;
  cadastro_validado?: boolean;
  raw_data?: BackgroundCheck['raw_data'] & {
    directd?: DirectdData | null;
    directd_meta?: Record<string, unknown>;
    phone_crosscheck?: { status?: MatchStatus; [k: string]: unknown };
    name_crosscheck?: { status?: MatchStatus; [k: string]: unknown };
    flag_reasons?: FlagReason[];
  };
};

export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<ReportWithDirectd | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReport();
  }, [id]);

  async function loadReport() {
    if (!id) return;
    const { data } = await supabase
      .from('background_checks')
      .select('*')
      .eq('id', id)
      .single();
    setReport(data as ReportWithDirectd | null);
    setLoading(false);
  }

  async function handleShare() {
    if (!report) return;
    await Share.share({
      message: `Relatório ELAS sobre ${report.target_name}\n\nStatus: ${flagLabel(report.flag)}\n\n${report.summary}`,
    });
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando relatório...</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Relatório não encontrado</Text>
      </SafeAreaView>
    );
  }

  const flagColors = {
    green: [colors.flagGreen, colors.flagGreen + '80'],
    yellow: [colors.flagYellow, colors.flagYellow + '80'],
    red: [colors.flagRed, colors.flagRed + '80'],
  };

  const flagMessages = {
    green: 'Nenhum alerta encontrado',
    yellow: 'Alguns pontos de atenção',
    red: 'Alertas importantes encontrados',
  };

  const directdData = report.raw_data?.directd;
  const flagReasons = report.raw_data?.flag_reasons;
  const shouldShowFlagReasons = Boolean(flagReasons && flagReasons.length > 0);
  const hasCadastroData = Boolean(
    directdData && (
      directdData.nomeCompleto ||
      directdData.cpf ||
      directdData.dataNascimento ||
      directdData.idade
    )
  );
  const officialName = directdData?.nomeCompleto || report.target_name;
  const primaryAddress = directdData?.enderecos?.[0];
  const cityUf = [primaryAddress?.cidade, primaryAddress?.uf].filter(Boolean).join(' / ') || '—';
  const civilStatusPlaceholder = `Não há registro público disponível em ${new Date().toLocaleDateString('pt-BR')}`;

  const phoneStatus =
    report.phone_match_status ??
    (report.raw_data?.phone_crosscheck as any)?.status;
  const nameStatus =
    report.name_match_status ??
    (report.raw_data?.name_crosscheck as any)?.status;

  const phoneVerification =
    phoneStatus === 'match'
      ? {
          icon: 'checkmark-circle' as const,
          text: 'Telefone confere com o cadastro',
          color: colors.flagGreen,
          background: colors.flagGreen + '18',
        }
      : phoneStatus === 'mismatch'
      ? {
          icon: 'warning' as const,
          text: 'Telefone não corresponde aos registros oficiais associados a essa pessoa',
          color: colors.flagYellow,
          background: colors.flagYellow + '18',
        }
      : null;

  const nameVerification =
    nameStatus === 'match'
      ? {
          icon: 'checkmark-circle' as const,
          text: 'Nome confere com o cadastro',
          color: colors.flagGreen,
          background: colors.flagGreen + '18',
        }
      : nameStatus === 'mismatch'
      ? {
          icon: 'warning' as const,
          text: 'O nome informado não corresponde ao registro oficial deste telefone. Verifique a identidade antes de confiar.',
          color: colors.flagYellow,
          background: colors.flagYellow + '18',
        }
      : null;

  const verifications = [phoneVerification, nameVerification].filter(Boolean) as Array<{
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
    color: string;
    background: string;
  }>;

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Relatório</Text>
        <Pressable onPress={handleShare} style={styles.headerButton}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero com flag */}
        <LinearGradient
          colors={flagColors[report.flag] as any}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroIcon}>
            <Ionicons
              name={
                report.flag === 'green'
                  ? 'shield-checkmark'
                  : report.flag === 'yellow'
                  ? 'warning'
                  : 'alert-circle'
              }
              size={40}
              color="#fff"
            />
          </View>
          <Text style={styles.heroTitle}>{flagMessages[report.flag]}</Text>
          <Text style={styles.heroName}>{report.target_name}</Text>
        </LinearGradient>

        {/* Por que essa bandeira */}
        {shouldShowFlagReasons && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Por que essa bandeira</Text>
            <View style={styles.reasonsContainer}>
              {flagReasons!.map((m, idx) => {
                const icon: keyof typeof Ionicons.glyphMap =
                  m.nivel === 'critico'
                    ? 'warning'
                    : m.nivel === 'atencao'
                    ? 'alert-circle'
                    : 'checkmark-circle';
                const color =
                  m.nivel === 'critico'
                    ? colors.flagRed
                    : m.nivel === 'atencao'
                    ? colors.flagYellow
                    : colors.flagGreen;
                return (
                  <View key={idx} style={styles.reasonRow}>
                    <Ionicons name={icon} size={18} color={color} />
                    <Text style={styles.reasonText}>{m.texto}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Dados cadastrais */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados Cadastrais</Text>
          <Card>
            <Text style={styles.cadastroName}>{officialName}</Text>

            {!hasCadastroData ? (
              <Text style={styles.cadastroUnavailable}>Dados cadastrais indisponíveis no momento</Text>
            ) : (
              <View style={styles.cadastroGrid}>
                <View style={styles.cadastroRow}>
                  <CadastroItem label="Data de Nascimento" value={formatBirthDate(directdData?.dataNascimento)} />
                  <CadastroItem label="Idade" value={directdData?.idade?.toString() || '—'} />
                </View>

                <View style={styles.cadastroRow}>
                  <CadastroItem label="Signo" value={directdData?.signo || '—'} />
                  <View style={styles.cadastroCol} />
                </View>

                <View style={styles.cadastroRow}>
                  <CadastroItem label="CPF" value={maskCpf(directdData?.cpf || report.target_cpf || '—')} />
                  <CadastroItem label="Nome da Mãe" value={maskMotherName(directdData?.nomeMae)} />
                </View>

                <View style={styles.cadastroFullRow}>
                  <Text style={styles.cadastroLabel}>Cidade/UF</Text>
                  <Text style={styles.cadastroValue}>{cityUf}</Text>
                </View>

                <View style={styles.cadastroFullRow}>
                  <Text style={styles.cadastroLabel}>Estado Civil</Text>
                  <Text style={styles.cadastroPlaceholder}>{civilStatusPlaceholder}</Text>
                </View>
              </View>
            )}
          </Card>
        </View>

        {/* Verificações */}
        {verifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Verificações</Text>
            <View style={styles.verificationList}>
              {verifications.map((item, idx) => (
                <View key={idx} style={[styles.verificationBadge, { backgroundColor: item.background, borderColor: item.color + '40' }]}>
                  <Ionicons name={item.icon} size={16} color={item.color} />
                  <Text style={[styles.verificationText, { color: item.color }]}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Resumo de IA */}
        <View style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <Text style={styles.sectionTitle}>Análise</Text>
            <View style={styles.aiTag}>
              <Ionicons name="sparkles" size={12} color={colors.accent} />
              <Text style={styles.aiTagText}>IA</Text>
            </View>
          </View>
          <Card>
            <Text style={styles.summary}>{report.summary}</Text>
          </Card>
        </View>

        {/* Números */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Resumo numérico</Text>
          <View style={styles.statsGrid}>
            <StatCard
              value={String(report.processes_count)}
              label="Processos totais"
              icon="document-text"
              color={colors.accent}
            />
            <StatCard
              value={String(report.criminal_processes_count)}
              label="Processos criminais"
              icon="warning"
              color={report.criminal_processes_count > 0 ? colors.flagRed : colors.flagGreen}
            />
          </View>
        </View>

        {/* Lista de processos (se houver) */}
        {report.raw_data?.processes?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Processos encontrados</Text>
            {report.raw_data.processes.slice(0, 10).map((proc: any, idx: number) => (
              <Card key={idx} style={{ marginBottom: spacing.sm }}>
                <View style={styles.processHeader}>
                  <FlagBadge
                    flag={
                      proc.classe?.toLowerCase().includes('criminal') ||
                      proc.classe?.toLowerCase().includes('penal')
                        ? 'red'
                        : 'yellow'
                    }
                    size="sm"
                    label={proc.classe || 'Processo'}
                  />
                  {proc.dataAjuizamento && (
                    <Text style={styles.processDate}>
                      {new Date(proc.dataAjuizamento).toLocaleDateString('pt-BR')}
                    </Text>
                  )}
                </View>
                {proc.numeroProcesso && (
                  <Text style={styles.processNumber}>{proc.numeroProcesso}</Text>
                )}
                {proc.tribunal && (
                  <Text style={styles.processTribunal}>{proc.tribunal}</Text>
                )}
                {proc.assuntos?.[0]?.nome && (
                  <Text style={styles.processSubject}>{proc.assuntos[0].nome}</Text>
                )}
              </Card>
            ))}
          </View>
        )}

        {/* Disclaimer */}
        <Card style={styles.disclaimer}>
          <Ionicons name="information-circle" size={20} color={colors.textSecondary} />
          <Text style={styles.disclaimerText}>
            Este relatório é baseado em dados públicos disponíveis em diários oficiais e tribunais brasileiros. Ele não substitui uma avaliação profissional completa. Use as informações como um dos elementos em sua decisão.
          </Text>
        </Card>
      </ScrollView>
    </View>
  );
}

function CadastroItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cadastroCol}>
      <Text style={styles.cadastroLabel}>{label}</Text>
      <Text style={styles.cadastroValue}>{value}</Text>
    </View>
  );
}

function StatCard({ value, label, icon, color }: { value: string; label: string; icon: any; color: string }) {
  return (
    <View style={[styles.statCard, { borderColor: color + '30' }]}>
      <View style={[styles.statIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function maskCpf(cpf: string) {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.XXX.XXX-${clean.slice(9)}`;
}

function maskMotherName(name?: string) {
  if (!name?.trim()) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0];

  const [firstName, ...rest] = parts;
  const maskedRest = rest.map((part) => {
    const firstChar = part.charAt(0);
    const maskSize = Math.max(part.length - 1, 3);
    return `${firstChar}${'x'.repeat(maskSize)}`;
  });

  return `${firstName} ${maskedRest.join(' ')}`;
}

function formatBirthDate(input?: string) {
  if (!input?.trim()) return '—';
  const isoLike = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = input.trim().match(isoLike);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  return input;
}

function flagLabel(flag: 'green' | 'yellow' | 'red') {
  return { green: 'Sem alertas', yellow: 'Atenção', red: 'Alto risco' }[flag];
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: 'center', alignItems: 'center', gap: spacing.md,
  },
  loadingText: { ...typography.caption, color: colors.textSecondary },
  errorText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: 100 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerButton: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  headerTitle: { ...typography.bodyBold, color: colors.text },
  scroll: { paddingBottom: spacing.xxl },
  hero: {
    alignItems: 'center',
    padding: spacing.xl,
    margin: spacing.md,
    borderRadius: radius.xl,
  },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  heroName: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', marginTop: 4 },
  section: { paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  reasonsContainer: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  reasonText: {
    ...typography.small,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
    fontWeight: '600',
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  aiTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: colors.accent + '20',
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  aiTagText: { ...typography.small, color: colors.accent, fontWeight: '700' },
  cadastroName: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  },
  cadastroUnavailable: {
    ...typography.small,
    color: colors.textSecondary,
  },
  cadastroGrid: {
    gap: spacing.md,
  },
  cadastroRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cadastroCol: {
    flex: 1,
  },
  cadastroFullRow: {
    gap: 2,
  },
  cadastroLabel: {
    ...typography.small,
    color: colors.textMuted,
  },
  cadastroValue: {
    ...typography.body,
    color: colors.text,
    fontWeight: '600',
  },
  cadastroPlaceholder: {
    ...typography.small,
    color: colors.textSecondary,
  },
  verificationList: {
    gap: spacing.sm,
  },
  verificationBadge: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  verificationText: {
    ...typography.small,
    flex: 1,
    lineHeight: 18,
    fontWeight: '600',
  },
  summary: { ...typography.body, color: colors.text, lineHeight: 24 },
  statsGrid: { flexDirection: 'row', gap: spacing.sm },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  statIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statValue: { ...typography.h2, color: colors.text },
  statLabel: { ...typography.small, color: colors.textSecondary, textAlign: 'center', marginTop: 2 },
  processHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  processDate: { ...typography.small, color: colors.textMuted },
  processNumber: { ...typography.small, color: colors.textSecondary, fontFamily: 'monospace', marginTop: 4 },
  processTribunal: { ...typography.caption, color: colors.text, fontWeight: '600', marginTop: 2 },
  processSubject: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  disclaimer: {
    flexDirection: 'row',
    gap: spacing.sm,
    margin: spacing.md,
    backgroundColor: colors.surface,
    alignItems: 'flex-start',
  },
  disclaimerText: {
    flex: 1,
    ...typography.small,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
