import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Alert,
  Linking,
  Vibration,
} from 'react-native';
import * as Location from 'expo-location';
import * as SMS from 'expo-sms';
import * as Battery from 'expo-battery';
import {
  getEmergencyContacts,
  recordSosAlert,
  getActiveSession,
} from '../lib/safety';

interface Props {
  onActivated?: () => void;
  style?: any;
}

export function SosButton({ onActivated, style }: Props) {
  const [pressing, setPressing] = useState(false);
  const [loading, setLoading] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const HOLD_DURATION_MS = 3000;

  const handlePressIn = () => {
    if (loading) return;
    setPressing(true);

    Animated.timing(progress, {
      toValue: 1,
      duration: HOLD_DURATION_MS,
      useNativeDriver: false,
    }).start();

    Vibration.vibrate([0, 60, 100, 60, 100, 60]);

    pressTimer.current = setTimeout(() => {
      triggerEmergency();
    }, HOLD_DURATION_MS);
  };

  const handlePressOut = () => {
    setPressing(false);
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const triggerEmergency = async () => {
    setPressing(false);
    setLoading(true);
    try {
      Vibration.vibrate([0, 500, 200, 500, 200, 500]);

      const contacts = await getEmergencyContacts();
      if (contacts.length === 0) {
        Alert.alert(
          'Contatos não cadastrados',
          'Você precisa cadastrar pelo menos 1 contato de emergência antes de usar o SOS.',
          [{ text: 'Entendi' }]
        );
        return;
      }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permissão de localização',
          'Precisamos da sua localização para enviar ajuda. Vá em Configurações e permita o acesso.'
        );
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      let batteryLevel: number | undefined;
      try {
        batteryLevel = Math.round((await Battery.getBatteryLevelAsync()) * 100);
      } catch {
        batteryLevel = undefined;
      }

      const { latitude, longitude, accuracy } = location.coords;
      const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
      const timestamp = new Date().toLocaleString('pt-BR');

      const message =
        `🚨 EMERGÊNCIA SOS — SafetyDate\n\n` +
        `Preciso de ajuda urgente.\n\n` +
        `📍 Minha localização agora:\n${mapsUrl}\n\n` +
        `🕐 ${timestamp}\n` +
        (batteryLevel ? `🔋 Bateria: ${batteryLevel}%\n\n` : `\n`) +
        `Por favor, me ligue ou acione o 190.`;

      const isAvailable = await SMS.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert(
          'SMS indisponível',
          'Seu dispositivo não suporta SMS. Ligue direto para o 190.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Ligar 190',
              style: 'destructive',
              onPress: () => Linking.openURL('tel:190'),
            },
          ]
        );
        return;
      }

      const phoneNumbers = contacts.map((c) => c.phone);
      await SMS.sendSMSAsync(phoneNumbers, message);

      const activeSession = await getActiveSession();

      await recordSosAlert({
        sessionId: activeSession?.id,
        latitude,
        longitude,
        accuracy,
        message,
        contactsNotified: contacts.length,
      });

      onActivated?.();

      Alert.alert(
        '🚨 Alerta enviado',
        `SMS enviado para ${contacts.length} ${
          contacts.length === 1 ? 'contato' : 'contatos'
        }.\n\nDeseja também ligar para a polícia (190)?`,
        [
          { text: 'Não, estou bem', style: 'cancel' },
          {
            text: 'Ligar 190',
            style: 'destructive',
            onPress: () => Linking.openURL('tel:190'),
          },
        ]
      );
    } catch (error) {
      console.error('SOS error:', error);
      Alert.alert(
        'Erro ao enviar alerta',
        'Não foi possível enviar o SOS. Ligue diretamente para 190.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ligar 190', onPress: () => Linking.openURL('tel:190') },
        ]
      );
    } finally {
      setLoading(false);
      progress.setValue(0);
    }
  };

  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.container, style]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={loading}
        style={styles.button}
      >
        <Animated.View
          style={[
            styles.progressFill,
            {
              width: progressWidth,
            },
          ]}
        />
        <View style={styles.content}>
          <Text style={styles.icon}>🚨</Text>
          <Text style={styles.label}>
            {loading ? 'ENVIANDO ALERTA...' : 'SOS EMERGÊNCIA'}
          </Text>
          <Text style={styles.hint}>
            {pressing
              ? 'Continue pressionando...'
              : loading
              ? 'Aguarde'
              : 'Mantenha pressionado por 3s'}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  button: {
    height: 100,
    backgroundColor: '#DC2626',
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#7F1D1D',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  icon: {
    fontSize: 28,
    marginBottom: 2,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  hint: {
    color: '#FEE2E2',
    fontSize: 11,
    marginTop: 4,
    fontWeight: '500',
  },
});
