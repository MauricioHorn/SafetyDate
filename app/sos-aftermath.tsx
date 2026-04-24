import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { keepAlertActive, markAsFalseAlarm } from '@/lib/safety';
import { supabase } from '@/lib/supabase';

export default function SosAftermathScreen() {
  const { alertId } = useLocalSearchParams<{ alertId?: string }>();
  const [contactsNotified, setContactsNotified] = useState<number>(0);
  const [loadingAction, setLoadingAction] = useState(false);

  useEffect(() => {
    if (!alertId) return;

    const loadAlert = async () => {
      const { data } = await supabase
        .from('sos_alerts')
        .select('contacts_notified')
        .eq('id', alertId)
        .maybeSingle();

      setContactsNotified(data?.contacts_notified ?? 0);
    };

    loadAlert();
  }, [alertId]);

  const handleFalseAlarm = async () => {
    if (!alertId) {
      router.replace('/(tabs)');
      return;
    }

    try {
      setLoadingAction(true);
      await markAsFalseAlarm(alertId);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to mark false alarm:', error);
      Alert.alert('Erro', 'Nao foi possivel atualizar o status do SOS.');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleKeepActive = async () => {
    if (!alertId) {
      router.replace('/(tabs)');
      return;
    }

    try {
      setLoadingAction(true);
      await keepAlertActive(alertId);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Failed to keep alert active:', error);
      Alert.alert('Erro', 'Nao foi possivel manter o alerta ativo.');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.successCard}>
        <Text style={styles.successTitle}>✓ ALERTA ENVIADO</Text>
        <Text style={styles.successSubtitle}>{contactsNotified} amigas notificadas</Text>
      </View>

      <Text style={styles.title}>Voce esta segura?</Text>
      <Text style={styles.subtitle}>Avise suas amigas pra elas ficarem tranquilas</Text>

      <Pressable style={styles.falseAlarmButton} onPress={handleFalseAlarm} disabled={loadingAction}>
        <Text style={styles.primaryButtonTitle}>Foi engano</Text>
        <Text style={styles.primaryButtonSubtitle}>Avisar todas que estou bem</Text>
      </Pressable>

      <Pressable style={styles.keepActiveButton} onPress={handleKeepActive} disabled={loadingAction}>
        <Text style={styles.secondaryButtonTitle}>Ainda preciso de ajuda</Text>
        <Text style={styles.secondaryButtonSubtitle}>Manter alerta ativo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A14',
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  successCard: {
    backgroundColor: '#10B981',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 34,
  },
  successTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
  },
  successSubtitle: {
    color: '#ECFDF5',
    marginTop: 6,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    color: '#B4B4C7',
    marginTop: 10,
    marginBottom: 32,
    fontSize: 18,
    lineHeight: 24,
  },
  falseAlarmButton: {
    backgroundColor: '#10B981',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  primaryButtonTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
  },
  primaryButtonSubtitle: {
    color: '#ECFDF5',
    marginTop: 6,
    fontSize: 15,
  },
  keepActiveButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#FF4D7E',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 20,
  },
  secondaryButtonTitle: {
    color: '#FFFFFF',
    fontSize: 25,
    fontWeight: '900',
  },
  secondaryButtonSubtitle: {
    color: '#B4B4C7',
    marginTop: 6,
    fontSize: 15,
  },
});
