import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ShareableReportCardProps {
  targetName: string;
  flag: 'green' | 'yellow' | 'red';
  flagLabel: string;
  flagReasons: Array<{ nivel: string; texto: string }>;
  totalProcessos: number;
  totalCriminais: number;
  consultaData: string;
  cadastro?: {
    nome?: string;
    dataNascimento?: string;
    idade?: string;
    signo?: string;
    cpfMascarado?: string;
    nomeMaeMascarado?: string;
    cidadeUf?: string;
    estadoCivil?: string;
  } | null;
}

type Flag = ShareableReportCardProps['flag'];

const FLAG_STYLES: Record<
  Flag,
  {
    bg: string;
    text: string;
    icon: keyof typeof Ionicons.glyphMap;
  }
> = {
  green: { bg: '#14532D', text: '#4ADE80', icon: 'shield-checkmark' },
  yellow: { bg: '#422006', text: '#FBBF24', icon: 'warning' },
  red: { bg: '#450A0A', text: '#F87171', icon: 'alert-circle' },
};

const NIVEL_COLORS: Record<string, string> = {
  positivo: '#4ADE80',
  atencao: '#FBBF24',
  critico: '#F87171',
};

function getNivelColor(nivel: string): string {
  return NIVEL_COLORS[nivel] ?? '#9CA3AF';
}

function CadastroField({
  label,
  value,
  fullWidth,
}: {
  label: string;
  value?: string;
  fullWidth?: boolean;
}) {
  if (!value?.trim()) return null;
  return (
    <View style={[styles.cadastroField, fullWidth && styles.cadastroFieldFull]}>
      <Text style={styles.cadastroLabel}>{label}</Text>
      <Text style={styles.cadastroValue}>{value}</Text>
    </View>
  );
}

const ShareableReportCard = forwardRef<View, ShareableReportCardProps>(
  (
    {
      targetName,
      flag,
      flagLabel,
      flagReasons,
      totalProcessos,
      totalCriminais,
      consultaData,
      cadastro,
    },
    ref,
  ) => {
    const flagStyle = FLAG_STYLES[flag];
    const reasons =
      flagReasons.length > 0
        ? flagReasons
        : [{ nivel: 'positivo', texto: 'Nenhum processo judicial encontrado' }];

    return (
      <View ref={ref} style={styles.card} collapsable={false}>
        <Text style={styles.logo}>ELAS</Text>

        <View style={[styles.flagCard, { backgroundColor: flagStyle.bg }]}>
          <Ionicons name={flagStyle.icon} size={72} color={flagStyle.text} />
          <Text style={[styles.flagLabel, { color: flagStyle.text }]}>{flagLabel}</Text>
          <Text style={[styles.targetName, { color: flagStyle.text }]}>{targetName}</Text>
        </View>

        <View style={styles.meaningSection}>
          <Text style={styles.sectionTitle}>O que isso significa</Text>
          {reasons.map((reason, idx) => (
            <View key={idx} style={styles.reasonRow}>
              <View
                style={[styles.bullet, { backgroundColor: getNivelColor(reason.nivel) }]}
              />
              <Text style={styles.reasonText}>{reason.texto}</Text>
            </View>
          ))}
        </View>

        {totalProcessos > 0 && (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalProcessos}</Text>
              <Text style={styles.statLabel}>Processos totais</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{totalCriminais}</Text>
              <Text style={styles.statLabel}>Processos criminais</Text>
            </View>
          </View>
        )}

        {cadastro != null && (
          <View style={styles.cadastroSection}>
            <Text style={styles.sectionTitle}>Dados cadastrais</Text>
            {cadastro.nome ? (
              <Text style={styles.cadastroNome}>{cadastro.nome}</Text>
            ) : null}
            <View style={styles.cadastroGrid}>
              <CadastroField label="Data de nascimento" value={cadastro.dataNascimento} />
              <CadastroField label="Idade" value={cadastro.idade} />
              <CadastroField label="Signo" value={cadastro.signo} />
              <CadastroField label="CPF" value={cadastro.cpfMascarado} />
              <CadastroField label="Nome da mãe" value={cadastro.nomeMaeMascarado} fullWidth />
              {cadastro.cidadeUf ? (
                <CadastroField label="Cidade/UF" value={cadastro.cidadeUf} />
              ) : null}
              <CadastroField label="Estado civil" value={cadastro.estadoCivil} />
            </View>
          </View>
        )}

        <Text style={styles.consultaData}>Pesquisa feita em {consultaData}</Text>

        <View style={styles.footerSpacer} />

        <View style={styles.footer}>
          <View style={styles.footerDivider} />
          <Text style={styles.footerTitle}>Baixe o ELAS</Text>
          <Text style={styles.footerLink}>elasapp.com.br</Text>
        </View>
      </View>
    );
  },
);

ShareableReportCard.displayName = 'ShareableReportCard';

const styles = StyleSheet.create({
  card: {
    width: 1080,
    minHeight: 1920,
    backgroundColor: '#0F1115',
    paddingHorizontal: 80,
    paddingVertical: 100,
    flexDirection: 'column',
  },
  logo: {
    fontSize: 96,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 12,
    textAlign: 'center',
    marginBottom: 24,
  },
  flagCard: {
    borderRadius: 40,
    paddingVertical: 64,
    paddingHorizontal: 48,
    alignItems: 'center',
    gap: 20,
    marginBottom: 48,
  },
  flagLabel: {
    fontSize: 52,
    fontWeight: '800',
    textAlign: 'center',
    marginTop: 8,
  },
  targetName: {
    fontSize: 40,
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.9,
  },
  meaningSection: {
    marginBottom: 48,
  },
  sectionTitle: {
    fontSize: 32,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 32,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 28,
    gap: 20,
  },
  bullet: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginTop: 14,
  },
  reasonText: {
    flex: 1,
    fontSize: 36,
    color: '#FFFFFF',
    lineHeight: 48,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 32,
    marginBottom: 48,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1A1D24',
    borderRadius: 32,
    paddingVertical: 48,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 80,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 28,
    fontWeight: '500',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  cadastroSection: {
    marginBottom: 48,
  },
  cadastroNome: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 32,
  },
  cadastroGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cadastroField: {
    width: '50%',
    paddingRight: 24,
    marginBottom: 36,
  },
  cadastroFieldFull: {
    width: '100%',
    paddingRight: 0,
  },
  cadastroLabel: {
    fontSize: 24,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cadastroValue: {
    fontSize: 36,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 44,
  },
  consultaData: {
    fontSize: 28,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 48,
  },
  footerSpacer: {
    flexGrow: 1,
    flexShrink: 0,
    minHeight: 0,
  },
  footer: {
    alignItems: 'center',
    paddingTop: 24,
  },
  footerDivider: {
    width: '100%',
    height: 2,
    backgroundColor: '#2A2D35',
    marginBottom: 40,
  },
  footerTitle: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  footerLink: {
    fontSize: 36,
    fontWeight: '600',
    color: '#F472B6',
  },
});

export default ShareableReportCard;
