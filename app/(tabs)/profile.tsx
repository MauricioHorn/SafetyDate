import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  Pressable,
  Linking,
  Modal,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import * as SecureStore from 'expo-secure-store';
import * as ImagePicker from 'expo-image-picker';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { supabase, Profile } from '@/lib/supabase';
import { uploadAvatar } from '@/lib/profile';
import { colors, spacing, typography, radius } from '@/lib/theme';
import { fetchOffering, PRODUCT_ANNUAL } from '@/lib/revenuecat';
import { useToast } from '@/contexts/ToastContext';
const PANIC_CODE_KEY = 'elas_panic_code';
const MIN_PANIC_CODE = 4;
const MAX_PANIC_CODE = 6;

export default function ProfileScreen() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [panicModalVisible, setPanicModalVisible] = useState(false);
  const [hasPanicCode, setHasPanicCode] = useState(false);
  const [annualPriceLabel, setAnnualPriceLabel] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [])
  );

  useEffect(() => {
    void refreshPanicCodeStatus();
  }, []);

  useEffect(() => {
    (async () => {
      const off = await fetchOffering();
      const annual = off?.availablePackages.find(
        (p) => p.product.identifier === PRODUCT_ANNUAL
      );
      if (annual) {
        setAnnualPriceLabel(annual.product.priceString);
      }
    })();
  }, []);

  async function refreshPanicCodeStatus() {
    try {
      const stored = await SecureStore.getItemAsync(PANIC_CODE_KEY);
      setHasPanicCode(Boolean(stored && stored.length >= MIN_PANIC_CODE));
    } catch {
      setHasPanicCode(false);
    }
  }

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
    if (!data) return;
    let avatar_url = data.avatar_url;
    if (avatar_url) {
      const base = avatar_url.split('?')[0];
      avatar_url = `${base}?t=${Date.now()}`;
    }
    setProfile({ ...data, avatar_url });
  }

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      showToast('Permissão necessária: Precisamos de acesso às suas fotos para escolher um avatar.', 'error');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    const res = await uploadAvatar(result.assets[0].uri);
    setUploadingPhoto(false);
    if (res.success && res.url) {
      setProfile((prev) => (prev ? { ...prev, avatar_url: res.url } : prev));
      showToast('Foto atualizada', 'success');
    } else {
      showToast(res.error || 'Não foi possível atualizar a foto.', 'error');
    }
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
  const isMonthly = profile?.plan === 'monthly';
  const isPremium = isAnnual || isMonthly;
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
          <TouchableOpacity
            onPress={handlePickPhoto}
            disabled={uploadingPhoto}
            activeOpacity={0.8}
            style={styles.avatarTouchable}
          >
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            {uploadingPhoto && (
              <View style={styles.avatarUploading}>
                <ActivityIndicator size="small" color="#FFFFFF" />
              </View>
            )}
          </TouchableOpacity>
          <Text style={styles.name}>{profile?.full_name || 'Usuária'}</Text>
          <Text style={styles.email}>{profile?.email}</Text>
        </View>

        <Card style={styles.planCard}>
          <View style={styles.planHeader}>
            <View style={[styles.planBadge, isPremium && styles.planBadgeAnnual]}>
              <Ionicons
                name={isPremium ? 'diamond' : 'person'}
                size={14}
                color={isPremium ? '#fff' : colors.textMuted}
              />
              <Text style={[styles.planBadgeText, isPremium && { color: '#fff' }]}>
                {isAnnual ? 'PLANO ANUAL ATIVO' : isMonthly ? 'PLANO MENSAL ATIVO' : 'CONTA GRATUITA'}
              </Text>
            </View>
          </View>

          {isPremium ? (
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
                {annualPriceLabel
                  ? `${annualPriceLabel}/ano no plano anual`
                  : 'Veja os planos disponíveis'}
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <Button label="Assinar plano anual" onPress={() => router.push('/paywall')} />
              </View>
            </>
          )}
        </Card>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conta</Text>

          <MenuItem icon="person-outline" label="Editar perfil" onPress={() => router.push('/editar-perfil')} />
          <MenuItem icon="card-outline" label="Método de pagamento" onPress={() => {}} />
          <MenuItem icon="receipt-outline" label="Minhas faturas" onPress={() => {}} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Segurança</Text>
          <MenuItem icon="people-outline" label="Contatos de confiança" onPress={() => router.push('/emergency-contacts')} />
          <MenuItem
            icon="keypad-outline"
            label="Senha de emergência"
            subtitle={hasPanicCode ? 'Configurada neste aparelho' : 'Não configurada'}
            onPress={() => setPanicModalVisible(true)}
          />
          <MenuItem icon="call-outline" label="Ligação falsa" onPress={() => router.push('/fake-call-setup')} />
          <MenuItem icon="shield-checkmark-outline" label="Privacidade" onPress={() => router.push('/privacy-data')} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ajuda</Text>
          <MenuItem icon="help-circle-outline" label="Central de ajuda" onPress={() => {}} />
          <MenuItem icon="mail-outline" label="Falar com o suporte" onPress={() => {}} />
          <MenuItem icon="document-text-outline" label="Termos de uso" onPress={() => Linking.openURL('https://elasapp.com.br/termos')} />
          <MenuItem icon="shield-outline" label="Política de privacidade" onPress={() => Linking.openURL('https://elasapp.com.br/privacidade')} />
        </View>

        <View style={{ marginTop: spacing.lg, paddingHorizontal: spacing.lg }}>
          <Button label="Sair" variant="secondary" onPress={handleSignOut} />
        </View>

        <Text style={styles.version}>ELAS v1.0.0</Text>
      </ScrollView>

      <PanicCodeModal
        visible={panicModalVisible}
        hasExisting={hasPanicCode}
        onClose={() => setPanicModalVisible(false)}
        onSaved={() => {
          void refreshPanicCodeStatus();
          setPanicModalVisible(false);
        }}
      />
    </SafeAreaView>
  );
}

function PanicCodeModal({
  visible,
  hasExisting,
  onClose,
  onSaved,
}: {
  visible: boolean;
  hasExisting: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [step, setStep] = useState<'menu' | 'enter' | 'confirm'>('enter');
  const [firstCode, setFirstCode] = useState('');
  const [confirmCode, setConfirmCode] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setStep(hasExisting ? 'menu' : 'enter');
    setFirstCode('');
    setConfirmCode('');
    setSaving(false);
  }, [hasExisting]);

  useEffect(() => {
    if (!visible) reset();
  }, [visible, reset]);

  const activeCode = step === 'enter' ? firstCode : confirmCode;
  const setActiveCode = step === 'enter' ? setFirstCode : setConfirmCode;

  const handleDigit = (digit: string) => {
    if (activeCode.length >= MAX_PANIC_CODE) return;
    const next = activeCode + digit;
    setActiveCode(next);
    if (next.length >= MIN_PANIC_CODE && next.length < MAX_PANIC_CODE) {
      // aguarda mais dígitos ou confirmação manual
    }
    if (next.length === MAX_PANIC_CODE) {
      void advanceStep(next);
    }
  };

  const advanceStep = async (code: string) => {
    if (step === 'enter') {
      setFirstCode(code);
      setStep('confirm');
      setConfirmCode('');
      return;
    }
    if (code !== firstCode) {
      showToast('Códigos diferentes: Digite o mesmo código nas duas etapas.', 'error');
      setConfirmCode('');
      return;
    }
    setSaving(true);
    try {
      await SecureStore.setItemAsync(PANIC_CODE_KEY, code);
      onSaved();
      showToast('Senha de emergência salva neste aparelho.', 'success');
    } catch {
      showToast('Não foi possível salvar. Tente novamente.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmLength = () => {
    if (activeCode.length < MIN_PANIC_CODE) {
      showToast(`Código curto: Use entre ${MIN_PANIC_CODE} e ${MAX_PANIC_CODE} dígitos.`, 'error');
      return;
    }
    void advanceStep(activeCode);
  };

  const handleBackspace = () => {
    setActiveCode((c) => c.slice(0, -1));
  };

  const handleStartChange = () => {
    setFirstCode('');
    setConfirmCode('');
    setStep('enter');
  };

  const handleRemove = () => {
    Alert.alert(
      'Remover senha',
      'Remover a senha de emergência deste aparelho?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await SecureStore.deleteItemAsync(PANIC_CODE_KEY);
              onSaved();
              showToast('Senha de emergência removida.', 'success');
            } catch {
              showToast('Não foi possível remover.', 'error');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={panicStyles.modal} edges={['top', 'bottom']}>
        <View style={panicStyles.modalHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={panicStyles.cancelText}>Cancelar</Text>
          </Pressable>
          <Text style={panicStyles.modalTitle}>Senha de emergência</Text>
          <View style={{ width: 72 }} />
        </View>

        {step === 'menu' ? (
          <View style={panicStyles.menuContent}>
            <Text style={panicStyles.menuStatus}>Senha configurada neste aparelho.</Text>
            <Pressable style={panicStyles.menuBtnPrimary} onPress={handleStartChange}>
              <Text style={panicStyles.menuBtnPrimaryText}>Alterar senha</Text>
            </Pressable>
            <Pressable style={panicStyles.menuBtnDanger} onPress={handleRemove}>
              <Text style={panicStyles.menuBtnDangerText}>Remover senha</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={panicStyles.modalHint}>
              {step === 'enter'
                ? `Crie um código numérico de ${MIN_PANIC_CODE} a ${MAX_PANIC_CODE} dígitos. Fica só neste celular — não enviamos pro servidor.`
                : 'Digite o mesmo código novamente para confirmar.'}
            </Text>

            <View style={panicStyles.dotsRow}>
              {Array.from({ length: MAX_PANIC_CODE }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    panicStyles.dot,
                    i < activeCode.length && panicStyles.dotFilled,
                  ]}
                />
              ))}
            </View>

            <Text style={panicStyles.lengthHint}>
              {activeCode.length} / {MAX_PANIC_CODE} dígitos
            </Text>

            {activeCode.length >= MIN_PANIC_CODE && activeCode.length < MAX_PANIC_CODE && (
              <Pressable
                style={panicStyles.continueBtn}
                onPress={handleConfirmLength}
                disabled={saving}
              >
                <Text style={panicStyles.continueText}>
                  {step === 'enter' ? 'Continuar' : 'Confirmar'}
                </Text>
              </Pressable>
            )}

            <PanicKeypad onDigit={handleDigit} onBackspace={handleBackspace} />
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function PanicKeypad({
  onDigit,
  onBackspace,
}: {
  onDigit: (d: string) => void;
  onBackspace: () => void;
}) {
  const rows = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'back'],
  ];

  return (
    <View style={panicStyles.keypad}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={panicStyles.keypadRow}>
          {row.map((key) => {
            if (key === '') return <View key="spacer" style={panicStyles.keySpacer} />;
            if (key === 'back') {
              return (
                <Pressable key="back" onPress={onBackspace} style={panicStyles.key}>
                  <Ionicons name="backspace-outline" size={24} color={colors.text} />
                </Pressable>
              );
            }
            return (
              <Pressable key={key} onPress={() => onDigit(key)} style={panicStyles.key}>
                <Text style={panicStyles.keyText}>{key}</Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function MenuItem({
  icon,
  label,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.6 }]}>
      <View style={styles.menuItemIcon}>
        <Ionicons name={icon} size={20} color={colors.textSecondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.menuItemLabel}>{label}</Text>
        {subtitle ? <Text style={styles.menuItemSubtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { paddingBottom: spacing.xxl },
  header: { alignItems: 'center', padding: spacing.xl },
  avatarTouchable: {
    position: 'relative',
    marginBottom: spacing.md,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: colors.primarySubtle,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.primary,
  },
  avatarImg: {
    width: 88, height: 88, borderRadius: 44,
    borderWidth: 2, borderColor: colors.primary,
  },
  avatarUploading: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
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
  menuItemLabel: { ...typography.body, color: colors.text },
  menuItemSubtitle: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  version: {
    textAlign: 'center',
    ...typography.small,
    color: colors.textMuted,
    marginTop: spacing.xl,
  },
});

const panicStyles = StyleSheet.create({
  modal: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  cancelText: { color: colors.primary, fontSize: 16, fontWeight: '600', flexShrink: 0 },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: spacing.sm,
  },
  modalHint: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.sm,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
    marginBottom: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  lengthHint: {
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: 13,
    marginBottom: spacing.md,
  },
  continueBtn: {
    alignSelf: 'center',
    backgroundColor: colors.primarySubtle,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginBottom: spacing.md,
  },
  continueText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
  keypad: {
    alignSelf: 'center',
    width: '85%',
    gap: 18,
    marginTop: spacing.md,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 26,
  },
  key: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keySpacer: {
    flex: 1,
    aspectRatio: 1,
  },
  keyText: { fontSize: 36, color: colors.text, fontWeight: '400' },
  menuContent: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    gap: spacing.md,
  },
  menuStatus: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  menuBtnPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  menuBtnPrimaryText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  menuBtnDanger: {
    backgroundColor: colors.surface,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.flagRed,
  },
  menuBtnDangerText: {
    color: colors.flagRed,
    fontSize: 17,
    fontWeight: '700',
  },
});
