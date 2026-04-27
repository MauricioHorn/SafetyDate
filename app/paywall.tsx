import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { Button } from '@/components/Button';
import {
  fetchOffering,
  purchasePackage,
  restorePurchases,
  PRODUCT_ANNUAL,
  PRODUCT_SINGLE,
} from '@/lib/revenuecat';
import { colors, spacing, typography, radius } from '@/lib/theme';

export default function Paywall() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selectedPkg, setSelectedPkg] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    loadOfferings();
  }, []);

  async function loadOfferings() {
    const off = await fetchOffering();
    setOffering(off);

    // Pré-seleciona o plano anual
    if (off) {
      const annual = off.availablePackages.find(
        (p) => p.product.identifier === PRODUCT_ANNUAL
      );
      setSelectedPkg(annual ?? off.availablePackages[0]);
    }
    setLoading(false);
  }

  async function handlePurchase() {
    if (!selectedPkg) return;

    setPurchasing(true);
    const result = await purchasePackage(selectedPkg);
    setPurchasing(false);

    if (result.userCancelled) return;

    if (result.success && result.isPremium) {
      Alert.alert(
        'Pagamento aprovado! 🎉',
        'Você agora tem acesso premium. Aproveite as buscas ilimitadas!',
        [{ text: 'Começar a usar', onPress: () => router.replace('/(tabs)') }]
      );
    } else {
      Alert.alert('Erro no pagamento', result.error || 'Tente novamente mais tarde');
    }
  }

  async function handleRestore() {
    setRestoring(true);
    const isPremium = await restorePurchases();
    setRestoring(false);

    if (isPremium) {
      Alert.alert('Assinatura restaurada!', 'Seu acesso premium foi reativado.', [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } else {
      Alert.alert(
        'Nenhuma compra encontrada',
        'Não localizamos nenhuma compra anterior nesta conta.'
      );
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Carregando planos...</Text>
      </View>
    );
  }

  if (!offering || offering.availablePackages.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Ionicons name="warning" size={48} color={colors.flagYellow} />
        <Text style={styles.loadingText}>
          Planos indisponíveis no momento.{'\n'}Tente novamente mais tarde.
        </Text>
        <View style={{ marginTop: spacing.lg, width: '80%' }}>
          <Button label="Voltar" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const annualPkg = offering.availablePackages.find((p) => p.product.identifier === PRODUCT_ANNUAL);
  const singlePkg = offering.availablePackages.find((p) => p.product.identifier === PRODUCT_SINGLE);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={[colors.primary + '30', colors.background, colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={['top']} style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.closeButton}>
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="diamond" size={40} color={colors.primary} />
          </View>
          <Text style={styles.title}>Escolha seu plano</Text>
          <Text style={styles.subtitle}>
            Verifique antecedentes antes de cada encontro
          </Text>
        </View>

        <View style={styles.benefits}>
          <Benefit text="Consulta processos públicos no CNJ e publicações no Diário Oficial" />
          <Benefit text="Relatório detalhado com análise de IA" />
          <Benefit text="100% anônimo — ninguém é notificado" />
          <Benefit text="Histórico ilimitado de pesquisas" />
        </View>

        <View style={styles.plans}>
          {annualPkg && (
            <PlanCard
              selected={selectedPkg?.identifier === annualPkg.identifier}
              onSelect={() => setSelectedPkg(annualPkg)}
              pkg={annualPkg}
              isAnnual
              recommended
            />
          )}
          {singlePkg && (
            <PlanCard
              selected={selectedPkg?.identifier === singlePkg.identifier}
              onSelect={() => setSelectedPkg(singlePkg)}
              pkg={singlePkg}
            />
          )}
        </View>

        <View style={styles.footer}>
          <Button
            label={
              selectedPkg
                ? `Continuar com ${selectedPkg.product.priceString}`
                : 'Selecione um plano'
            }
            onPress={handlePurchase}
            loading={purchasing}
            disabled={!selectedPkg}
            size="lg"
          />

          <Pressable onPress={handleRestore} disabled={restoring} style={styles.restore}>
            {restoring ? (
              <ActivityIndicator size="small" color={colors.textSecondary} />
            ) : (
              <Text style={styles.restoreText}>Restaurar compras</Text>
            )}
          </Pressable>

          <Text style={styles.secure}>
            <Ionicons name="lock-closed" size={12} color={colors.textMuted} />{' '}
            Pagamento seguro via {getPlatformName()}
          </Text>

          <Text style={styles.terms}>
            Renovação automática. Cancele a qualquer momento nas configurações do seu dispositivo.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function getPlatformName() {
  // Simplificação — em produção você usa Platform.OS
  return 'App Store / Google Play';
}

function Benefit({ text }: { text: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}>
        <Ionicons name="checkmark" size={16} color={colors.flagGreen} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function PlanCard({
  selected,
  onSelect,
  pkg,
  isAnnual,
  recommended,
}: {
  selected: boolean;
  onSelect: () => void;
  pkg: PurchasesPackage;
  isAnnual?: boolean;
  recommended?: boolean;
}) {
  const { product } = pkg;
  const monthlyHint = isAnnual ? calculateMonthlyHint(product.price) : undefined;

  return (
    <Pressable onPress={onSelect} style={[styles.planCard, selected && styles.planCardSelected]}>
      {recommended && (
        <View style={styles.recommendedBadge}>
          <Text style={styles.recommendedText}>MAIS ECONÔMICO</Text>
        </View>
      )}
      <View style={styles.planRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.planName}>{product.title || (isAnnual ? 'Plano Anual' : 'Consulta avulsa')}</Text>
          <Text style={styles.planDescription}>
            {isAnnual ? 'Pesquisas ilimitadas por 12 meses' : 'Uma única pesquisa'}
          </Text>
        </View>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.priceValue}>
          {product.priceString}
          {isAnnual && <Text style={styles.priceSuffix}>/ano</Text>}
        </Text>
        {monthlyHint && <Text style={styles.priceHint}>menos de {monthlyHint}/mês</Text>}
      </View>
    </Pressable>
  );
}

function calculateMonthlyHint(annualPrice: number): string {
  const monthly = Math.floor(annualPrice / 12);
  return `R$ ${monthly}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  hero: { alignItems: 'center', marginBottom: spacing.xl },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 2, borderColor: colors.primary,
  },
  title: { ...typography.h1, color: colors.text, textAlign: 'center', marginBottom: spacing.xs },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  benefits: { gap: spacing.sm, marginBottom: spacing.xl },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benefitIcon: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.flagGreenBg,
    alignItems: 'center', justifyContent: 'center',
  },
  benefitText: { ...typography.caption, color: colors.text, flex: 1 },
  plans: { gap: spacing.sm, marginBottom: spacing.lg },
  planCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 2,
    borderColor: colors.border,
    position: 'relative',
  },
  planCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surfaceElevated,
  },
  recommendedBadge: {
    position: 'absolute',
    top: -10,
    right: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  recommendedText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  planName: { ...typography.bodyBold, color: colors.text },
  planDescription: { ...typography.small, color: colors.textSecondary, marginTop: 2 },
  radio: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: colors.primary,
  },
  priceRow: { marginTop: spacing.md, flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  priceValue: { ...typography.h2, color: colors.text },
  priceSuffix: { ...typography.caption, color: colors.textSecondary, fontWeight: '400' },
  priceHint: { ...typography.small, color: colors.primary, fontWeight: '600' },
  footer: { gap: spacing.sm, alignItems: 'center' },
  restore: { padding: spacing.sm },
  restoreText: { ...typography.caption, color: colors.textSecondary, textDecorationLine: 'underline' },
  secure: { ...typography.small, color: colors.textMuted, marginTop: spacing.sm },
  terms: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
});
