import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { supabase, Profile } from '@/lib/supabase';
import { colors, spacing, radius } from '@/lib/theme';
import { SafetyModeActiveCard } from '../../components/SafetyModeActiveCard';
import { getActiveSession, SafetySession } from '../../lib/safety';

export default function Home() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSession, setActiveSession] = useState<SafetySession | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(profileData);
    } finally {
      setInitialLoadDone(true);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const session = await getActiveSession();
          if (!cancelled) setActiveSession(session);
        } catch (err) {
          console.error('Erro ao carregar sessão ativa:', err);
          if (!cancelled) setActiveSession(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const firstName = profile?.full_name?.split(' ')[0] || 'você';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        }
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Olá,</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          <Pressable onPress={() => router.push('/profile')} accessibilityRole="button">
            <Ionicons name="person-circle-outline" size={32} color={colors.primary} />
          </Pressable>
        </View>

        {activeSession && (
          <View style={styles.activeSessionWrapper}>
            <SafetyModeActiveCard
              session={activeSession}
              onEnded={() => setActiveSession(null)}
            />
          </View>
        )}

        <Pressable
          style={styles.primaryCard}
          onPress={() => router.push('/(tabs)/search')}
          accessibilityRole="button"
        >
          <Ionicons
            name="arrow-forward"
            size={24}
            color={colors.textOnPrimary}
            style={styles.primaryCardArrow}
          />
          <Ionicons name="search" size={32} color={colors.textOnPrimary} />
          <Text style={styles.primaryCardTitle}>Pesquisar alguém</Text>
          <Text style={styles.primaryCardSubtitle}>
            Verificar antecedentes em segundos
          </Text>
        </Pressable>

        <Pressable
          style={styles.secondaryActionCard}
          onPress={() => router.push('/safety-mode')}
          accessibilityRole="button"
        >
          <View style={styles.secondaryActionIcon}>
            <Ionicons name="shield-half" size={28} color={colors.primary} />
          </View>
          <View style={styles.secondaryActionText}>
            <Text style={styles.secondaryActionTitle}>Vou sair agora</Text>
            <Text style={styles.secondaryActionSubtitle}>
              Ativar Modo Seguro e compartilhar localização
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            style={styles.secondaryCard}
            onPress={() => router.push('/emergency-contacts')}
            accessibilityRole="button"
          >
            <Ionicons name="people-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.secondaryCardLabel} numberOfLines={1}>
              Contatos
            </Text>
          </Pressable>
          <Pressable
            style={styles.secondaryCard}
            onPress={() => router.push('/safe-places')}
            accessibilityRole="button"
          >
            <Ionicons name="location-outline" size={22} color={colors.textSecondary} />
            <Text style={styles.secondaryCardLabel} numberOfLines={1}>
              Lugares Seguros
            </Text>
          </Pressable>
        </View>

        {/* TODO: calcular saídas com Modo Seguro do mês corrente */}
        <View style={styles.statsCard}>
          <View style={styles.statsColumn}>
            <Text style={styles.statsNumber}>
              {initialLoadDone ? String(profile?.searches_count ?? 0) : '—'}
            </Text>
            <Text style={styles.statsLabel}>Pesquisas feitas</Text>
          </View>
          <View style={styles.statsDivider} />
          <View style={styles.statsColumn}>
            <Text style={styles.statsNumber}>—</Text>
            <Text style={styles.statsLabel}>Saídas com Modo Seguro</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: {
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  greeting: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  activeSessionWrapper: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  primaryCard: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.xl,
    minHeight: 130,
    position: 'relative',
  },
  primaryCardArrow: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
  },
  primaryCardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textOnPrimary,
    marginTop: spacing.sm,
  },
  primaryCardSubtitle: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  secondaryActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    minHeight: 140,
  },
  secondaryActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    flex: 1,
  },
  secondaryActionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  secondaryActionSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 4,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  secondaryCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    minHeight: 110,
  },
  secondaryCardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.sm,
  },
  statsCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  statsColumn: {
    alignItems: 'center',
  },
  statsNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.primary,
  },
  statsLabel: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  statsDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
});
