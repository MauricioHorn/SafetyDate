import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import ShareableReportCard from '../../components/ShareableReportCard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Card } from '@/components/Card';
import { FlagBadge } from '@/components/FlagBadge';
import { supabase, BackgroundCheck } from '@/lib/supabase';
import { colors, spacing, typography, radius } from '@/lib/theme';

function titleCase(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (!word) return '';
      const lower = ['de', 'da', 'do', 'dos', 'das', 'e'];
      if (lower.includes(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function acentuarSigno(signo: string | null | undefined): string {
  if (!signo) return '';
  const mapa: Record<string, string> = {
    aries: 'Áries',
    touro: 'Touro',
    gemeos: 'Gêmeos',
    cancer: 'Câncer',
    leao: 'Leão',
    virgem: 'Virgem',
    libra: 'Libra',
    escorpiao: 'Escorpião',
    sagitario: 'Sagitário',
    capricornio: 'Capricórnio',
    aquario: 'Aquário',
    peixes: 'Peixes',
  };
  const chave = signo.trim().toLowerCase();
  return mapa[chave] || titleCase(signo);
}

function formatProcessDate(data: string | null | undefined): string | null {
  if (!data) return null;
  if (data.startsWith('0001') || data.trim() === '') return null;
  const d = new Date(data);
  if (isNaN(d.getTime()) || d.getFullYear() < 1900) return null;
  return d.toLocaleDateString('pt-BR');
}

function polaridadeStyle(p: string | undefined) {
  if (p === 'Ativo') return styles.polaridadeAutor;
  if (p === 'Passivo') return styles.polaridadeReu;
  return styles.polaridadeNeutra;
}

type FlagReason = { texto: string; nivel: 'critico' | 'atencao' | 'positivo' };

interface BdcAddress {
  cidade?: string;
  uf?: string;
}

interface BdcData {
  nomeCompleto?: string;
  cpf?: string;
  cpfMascarado?: string;
  idade?: number;
  dataNascimento?: string;
  nomeMae?: string;
  nomePai?: string | null;
  genero?: string;
  estadoCivil?: string | null;
  statusReceita?: string;
  temObito?: boolean;
  dataObito?: string | null;
  signo?: string;
  enderecos?: BdcAddress[];
  telefones?: Array<{ numero: string; tipo: string }>;
}

type MatchStatus = 'match' | 'mismatch' | 'not_provided' | 'not_available';

type ReportWithBdc = BackgroundCheck & {
  search_mode?: 'name_phone' | 'cpf';
  phone_match_status?: MatchStatus;
  name_match_status?: MatchStatus;
  cadastro_validado?: boolean;
  raw_data?: BackgroundCheck['raw_data'] & {
    bdc?: BdcData | null;
    bdc_meta?: Record<string, unknown>;
    name_crosscheck?: { status?: MatchStatus; [k: string]: unknown };
    flag_reasons?: FlagReason[];
  };
};

function ordenarProcessosPorRecencia(processes: any[]): any[] {
  return [...processes].sort((a, b) => {
    const catA = a?.categoria === 'criminal' ? 0 : 1;
    const catB = b?.categoria === 'criminal' ? 0 : 1;
    if (catA !== catB) return catA - catB;

    const dataA = a?.dataUltimaMovimentacao || '';
    const dataB = b?.dataUltimaMovimentacao || '';
    const aInvalida = !dataA || dataA.startsWith('0001');
    const bInvalida = !dataB || dataB.startsWith('0001');
    if (aInvalida && !bInvalida) return 1;
    if (!aInvalida && bInvalida) return -1;
    if (aInvalida && bInvalida) return 0;
    return dataB.localeCompare(dataA);
  });
}

export default function Report() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<ReportWithBdc | null>(null);
  const [loading, setLoading] = useState(true);
  const shareCardRef = useRef<View>(null);

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
    setReport(data as ReportWithBdc | null);
    setLoading(false);
  }

  async function handleShare() {
    if (!report) return;
    try {
      const uri = await captureRef(shareCardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        return;
      }

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Compartilhar relatório',
      });
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
    }
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

  const flagMessages = {
    green: 'Nenhum alerta encontrado',
    yellow: 'Atenção necessária',
    red: 'Alerta importante',
  };

  const heroPalette =
    report.flag === 'green'
      ? {
          bg: colors.flagGreenBg,
          border: colors.flagGreenBorder,
          accent: colors.flagGreen,
          iconBg: colors.flagGreen + '26',
          iconName: 'shield-checkmark' as const,
        }
      : report.flag === 'yellow'
      ? {
          bg: colors.flagYellowBg,
          border: colors.flagYellowBorder,
          accent: colors.flagYellow,
          iconBg: colors.flagYellow + '26',
          iconName: 'warning' as const,
        }
      : {
          bg: colors.flagRedBg,
          border: colors.flagRedBorder,
          accent: colors.flagRed,
          iconBg: colors.flagRed + '26',
          iconName: 'alert-circle' as const,
        };

  const bdcData = report.raw_data?.bdc;
  const flagReasons = report.raw_data?.flag_reasons;
  const shouldShowFlagReasons = Boolean(flagReasons && flagReasons.length > 0);
  const hasCadastroData = Boolean(
    bdcData && (
      bdcData.nomeCompleto ||
      bdcData.cpf ||
      bdcData.dataNascimento ||
      bdcData.idade
    )
  );
  const officialName = bdcData?.nomeCompleto || report.target_name;
  const primaryAddress = bdcData?.enderecos?.[0];
  const civilStatusPlaceholder = `Não há registro público disponível em ${new Date().toLocaleDateString('pt-BR')}`;

  const nameStatus =
    report.name_match_status ??
    (report.raw_data?.name_crosscheck as any)?.status;

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

  const verifications = [nameVerification].filter(Boolean) as Array<{
    icon: keyof typeof Ionicons.glyphMap;
    text: string;
    color: string;
    background: string;
  }>;

  const processes = report.raw_data?.processes ?? [];
  const processosOrdenados = processes.length > 0 ? ordenarProcessosPorRecencia(processes) : [];
  const processosVisiveis = processosOrdenados.slice(0, 10);
  const totalProcessos = processes.length;

  return (
    <View style={styles.container}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Relatório</Text>
          {report.created_at ? (
            <Text style={styles.headerSubtitle}>
              {`CONSULTADO EM ${formatConsultDateDdMmYyyy(report.created_at)}`}
            </Text>
          ) : null}
        </View>
        <Pressable onPress={handleShare} style={styles.headerButton}>
          <Ionicons name="share-outline" size={22} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero com flag */}
        <View
          style={[
            styles.heroRow,
            {
              backgroundColor: heroPalette.bg,
              borderColor: heroPalette.border,
            },
          ]}
        >
          <View style={[styles.heroIconCircle, { backgroundColor: heroPalette.iconBg }]}>
            <Ionicons name={heroPalette.iconName} size={22} color={heroPalette.accent} />
          </View>
          <View style={styles.heroTextCol}>
            <Text style={[styles.heroTitle, { color: heroPalette.accent }]}>{flagMessages[report.flag]}</Text>
            <Text style={styles.heroName}>{report.target_name}</Text>
          </View>
        </View>

        {/* Score — o que isso significa */}
        {shouldShowFlagReasons && (
          <View style={styles.scoreCard}>
            <Text style={styles.scoreEyebrow}>ANÁLISE</Text>
            <Text style={styles.scoreHeadline}>O que isso significa</Text>
            {flagReasons!.map((m: FlagReason, idx: number) => {
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
        )}

        {/* Verificações */}
        {verifications.length > 0 && (
          <View style={[styles.verificationsSection, shouldShowFlagReasons && { marginTop: 0 }]}>
            <Text style={styles.verificationsEyebrow}>VERIFICAÇÕES</Text>
            <View style={styles.verificationGrid}>
              {verifications.map((item, idx) => (
                <View key={idx} style={styles.verificationBadge}>
                  <Ionicons name={item.icon} size={16} color={item.color} />
                  <Text style={[styles.verificationText, { color: item.color }]}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Resumo de IA */}
        <View
          style={[
            styles.aiSection,
            !shouldShowFlagReasons && verifications.length === 0 ? { marginTop: spacing.xl } : null,
          ]}
        >
          <View style={styles.aiEyebrowRow}>
            <Text style={styles.aiEyebrow}>ANÁLISE DA IA</Text>
            <View style={styles.aiTag}>
              <Ionicons name="sparkles" size={12} color={colors.accent} />
              <Text style={styles.aiTagText}>IA</Text>
            </View>
          </View>
          <Text style={styles.aiQuote}>{report.summary}</Text>
        </View>

        {/* Números — só se houver processos */}
        {(report.processes_count > 0 || report.criminal_processes_count > 0) && (
          <View style={styles.numericSection}>
            <Text style={styles.numericEyebrow}>RESUMO</Text>
            <View style={styles.statsGrid}>
              <StatCard value={String(report.processes_count)} label="Processos totais" />
              <StatCard value={String(report.criminal_processes_count)} label="Processos criminais" />
            </View>
          </View>
        )}

        {/* Dados cadastrais */}
        <View style={styles.cadastroCard}>
          <View style={styles.cadastroHeaderRow}>
            <View style={styles.cadastroAvatar}>
              <Ionicons name="person" size={22} color={colors.primary} />
            </View>
            <Text style={styles.cadastroHeaderName}>{titleCase(officialName)}</Text>
          </View>

          {!hasCadastroData ? (
            <Text style={styles.cadastroUnavailable}>Dados cadastrais indisponíveis no momento</Text>
          ) : (
            <View style={styles.cadastroFieldsWrap}>
              <View style={styles.cadastroFieldHalf}>
                <Text style={styles.cadastroFieldLabel}>Data de Nascimento</Text>
                <Text style={styles.cadastroFieldValue}>{formatBirthDate(bdcData?.dataNascimento)}</Text>
              </View>
              <View style={styles.cadastroFieldHalf}>
                <Text style={styles.cadastroFieldLabel}>Idade</Text>
                <Text style={styles.cadastroFieldValue}>{bdcData?.idade?.toString() || '—'}</Text>
              </View>
              <View style={styles.cadastroFieldHalf}>
                <Text style={styles.cadastroFieldLabel}>Signo</Text>
                <Text style={styles.cadastroFieldValue}>{bdcData?.signo ? acentuarSigno(bdcData.signo) : '—'}</Text>
              </View>
              <View style={styles.cadastroFieldHalf}>
                <Text style={styles.cadastroFieldLabel}>CPF</Text>
                <Text style={styles.cadastroFieldValue}>{maskCpf(bdcData?.cpf || report.target_cpf || '—')}</Text>
              </View>
              <View style={styles.cadastroFieldHalf}>
                <Text style={styles.cadastroFieldLabel}>Nome da Mãe</Text>
                <Text style={styles.cadastroFieldValue}>{maskMotherName(bdcData?.nomeMae)}</Text>
              </View>
              {(primaryAddress?.cidade || primaryAddress?.uf) && (
                <View style={[styles.cadastroFieldHalf, styles.cadastroFieldFull]}>
                  <Text style={styles.cadastroFieldLabel}>Cidade/UF</Text>
                  <Text style={styles.cadastroFieldValue}>
                    {primaryAddress?.cidade && primaryAddress?.uf
                      ? `${primaryAddress.cidade} / ${primaryAddress.uf}`
                      : (primaryAddress?.cidade || primaryAddress?.uf)}
                  </Text>
                </View>
              )}
              <View style={[styles.cadastroFieldHalf, styles.cadastroFieldFull]}>
                <Text style={styles.cadastroFieldLabel}>Estado Civil</Text>
                <Text style={styles.cadastroPlaceholder}>{civilStatusPlaceholder}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Lista de processos (se houver) */}
        {totalProcessos > 0 && (
          <View style={styles.processesSection}>
            <Text style={styles.processesSectionTitle}>Processos encontrados</Text>
            {totalProcessos > 10 && (
              <Text style={styles.processCountHint}>
                Mostrando os 10 processos mais recentes de {totalProcessos} encontrados
              </Text>
            )}
            {processosVisiveis.map((proc: any, idx: number) => (
              <Card key={idx} style={{ marginBottom: spacing.sm }}>
                <View style={styles.processHeader}>
                  <FlagBadge
                    flag={
                      proc.classe?.nome?.toLowerCase().includes('criminal') ||
                      proc.classe?.nome?.toLowerCase().includes('penal')
                        ? 'red'
                        : 'yellow'
                    }
                    size="sm"
                    label={proc.segredoJustica ? 'Em segredo de justiça' : (proc.classe?.nome || 'Processo')}
                  />
                  {formatProcessDate(proc.dataAjuizamento) && (
                    <Text style={styles.processDate}>
                      {formatProcessDate(proc.dataAjuizamento)}
                    </Text>
                  )}
                </View>
                {proc.numeroProcesso && (
                  <Text style={styles.processNumber}>{proc.numeroProcesso}</Text>
                )}
                {proc.tribunal && (
                  <Text style={styles.processTribunal}>{proc.tribunal}</Text>
                )}
                <View style={styles.processInfoRow}>
                  <Text style={[styles.processPolaridade, polaridadeStyle(proc.polaridade)]}>
                    {proc.polaridade === 'Ativo'
                      ? 'Autor'
                      : proc.polaridade === 'Passivo'
                        ? 'Réu'
                        : 'Posição não informada'}
                  </Text>
                  {proc.categoria && (
                    <>
                      <Text style={[styles.processPolaridade, styles.processSeparator]}>•</Text>
                      <Text style={[styles.processPolaridade, styles.processCategoria]}>
                        {proc.categoria === 'criminal' ? 'Criminal' : 'Cível'}
                      </Text>
                    </>
                  )}
                </View>
                {proc.assuntos?.[0]?.nome && (
                  <Text style={styles.processSubject}>{proc.assuntos[0].nome}</Text>
                )}
              </Card>
            ))}
          </View>
        )}

        {/* Disclaimer */}
        <View style={styles.disclaimerContainer}>
          <Text style={styles.disclaimerText}>
            Este relatório é baseado em dados públicos disponíveis em tribunais e órgãos oficiais brasileiros. Ele não substitui uma avaliação profissional completa. Use as informações como um dos elementos em sua decisão.
          </Text>
        </View>
      </ScrollView>

      {/* Card invisível usado apenas para captura de imagem ao compartilhar */}
      <View style={styles.hiddenCard} pointerEvents="none">
        <ShareableReportCard
          ref={shareCardRef}
          targetName={report.target_name}
          flag={report.flag}
          flagLabel={flagLabel(report.flag)}
          flagReasons={(report.raw_data?.flag_reasons as Array<{ nivel: string; texto: string }>) || []}
          totalProcessos={report.raw_data?.processes?.length || 0}
          totalCriminais={report.criminal_processes_count || 0}
          consultaData={report.created_at ? formatConsultDateDdMmYyyy(report.created_at) : ''}
          cadastro={
            bdcData
              ? {
                  nome: titleCase(bdcData.nomeCompleto || report.target_name),
                  dataNascimento: (() => {
                    const formatted = formatBirthDate(bdcData.dataNascimento);
                    return formatted !== '—' ? formatted : undefined;
                  })(),
                  idade: bdcData.idade != null ? String(bdcData.idade) : undefined,
                  signo: bdcData.signo ? acentuarSigno(bdcData.signo) : undefined,
                  cpfMascarado: (() => {
                    if (bdcData.cpfMascarado) return bdcData.cpfMascarado;
                    const cpf = bdcData.cpf || report.target_cpf;
                    if (!cpf) return undefined;
                    const masked = maskCpf(cpf);
                    return masked !== '—' ? masked : undefined;
                  })(),
                  nomeMaeMascarado: (() => {
                    if (!bdcData.nomeMae) return undefined;
                    const masked = maskMotherName(bdcData.nomeMae);
                    return masked !== '—' ? masked : undefined;
                  })(),
                  cidadeUf:
                    primaryAddress?.cidade && primaryAddress?.uf
                      ? `${primaryAddress.cidade} / ${primaryAddress.uf}`
                      : undefined,
                  estadoCivil: bdcData.estadoCivil || civilStatusPlaceholder,
                }
              : null
          }
        />
      </View>
    </View>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function formatConsultDateDdMmYyyy(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function maskCpf(cpf: string) {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11) return cpf;
  return `${clean.slice(0, 3)}.XXX.XXX-${clean.slice(9)}`;
}

function maskMotherName(name?: string) {
  if (!name?.trim()) return '—';
  const normalized = titleCase(name);
  const parts = normalized.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0];

  const [firstName, ...rest] = parts;
  const maskedRest = rest.map((part) => {
    if (['de', 'da', 'do', 'dos', 'das', 'e'].includes(part.toLowerCase())) return part;
    const firstChar = part.charAt(0);
    const maskSize = Math.max(part.length - 1, 3);
    return `${firstChar}${'x'.repeat(maskSize)}`;
  });

  return `${firstName} ${maskedRest.join(' ')}`;
}

function formatBirthDate(input?: string) {
  if (!input?.trim()) return '—';
  let s = input.trim();
  if (s.includes('T')) {
    s = s.split('T')[0] ?? s;
  }
  if (s.includes(' ')) {
    s = s.split(' ')[0] ?? s;
  }
  const isoLike = /^(\d{4})-(\d{2})-(\d{2})$/;
  const match = s.match(isoLike);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const brLike = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  if (brLike.test(s)) {
    return s;
  }
  return s;
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
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerTitle: { ...typography.bodyBold, color: colors.text },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  scroll: { paddingBottom: spacing.xxl },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  heroIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTextCol: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: '700', lineHeight: 24 },
  heroName: { fontSize: 13, fontWeight: '500', color: colors.textSecondary, marginTop: 6 },
  scoreCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  scoreEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  scoreHeadline: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  reasonText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
    fontWeight: '600',
  },
  verificationsSection: {
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  verificationsEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginHorizontal: spacing.md,
  },
  verificationGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.lg,
  },
  verificationBadge: {
    flex: 1,
    minWidth: 140,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  verificationText: {
    fontSize: 12,
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  aiSection: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  aiEyebrowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  aiEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  aiTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.accent + '20',
    borderRadius: radius.full,
  },
  aiTagText: { ...typography.small, color: colors.accent, fontWeight: '700' },
  aiQuote: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    color: colors.text,
    paddingLeft: spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  numericSection: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  numericEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.textMuted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  statsGrid: { flexDirection: 'row', gap: spacing.md },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
  },
  statValue: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
  },
  cadastroCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  cadastroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  cadastroAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cadastroHeaderName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  cadastroUnavailable: {
    ...typography.small,
    color: colors.textSecondary,
  },
  cadastroFieldsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -spacing.sm,
  },
  cadastroFieldHalf: {
    width: '50%',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  cadastroFieldFull: {
    width: '100%',
  },
  cadastroFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  cadastroFieldValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  cadastroPlaceholder: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  processesSection: {
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xl,
  },
  processesSectionTitle: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  processCountHint: {
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  processHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  processDate: { ...typography.small, color: colors.textMuted },
  processNumber: { ...typography.small, color: colors.textSecondary, fontFamily: 'monospace', marginTop: 4 },
  processTribunal: { ...typography.caption, color: colors.text, fontWeight: '600', marginTop: 2 },
  processInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  processPolaridade: { fontSize: 12, fontWeight: '600' },
  processSeparator: { color: colors.textMuted },
  processCategoria: { color: colors.textMuted },
  polaridadeAutor: { color: colors.flagGreen },
  polaridadeReu: { color: colors.flagYellow },
  polaridadeNeutra: { color: colors.textMuted },
  processSubject: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  disclaimerContainer: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  disclaimerText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  hiddenCard: {
    position: 'absolute',
    top: -10000,
    left: 0,
    opacity: 0,
  },
});
