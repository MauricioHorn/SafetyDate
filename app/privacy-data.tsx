import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { colors, spacing, typography, radius } from '@/lib/theme';
import { useToast } from '@/contexts/ToastContext';

const DANGER_RED = '#F87171';

export default function PrivacyDataScreen() {
  const { showToast } = useToast();
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);

  const canConfirmDelete = confirmText.trim().toUpperCase() === 'DELETAR';

  function handleDeleteAccount() {
    setConfirmText('');
    setDeleteModalVisible(true);
  }

  function closeDeleteModal() {
    setDeleteModalVisible(false);
    setConfirmText('');
  }

  async function executeDeleteAccount() {
    if (!canConfirmDelete) {
      Alert.alert('Confirmação', 'Digite DELETAR para confirmar.');
      return;
    }
    try {
      setLoading(true);
      const { error } = await supabase.functions.invoke('delete-account');
      if (error) {
        showToast('Não foi possível deletar sua conta. Tente novamente ou fale com o suporte.', 'error');
        return;
      }
      setDeleteModalVisible(false);
      await supabase.auth.signOut();
    } catch {
      showToast('Algo deu errado ao deletar sua conta.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacidade e dados</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Seus dados</Text>
          <Text style={styles.bodyText}>
            Você tem direito de acessar, corrigir ou exportar seus dados pessoais. Para solicitar,
            entre em contato pelo e-mail contato@elasapp.com.br e responderemos no prazo previsto
            pela LGPD.
          </Text>
        </View>

        <View style={styles.dangerSection}>
          <Text style={styles.dangerTitle}>Zona de perigo</Text>
          <Text style={styles.dangerText}>
            Deletar sua conta remove permanentemente seu perfil, contatos de emergência, lugares
            seguros, histórico e todos os seus dados. Esta ação não pode ser desfeita.
          </Text>
          <Pressable
            onPress={handleDeleteAccount}
            disabled={loading}
            style={({ pressed }) => [
              styles.deleteLink,
              pressed && { opacity: 0.6 },
              loading && { opacity: 0.5 },
            ]}
          >
            <Text style={styles.deleteLinkText}>Deletar minha conta</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        visible={deleteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={closeDeleteModal} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Deletar conta permanentemente</Text>
            <Text style={styles.modalBody}>
              Esta ação é irreversível. Para confirmar, digite DELETAR no campo abaixo.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={confirmText}
              onChangeText={setConfirmText}
              placeholder="DELETAR"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={closeDeleteModal}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                onPress={executeDeleteAccount}
                disabled={!canConfirmDelete || loading}
                style={({ pressed }) => [
                  styles.modalDelete,
                  (!canConfirmDelete || loading) && styles.modalDeleteDisabled,
                  pressed && canConfirmDelete && !loading && { opacity: 0.8 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text
                    style={[
                      styles.modalDeleteText,
                      !canConfirmDelete && styles.modalDeleteTextDisabled,
                    ]}
                  >
                    Deletar minha conta
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
  },
  headerSpacer: { width: 40 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    ...typography.small,
    color: colors.textMuted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  bodyText: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  dangerSection: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    backgroundColor: 'rgba(127, 29, 29, 0.25)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(248, 113, 113, 0.35)',
  },
  dangerTitle: {
    ...typography.bodyBold,
    color: DANGER_RED,
    marginBottom: spacing.sm,
  },
  dangerText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  deleteLink: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  deleteLinkText: {
    ...typography.bodyBold,
    color: DANGER_RED,
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  modalBody: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  modalInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    color: colors.text,
    ...typography.body,
    marginBottom: spacing.lg,
  },
  modalActions: { gap: spacing.sm },
  modalCancel: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalCancelText: { ...typography.bodyBold, color: colors.text },
  modalDelete: {
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.full,
    backgroundColor: DANGER_RED,
  },
  modalDeleteDisabled: {
    backgroundColor: colors.border,
  },
  modalDeleteText: { ...typography.bodyBold, color: '#fff' },
  modalDeleteTextDisabled: { color: colors.textMuted },
});
