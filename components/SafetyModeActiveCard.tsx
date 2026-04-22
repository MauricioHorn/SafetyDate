import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { SafetySession, endSafetySession } from '../lib/safety';

interface Props {
  session: SafetySession;
  onEnded?: () => void;
}

export function SafetyModeActiveCard({ session, onEnded }: Props) {
  const [elapsed, setElapsed] = useState('0 min');

  useEffect(() => {
    const updateElapsed = () => {
      const started = new Date(session.started_at).getTime();
      const now = Date.now();
      const diffMin = Math.floor((now - started) / 60000);

      if (diffMin < 60) {
        setElapsed(`${diffMin} min`);
      } else {
        const hours = Math.floor(diffMin / 60);
        const mins = diffMin % 60;
        setElapsed(`${hours}h ${mins}min`);
      }
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 30000);
    return () => clearInterval(interval);
  }, [session.started_at]);

  const handleEnd = () => {
    Alert.alert(
      'Encerrar Safety Mode?',
      'Suas amigas deixarão de ver sua localização. Tem certeza?',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await endSafetySession(session.id, 'manual');
              onEnded?.();
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível encerrar.');
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push('/safety-mode')}
      activeOpacity={0.9}
    >
      <View style={styles.pulseDot} />
      <View style={styles.content}>
        <Text style={styles.title}>🛡️ Safety Mode ATIVO</Text>
        <Text style={styles.subtitle}>
          Suas amigas estão acompanhando há {elapsed}
        </Text>
      </View>
      <TouchableOpacity style={styles.endBtn} onPress={handleEnd}>
        <Text style={styles.endBtnText}>Encerrar</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    marginRight: 12,
  },
  content: { flex: 1 },
  title: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#D1FAE5',
    fontSize: 12,
    marginTop: 2,
  },
  endBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
  },
  endBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
