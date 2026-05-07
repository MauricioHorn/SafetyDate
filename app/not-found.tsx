import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing, typography, radius } from '@/lib/theme';

type NotFoundReason = 'name_not_found' | 'no_match_after_all_filters';

function notFoundReasonFromParam(value: string | undefined): NotFoundReason {
  if (value === 'no_match_after_all_filters') return 'no_match_after_all_filters';
  return 'name_not_found';
}

export default function NotFound() {
  const params = useLocalSearchParams<{ reason?: string; name?: string }>();
  const reason = notFoundReasonFromParam(
    typeof params.reason === 'string' ? params.reason : undefined,
  );
  const name = typeof params.name === 'string' ? params.name : '';

  const isAfterFilters = reason === 'no_match_after_all_filters';

  return (
    <>
      <Stack.Screen options={{ title: 'Não encontrado', headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.iconWrap}>
            <Ionicons name="search-outline" size={48} color={colors.textMuted} />
          </View>

          <Text style={styles.title}>
            {isAfterFilters
              ? 'Não conseguimos identificar essa pessoa'
              : `Não encontramos ${name || 'essa pessoa'}`}
          </Text>

          <Text style={styles.subtitle}>
            {isAfterFilters
              ? 'Mesmo com os filtros adicionais, não conseguimos um match seguro nas bases públicas.'
              : 'Não localizamos ninguém com esse nome nas bases públicas que consultamos.'}
          </Text>

          <Card style={styles.reasonCard}>
            <Text style={styles.reasonTitle}>Possíveis razões:</Text>

            <ReasonItem
              icon="warning-outline"
              color={colors.flagYellow}
              title="A pessoa pode ter dado um nome falso"
              description="Quando alguém usa nome de outra pessoa (mesmo conhecida), nossa busca não encontra. Esse já é um sinal pra ficar atenta."
              isHighlight
            />

            <ReasonItem
              icon="document-text-outline"
              color={colors.textSecondary}
              title="Erro de digitação"
              description="Confira se você escreveu o nome completo, sem abreviações."
            />

            <ReasonItem
              icon="person-outline"
              color={colors.textSecondary}
              title="Pessoa muito jovem ou recém-cadastrada"
              description="Algumas pessoas levam tempo até aparecer em bases públicas."
            />

            {!isAfterFilters && (
              <ReasonItem
                icon="key-outline"
                color={colors.textSecondary}
                title="Tente com o CPF"
                description="Se você tiver acesso ao CPF, a busca por documento é mais precisa."
              />
            )}
          </Card>

          <View style={styles.actions}>
            <Button
              label="Tentar nova pesquisa"
              onPress={() => router.replace('/(tabs)/search')}
            />
            <Pressable
              onPress={() => router.replace('/(tabs)')}
              style={styles.secondaryAction}
            >
              <Text style={styles.secondaryActionText}>Voltar pro início</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

function ReasonItem({
  icon,
  color,
  title,
  description,
  isHighlight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  description: string;
  isHighlight?: boolean;
}) {
  return (
    <View style={[styles.reasonItem, isHighlight && styles.reasonItemHighlight]}>
      <View style={[styles.reasonIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.reasonItemTitle}>{title}</Text>
        <Text style={styles.reasonItemDesc}>{description}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    ...typography.h1,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  reasonCard: {
    gap: spacing.md,
  },
  reasonTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  reasonItem: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  reasonItemHighlight: {
    backgroundColor: colors.flagYellowBg,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  reasonIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reasonItemTitle: {
    ...typography.bodyBold,
    color: colors.text,
    marginBottom: 2,
  },
  reasonItemDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  secondaryAction: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  secondaryActionText: {
    ...typography.body,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
