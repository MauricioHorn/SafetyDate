import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Card } from '@/components/Card';
import { FlagBadge } from '@/components/FlagBadge';
import { supabase, BackgroundCheck } from '@/lib/supabase';
import { colors, spacing, typography } from '@/lib/theme';

export default function History() {
  const [checks, setChecks] = useState<BackgroundCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadChecks = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('background_checks')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    setChecks(data || []);
    setLoading(false);
  };

  useEffect(() => { loadChecks(); }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadChecks();
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Histórico</Text>
        <Text style={styles.subtitle}>
          {checks.length} {checks.length === 1 ? 'pesquisa' : 'pesquisas'}
        </Text>
      </View>

      <FlatList
        data={checks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={64} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>Nenhuma pesquisa ainda</Text>
              <Text style={styles.emptyText}>
                Suas pesquisas aparecerão aqui para consulta futura.
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/report/${item.id}`)} style={styles.item}>
            <View style={styles.itemContent}>
              <View style={styles.itemAvatar}>
                <Text style={styles.itemInitials}>
                  {item.target_name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName} numberOfLines={1}>{item.target_name}</Text>
                <View style={styles.itemMeta}>
                  <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.itemMetaText}>
                    {new Date(item.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                  {item.processes_count > 0 && (
                    <>
                      <Text style={styles.itemMetaDivider}>•</Text>
                      <Ionicons name="document-text-outline" size={12} color={colors.textMuted} />
                      <Text style={styles.itemMetaText}>
                        {item.processes_count} {item.processes_count === 1 ? 'processo' : 'processos'}
                      </Text>
                    </>
                  )}
                </View>
              </View>
              <FlagBadge flag={item.flag} size="sm" />
            </View>
          </Card>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.lg, paddingBottom: spacing.md },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  item: { padding: spacing.md },
  itemContent: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary + '40',
  },
  itemInitials: { color: colors.primary, fontWeight: '800', fontSize: 14 },
  itemName: { ...typography.bodyBold, color: colors.text, marginBottom: 4 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemMetaText: { ...typography.small, color: colors.textMuted },
  itemMetaDivider: { color: colors.textMuted, marginHorizontal: 2 },
  empty: { alignItems: 'center', paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.lg },
  emptyTitle: { ...typography.h3, color: colors.text, marginTop: spacing.md },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
});
