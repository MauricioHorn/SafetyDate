import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { colors, spacing, typography, radius } from '@/lib/theme';

export default function Welcome() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.primary + '33', colors.background, colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logoCircle}>
            <Ionicons name="shield-checkmark" size={56} color={colors.primary} />
          </View>
          <Text style={styles.title}>ELAS</Text>
          <Text style={styles.subtitle}>ELAS protegem ELAS</Text>
        </View>

        <View style={styles.features}>
          <Feature
            icon="search"
            title="Antecedentes em segundos"
            description="Consulta em dados públicos do CNJ, Diário Oficial e mais"
          />
          <Feature
            icon="lock-closed"
            title="100% anônimo"
            description="A pessoa pesquisada nunca é notificada"
          />
          <Feature
            icon="sparkles"
            title="Relatório com IA"
            description="Informações claras, sem juridiquês"
          />
        </View>

        <View style={styles.actions}>
          <Button label="Criar conta grátis" onPress={() => router.push('/(auth)/signup')} />
          <Button
            label="Já tenho conta"
            variant="ghost"
            onPress={() => router.push('/(auth)/login')}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Feature({ icon, title, description }: { icon: any; title: string; description: string }) {
  return (
    <View style={styles.feature}>
      <View style={styles.featureIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'space-between',
  },
  hero: {
    alignItems: 'center',
    marginTop: spacing.xxl,
  },
  logoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  features: {
    gap: spacing.md,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 2,
  },
  featureDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.sm,
  },
});
