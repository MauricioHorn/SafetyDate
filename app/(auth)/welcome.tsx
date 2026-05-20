import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Button } from '@/components/Button';
import { colors, spacing, typography, radius } from '@/lib/theme';

const logo = require('../../assets/icon.png');

export default function Welcome() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <LinearGradient
        colors={[colors.primary + '33', colors.background, colors.background]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.logoContainer}>
            <Image source={logo} style={styles.logo} resizeMode="cover" />
          </View>
          <Text style={styles.title}>ELAS</Text>
          <Text style={styles.tagline}>
            Verifique, monitore e peça ajuda — tudo em um só app.
          </Text>
        </View>

        <View style={styles.features}>
          <Feature
            icon="search"
            title="Verifique antecedentes"
            description="Consulte processos públicos antes de confiar em alguém"
          />
          <Feature
            icon="alert-circle"
            title="SOS em 3 segundos"
            description="Acione um alerta de emergência na hora, com um toque"
          />
          <Feature
            icon="location"
            title="Localização protegida"
            description="Compartilhe seu trajeto em tempo real com quem você confia"
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
    marginTop: spacing.xl,
  },
  logoContainer: {
    width: 120,
    height: 120,
    borderRadius: 30,
    marginBottom: spacing.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    ...typography.h1,
    color: colors.text,
    fontSize: 40,
    marginBottom: spacing.sm,
  },
  tagline: {
    ...typography.bodyBold,
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 24,
    paddingHorizontal: spacing.md,
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
