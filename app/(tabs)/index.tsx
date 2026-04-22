import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { Card } from '@/components/Card';
import { FlagBadge } from '@/components/FlagBadge';
import { supabase, Profile, BackgroundCheck } from '@/lib/supabase';
import { colors, spacing, typography, radius } from '@/lib/theme';
import { SosButton } from '../../components/SosButton';
import { SafetyModeActiveCard } from '../../components/SafetyModeActiveCard';
import { getActiveSession, SafetySession } from '../../lib/safety';

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recentChecks, setRecentChecks] = useState<BackgroundCheck[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSession, setActiveSession] = useState<SafetySession | null>(null);

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    const { data: checksData } = await supabase
      .from('background_checks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(3);

    setProfile(profileData);
    setRecentChecks(checksData || []);
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const session = await getActiveSession();
          setActiveSession(session);
        } catch (error) {
          console.error('Error loading session:', error);
        }
      })();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'você';
  const isAnnual = profile?.plan === 'annual';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {activeSession && (
          <SafetyModeActiveCard
            session={activeSession}
            onEnded={() => setActiveSession(null)}
          />
        )}

        {/* Header com saudação */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá,</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/profile')} style={styles.avatar}>
            <Ionicons name="person" size={24} color={colors.primary} />
          </Pressable>
        </View>

        {/* Card de plano */}
        <LinearGradient
          colors={isAnnual ? [colors.primary, colors.primaryDark] : [colors.surfaceElevated, colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.planCard}
        >
          <View style={styles.planHeader}>
            <View style={styles.planBadge}>
              <Ionicons name={isAnnual ? 'diamond' : 'person'} size={16} color={isAnnual ? '#fff' : colors.primary} />
              <Text style={[styles.planBadgeText, { color: isAnnual ? '#fff' : colors.primary }]}>
                {isAnnual ? 'PLANO ANUAL' : 'CONTA GRATUITA'}
              </Text>
            </View>
          </View>
          <Text style={[styles.planTitle, { color: isAnnual ? '#fff' : colors.text }]}>
            {isAnnual ? 'Buscas ilimitadas' : 'Desbloqueie buscas ilimitadas'}
          </Text>
          <Text style={[styles.planSubtitle, { color: isAnnual ? 'rgba(255,255,255,0.8)' : colors.textSecondary }]}>
            {isAnnual
              ? `${profile?.searches_count || 0} consultas realizadas`
              : 'Por apenas R$ 97/ano'}
          </Text>
          {!isAnnual && (
            <Pressable onPress={() => router.push('/paywall')} style={styles.planButton}>
              <Text style={styles.planButtonText}>Ver planos</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.primary} />
            </Pressable>
          )}
        </LinearGradient>

        {/* Ação rápida principal */}
        <Pressable onPress={() => router.push('/(tabs)/search')} style={styles.quickAction}>
          <LinearGradient
            colors={[colors.primary + '33', colors.primary + '11']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.quickActionContent}>
            <View style={styles.quickActionIcon}>
              <Ionicons name="search" size={28} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.quickActionTitle}>Nova pesquisa</Text>
              <Text style={styles.quickActionSubtitle}>Verifique antecedentes em segundos</Text>
            </View>
            <Ionicons name="arrow-forward-circle" size={32} color={colors.primary} />
          </View>
        </Pressable>

        <View style={styles.safetyShortcuts}>
          <Pressable
            style={styles.shortcutCard}
            onPress={() => router.push('/safety-mode')}
          >
            <Text style={styles.shortcutEmoji}>🛡️</Text>
            <Text style={styles.shortcutTitle}>Safety Mode</Text>
          </Pressable>
          <Pressable
            style={styles.shortcutCard}
            onPress={() => router.push('/emergency-contacts')}
          >
            <Text style={styles.shortcutEmoji}>👥</Text>
            <Text style={styles.shortcutTitle}>Contatos</Text>
          </Pressable>
          <Pressable
            style={styles.shortcutCard}
            onPress={() => router.push('/safe-places')}
          >
            <Text style={styles.shortcutEmoji}>📍</Text>
            <Text style={styles.shortcutTitle}>Locais Seguros</Text>
          </Pressable>
        </View>

        {/* Histórico recente */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Pesquisas recentes</Text>
            {recentChecks.length > 0 && (
              <Pressable onPress={() => router.push('/(tabs)/history')}>
                <Text style={styles.sectionLink}>Ver todas</Text>
              </Pressable>
            )}
          </View>

          {recentChecks.length === 0 ? (
            <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
              <Ionicons name="shield-outline" size={48} color={colors.textMuted} />
              <Text style={styles.emptyText}>Nenhuma pesquisa ainda</Text>
              <Text style={styles.emptySubtext}>Faça sua primeira verificação</Text>
            </Card>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {recentChecks.map((check) => (
                <Card key={check.id} onPress={() => router.push(`/report/${check.id}`)}>
                  <View style={styles.checkItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkName}>{check.target_name}</Text>
                      <Text style={styles.checkDate}>
                        {new Date(check.created_at).toLocaleDateString('pt-BR')}
                      </Text>
                    </View>
                    <FlagBadge flag={check.flag} size="sm" />
                  </View>
                </Card>
              ))}
            </View>
          )}
        </View>

        {/* Dica de segurança */}
        <Card style={styles.tip}>
          <View style={styles.tipIcon}>
            <Ionicons name="bulb" size={20} color={colors.flagYellow} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.tipTitle}>Dica de segurança</Text>
            <Text style={styles.tipText}>
              Marque encontros em lugares públicos e compartilhe sua localização com uma pessoa de confiança.
            </Text>
          </View>
        </Card>
      </ScrollView>
      <View style={styles.sosButtonContainer}>
        <SosButton />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl + 140 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  greeting: { ...typography.body, color: colors.textSecondary },
  name: { ...typography.h2, color: colors.text },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  planCard: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.full,
  },
  planBadgeText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  planTitle: { ...typography.h3, marginBottom: 4 },
  planSubtitle: { ...typography.caption },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.md,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  planButtonText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  quickAction: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.primary + '33',
  },
  quickActionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.md,
  },
  quickActionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionTitle: { ...typography.h3, color: colors.text },
  quickActionSubtitle: { ...typography.caption, color: colors.textSecondary },
  safetyShortcuts: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  shortcutCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  shortcutEmoji: { fontSize: 20 },
  shortcutTitle: {
    ...typography.small,
    color: colors.text,
    fontWeight: '700',
    textAlign: 'center',
  },
  section: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: { ...typography.h3, color: colors.text },
  sectionLink: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  emptyText: { ...typography.bodyBold, color: colors.textSecondary, marginTop: spacing.md },
  emptySubtext: { ...typography.caption, color: colors.textMuted, marginTop: 4 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkName: { ...typography.bodyBold, color: colors.text, marginBottom: 2 },
  checkDate: { ...typography.small, color: colors.textMuted },
  tip: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  tipIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.flagYellowBg,
    alignItems: 'center', justifyContent: 'center',
  },
  tipTitle: { ...typography.bodyBold, color: colors.text, marginBottom: 2 },
  tipText: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  sosButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
  }});
