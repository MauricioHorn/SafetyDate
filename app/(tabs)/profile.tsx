import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { supabase, Profile } from '@/lib/supabase';
import { colors, spacing, typography, radius } from '@/lib/theme';

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    setProfile(data);
  }

  async function handleSignOut() {
    Alert.alert(
      'Sair',
      'Tem certeza que deseja sair?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sair',
          style: 'destructive',
          onPress: async () => { await supabase.auth.signOut(); },
        },
      ]
    );
  }

  const isAnnual = profile?.plan === 'annual';
  const initials = profile?.full_name
    ?.split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase() || '?';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{profile?.full_name || 'Usuária'}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
        </View>

        <Card style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={[styles.planBadge, isAnnual && styles.planBadgeAnnual]}>
              <Ionicons
                name={isAnnual ? 'diamond' : 'person'}
                size={14}
                color={isAnnual ? '#fff' : colors.textMuted}
              />
              <Text style={[styles.planBadgeText, isAnnual && { color: '#fff' }]}>
                {isAnnual ? 'PLANO ANUAL ATIVO' : 'CONTA GRATUITA'}
              </Text>
            </View>
          </View>

          {isAnnual ? (
            <>
              <Text style={styles.planStatTitle}>Buscas ilimitadas</Text>
              <Text style={styles.planStatSubtitle}>
                Renovação em{' '}
                {profile?.plan_expires_at
                  ? new Date(profile.plan_expires_at).toLocaleDateString('pt-BR')
                  : '-'}
              </Text>
              <Text style={[styles.planStatSubtitle, { marginTop: 4 }]}>
                {profile?.searches_count || 0} consultas realizadas
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.planStatTitle}>Desbloqueie buscas ilimitadas</Text>
              <Text style={styles.planStatSubtitle}>
                Por apenas R$ 97/ano — menos de R$ 9/mês
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <Button label="Assinar plano anual" onPress={() => router.push('/paywall')} />
              </View>
            </>
          )}
        </Card>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conta</Text>

          <MenuItem icon="person-outline" label="Editar perfil" onPress={() => {}} />
          <MenuItem icon="card-outline" label="Método de pagamento" onPress={() => {}} />
          <MenuItem icon="receipt-outline" label="Minhas faturas" onPress={() => {}} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Segurança</Text>
          <MenuItem icon="lock-closed-outline" label="Alterar senha" onPress={() => {}} />
          <MenuItem icon="shield-checkmark-outline" label="Privacidade" onPress={() => {}} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ajuda</Text>
          <MenuItem icon="help-circle-outline" label="Central de ajuda" onPress={() => {}} />
          <MenuItem icon="mail-outline" label="Falar com o suporte" onPress={() => {}} />
          <MenuItem icon="document-text-outline" label="Termos de uso" onPress={() => {}} />
          <MenuItem icon="shield-outline" label="Política de privacidade" onPress={() => {}} />
        </View>

        <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
          <Button label="Sair" variant="secondary" onPress={handleSignOut} />
        </View>

        <Text style={styles.version}>SafetyDate v1.0.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function MenuItem({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}>
      <View style={styles.menuItemIcon}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
      </View>
      <Text style={styles.menuItemLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: { alignItems: 'center', padding: spacing.xl },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.primary,
    marginBottom: spacing.md,
  },
  avatarText: { color: colors.primary, fontSize: 28, fontWeight: '800' },
  name: { ...typography.h2, color: colors.text, marginBottom: 4 },
  email: { ...typography.caption, color: colors.textSecondary },
  planCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg },
  planHeader: { marginBottom: spacing.sm },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: colors.border,
    borderRadius: radius.full,
    alignSelf: 'flex-start',
  },
  planBadgeAnnual: { backgroundColor: colors.primary },
  planBadgeText: { fontSize: 10, fontWeight: '800', color: colors.textMuted, letterSpacing: 0.5 },
  planStatTitle: { ...typography.h3, color: colors.text, marginBottom: 4 },
  planStatSubtitle: { ...typography.caption, color: colors.textSecondary },
  section: { marginBottom: spacing.lg, paddingHorizontal: spacing.lg },
  sectionTitle: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    marginBottom: spacing.xs,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center', justifyContent: 'center',
  },
  menuItemLabel: { flex: 1, ...typography.body, color: colors.text },
  version: {
    textAlign: 'center',
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
});
