import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { resetVault } from '@/lib/vault';
import { colors, spacing } from '@/lib/theme';

export default function VaultResetScreen() {
  const router = useRouter();
  const [acknowledged, setAcknowledged] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    Alert.alert(
      'Resetar cofre',
      'Tem certeza? TODOS os arquivos serão apagados pra sempre.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Sim, apagar tudo',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                Alert.alert('Erro', 'Sessão expirada.');
                router.replace('/login');
                return;
              }
              await resetVault(user.id);
              Alert.alert(
                'Cofre resetado',
                'Tudo foi apagado. Você pode criar uma senha nova agora.',
                [{ text: 'OK', onPress: () => router.replace('/vault-create') }]
              );
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : 'Não foi possível resetar.';
              Alert.alert('Erro', message);
              setResetting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Resetar Cofre',
          headerShown: true,
          headerBackTitle: 'Voltar',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
        }}
      />

      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name="warning" size={64} color="#EF4444" />
        </View>

        <Text style={styles.title}>Esqueceu a senha?</Text>

        <Text style={styles.warning}>
          O Cofre é tão privado que <Text style={styles.bold}>nem nós podemos abrir sem sua senha</Text>. Se você esqueceu, a única opção é resetar.
        </Text>

        <View style={styles.lossBox}>
          <Text style={styles.lossTitle}>Você vai perder:</Text>
          <Text style={styles.lossItem}>• Todas as notas guardadas</Text>
          <Text style={styles.lossItem}>• Todas as fotos guardadas</Text>
          <Text style={styles.lossItem}>• Todos os documentos guardados</Text>
          <Text style={styles.lossItem}>• Tudo o que está no Cofre</Text>
        </View>

        <Text style={styles.irreversible}>
          Essa ação <Text style={styles.bold}>não pode ser desfeita</Text>.
        </Text>

        <TouchableOpacity
          style={styles.checkbox}
          onPress={() => setAcknowledged(!acknowledged)}
        >
          <View style={[styles.checkboxBox, acknowledged && styles.checkboxChecked]}>
            {acknowledged && <Ionicons name="checkmark" size={18} color="#fff" />}
          </View>
          <Text style={styles.checkboxText}>
            Entendo que vou perder tudo do Cofre pra sempre.
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resetBtn, (!acknowledged || resetting) && styles.resetBtnDisabled]}
          onPress={handleReset}
          disabled={!acknowledged || resetting}
        >
          {resetting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.resetBtnText}>Resetar Cofre</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
          <Text style={styles.cancelText}>Cancelar e voltar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  iconWrap: { alignItems: 'center', marginTop: spacing.md },
  title: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center' },
  warning: { fontSize: 15, color: colors.text, textAlign: 'center', lineHeight: 22 },
  bold: { fontWeight: '700' },
  lossBox: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 12, padding: spacing.md, marginVertical: spacing.sm, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  lossTitle: { fontSize: 14, fontWeight: '700', color: '#EF4444', marginBottom: 8 },
  lossItem: { fontSize: 14, color: colors.text, lineHeight: 22 },
  irreversible: { fontSize: 14, color: '#EF4444', textAlign: 'center', marginTop: spacing.sm },
  checkbox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.md, backgroundColor: colors.surface, borderRadius: 12, marginTop: spacing.md },
  checkboxBox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.textSecondary, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: '#EF4444', borderColor: '#EF4444' },
  resetBtn: { backgroundColor: '#EF4444', padding: spacing.md, borderRadius: 12, alignItems: 'center', marginTop: spacing.md },
  resetBtnDisabled: { backgroundColor: 'rgba(239,68,68,0.3)' },
  resetBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelLink: { padding: spacing.md, alignItems: 'center' },
  cancelText: { color: colors.textSecondary, fontSize: 14 },
});
