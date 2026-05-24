import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  Vibration,
  Image,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Audio } from 'expo-av';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// TODO: adicionar arquivo de áudio real de voz em assets/fake-call-voice.mp3
// const FAKE_CALL_VOICE = require('@/assets/fake-call-voice.mp3');

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDER_TRACK_WIDTH = SCREEN_WIDTH - 48;
const SLIDER_THUMB_SIZE = 58;
const SLIDER_MAX_DRAG = SLIDER_TRACK_WIDTH - SLIDER_THUMB_SIZE - 8;

const IOS_GREEN = '#34C759';
const IOS_RED = '#FF3B30';
const IOS_MUTED = 'rgba(255,255,255,0.55)';

type CallPhase = 'ringing' | 'in_call';

function formatCallDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function callerInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function FakeCallIncomingScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    callerName?: string;
    photoUri?: string;
    audioOn?: string;
  }>();

  const callerName = (params.callerName || 'Desconhecido').trim();
  const photoUri = params.photoUri?.trim() || '';
  const audioOn = params.audioOn === '1';

  const [phase, setPhase] = useState<CallPhase>('ringing');
  const [callSeconds, setCallSeconds] = useState(0);
  const phaseRef = useRef<CallPhase>('ringing');
  phaseRef.current = phase;

  const ringSoundRef = useRef<Audio.Sound | null>(null);
  const voiceSoundRef = useRef<Audio.Sound | null>(null);
  const dragX = useRef(new Animated.Value(0)).current;
  const arrowOpacity = useRef(new Animated.Value(0.35)).current;
  const answeredRef = useRef(false);

  const stopRinging = useCallback(async () => {
    Vibration.cancel();
    if (ringSoundRef.current) {
      try {
        await ringSoundRef.current.stopAsync();
        await ringSoundRef.current.unloadAsync();
      } catch {
        /* ignore */
      }
      ringSoundRef.current = null;
    }
  }, []);

  const stopVoice = useCallback(async () => {
    if (voiceSoundRef.current) {
      try {
        await voiceSoundRef.current.stopAsync();
        await voiceSoundRef.current.unloadAsync();
      } catch {
        /* ignore */
      }
      voiceSoundRef.current = null;
    }
  }, []);

  const endCall = useCallback(async () => {
    await stopRinging();
    await stopVoice();
    router.replace('/(tabs)');
  }, [stopRinging, stopVoice]);

  const handleAnswer = useCallback(async () => {
    if (answeredRef.current) return;
    answeredRef.current = true;
    await stopRinging();
    setPhase('in_call');

    if (audioOn) {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        // Placeholder: substituir por require('@/assets/fake-call-voice.mp3') quando o arquivo existir
        const { sound } = await Audio.Sound.createAsync(
          {
            uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
          },
          { shouldPlay: true, isLooping: true, volume: 0.35 }
        );
        voiceSoundRef.current = sound;
      } catch (e) {
        console.warn('[fake-call] voice audio failed:', e);
      }
    }
  }, [audioOn, stopRinging]);

  const handleDecline = useCallback(() => {
    void endCall();
  }, [endCall]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(arrowOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(arrowOpacity, {
          toValue: 0.35,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [arrowOpacity]);

  useEffect(() => {
    if (phase !== 'ringing') return;

    const pattern = [0, 800, 400, 800];
    Vibration.vibrate(pattern, true);

    let mounted = true;
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        const { sound } = await Audio.Sound.createAsync(
          {
            uri: 'https://actions.google.com/sounds/v1/alarms/phone_alerts_and_rings.ogg',
          },
          { isLooping: true, volume: 1 }
        );
        if (!mounted) {
          await sound.unloadAsync();
          return;
        }
        ringSoundRef.current = sound;
        await sound.playAsync();
      } catch (e) {
        console.warn('[fake-call] ringtone failed:', e);
      }
    })();

    return () => {
      mounted = false;
      void stopRinging();
    };
  }, [phase, stopRinging]);

  useEffect(() => {
    if (phase !== 'in_call') return;
    const id = setInterval(() => setCallSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  useEffect(() => {
    return () => {
      void stopRinging();
      void stopVoice();
    };
  }, [stopRinging, stopVoice]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => phaseRef.current === 'ringing',
      onMoveShouldSetPanResponder: () => phaseRef.current === 'ringing',
      onPanResponderMove: (_, gesture) => {
        const x = Math.max(0, Math.min(gesture.dx, SLIDER_MAX_DRAG));
        dragX.setValue(x);
      },
      onPanResponderRelease: (_, gesture) => {
        const current = Math.max(0, Math.min(gesture.dx, SLIDER_MAX_DRAG));
        if (current >= SLIDER_MAX_DRAG * 0.88) {
          Animated.timing(dragX, {
            toValue: SLIDER_MAX_DRAG,
            duration: 120,
            useNativeDriver: false,
          }).start(() => {
            void handleAnswer();
          });
        } else {
          Animated.spring(dragX, {
            toValue: 0,
            useNativeDriver: false,
            friction: 7,
          }).start();
        }
      },
    })
  ).current;

  const thumbTranslate = dragX.interpolate({
    inputRange: [0, SLIDER_MAX_DRAG],
    outputRange: [4, SLIDER_MAX_DRAG + 4],
    extrapolate: 'clamp',
  });

  const initials = callerInitials(callerName);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <BlurView intensity={90} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={[styles.overlay, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>

        <View style={styles.callerHeader}>
          <Text style={styles.callerName}>{callerName}</Text>
          <Text style={styles.callerSub}>
            {phase === 'ringing' ? 'celular' : formatCallDuration(callSeconds)}
          </Text>
        </View>

        <View style={styles.avatarWrap}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
        </View>

        {phase === 'ringing' ? (
          <View style={styles.bottomRinging}>
            <View style={styles.sliderTrack} {...panResponder.panHandlers}>
              <Animated.Text style={[styles.sliderHint, { opacity: arrowOpacity }]}>
                deslize para atender  ›››
              </Animated.Text>
              <Animated.View
                style={[
                  styles.sliderThumb,
                  { transform: [{ translateX: thumbTranslate }] },
                ]}
              >
                <Ionicons name="call" size={28} color="#fff" />
              </Animated.View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.declineBtn, pressed && { opacity: 0.85 }]}
              onPress={handleDecline}
              accessibilityLabel="Recusar chamada"
            >
              <Ionicons name="close" size={32} color="#fff" />
            </Pressable>
            <Text style={styles.declineLabel}>Recusar</Text>
          </View>
        ) : (
          <View style={styles.bottomInCall}>
            <View style={styles.controlsRow}>
              <DecorativeControl icon="mic-off" label="mudo" />
              <DecorativeControl icon="keypad" label="teclado" />
              <DecorativeControl icon="volume-high" label="viva-voz" />
            </View>

            <Pressable
              style={({ pressed }) => [styles.hangupBtn, pressed && { opacity: 0.9 }]}
              onPress={() => void endCall()}
              accessibilityLabel="Desligar"
            >
              <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
            <Text style={styles.hangupLabel}>desligar</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function DecorativeControl({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.controlItem}>
      <View style={styles.controlCircle}>
        <Ionicons name={icon} size={26} color="#fff" />
      </View>
      <Text style={styles.controlLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a12' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10,10,18,0.55)',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  callerHeader: { alignItems: 'center', paddingHorizontal: 24 },
  callerName: {
    fontSize: 34,
    fontWeight: '300',
    color: '#fff',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  callerSub: {
    marginTop: 6,
    fontSize: 17,
    fontWeight: '400',
    color: IOS_MUTED,
    letterSpacing: 0.2,
  },
  avatarWrap: { alignItems: 'center', marginTop: 8 },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
  },
  avatarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 42, fontWeight: '600', color: '#fff' },
  bottomRinging: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  sliderTrack: {
    width: SLIDER_TRACK_WIDTH,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 48,
  },
  sliderHint: {
    position: 'absolute',
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.75)',
    fontSize: 17,
    fontWeight: '400',
    letterSpacing: 0.3,
    paddingLeft: 72,
  },
  sliderThumb: {
    position: 'absolute',
    left: 0,
    width: SLIDER_THUMB_SIZE,
    height: SLIDER_THUMB_SIZE,
    borderRadius: SLIDER_THUMB_SIZE / 2,
    backgroundColor: IOS_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  declineBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: IOS_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineLabel: {
    marginTop: 8,
    color: IOS_MUTED,
    fontSize: 14,
  },
  bottomInCall: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 40,
    paddingHorizontal: 8,
  },
  controlItem: { alignItems: 'center', width: 88 },
  controlCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlLabel: {
    marginTop: 8,
    color: IOS_MUTED,
    fontSize: 12,
    textTransform: 'lowercase',
  },
  hangupBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: IOS_RED,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hangupLabel: {
    marginTop: 8,
    color: IOS_MUTED,
    fontSize: 14,
    marginBottom: 8,
  },
});
