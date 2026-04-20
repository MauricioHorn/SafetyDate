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

export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<BackgroundCheck | null>(null);
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
    setReport(data);
    setLoading(false);
  }

  async function handleShare() {
    if (!report) return;
    await Share.share({
      message: `Relatório SafetyDate sobre ${report.target_name}\n\nStatus: ${flagLabel(report.flag)}\n\n${report.summary}`,
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

        {/* Info básica */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dados consultados</Text>
          <Card>
            <InfoRow icon="person" label="Nome" value={report.target_name} />
            {report.target_birth_date && (
              <InfoRow icon="calendar" label="Nascimento" value={report.target_birth_date} />
            )}
            {report.target_cpf && (
              <InfoRow icon="card" label="CPF" value={maskCpf(report.target_cpf)} />
            )}
            <InfoRow
              icon="time"
              label="Pesquisa realizada em"
              value={new Date(report.created_at).toLocaleString('pt-BR')}
              last
            />
          </Card>
        </View>

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

function InfoRow({ icon, label, value, last }: { icon: any; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon} size={16} color={colors.textMuted} style={{ width: 20 }} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  return `${clean.slice(0, 3)}.***.**${clean.slice(9)}`;
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
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  infoRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  infoLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  infoValue: { ...typography.caption, color: colors.text, fontWeight: '600' },
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
