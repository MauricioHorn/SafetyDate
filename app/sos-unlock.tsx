import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { triggerSOS } from '@/lib/safety';

const PANIC_CODE_KEY = 'elas_panic_code';

const MIN_CODE_LENGTH = 4;
const MAX_CODE_LENGTH = 6;

type Phase = 'lock' | 'decoy';

function formatClock(date: Date) {
  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function formatDate(date: Date) {
  return date.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

async function getStoredPanicCode(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PANIC_CODE_KEY);
  } catch {
    return null;
  }
}

const KEY_LETTERS: Record<string, string> = {
  '2': 'ABC',
  '3': 'DEF',
  '4': 'GHI',
  '5': 'JKL',
  '6': 'MNO',
  '7': 'PQRS',
  '8': 'TUV',
  '9': 'WXYZ',
};

function PinDots({ length, filled }: { length: number; filled: number }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length }).map((_, i) => (
        <View
          key={i}
          style={[styles.dot, i < filled && styles.dotFilled]}
        />
      ))}
    </View>
  );
}

function NumericKeypad({
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
    <View style={styles.keypad}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.keypadRow}>
          {row.map((key) => {
            if (key === '') {
              return <View key="spacer" style={styles.keyEmpty} />;
            }
            if (key === 'back') {
              return (
                <Pressable
                  key="back"
                  onPress={onBackspace}
                  style={({ pressed }) => [
                    styles.key,
                    pressed && styles.keyPressed,
                  ]}
                  accessibilityLabel="Apagar"
                >
                  <Ionicons name="backspace-outline" size={28} color="#fff" />
                </Pressable>
              );
            }
            const letters = KEY_LETTERS[key];
            return (
              <Pressable
                key={key}
                onPress={() => onDigit(key)}
                style={({ pressed }) => [
                  styles.key,
                  pressed && styles.keyPressed,
                ]}
              >
                <View style={styles.keyContent}>
                  <Text style={styles.keyText}>{key}</Text>
                  {letters ? (
                    <Text style={styles.keyLetter}>{letters}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function DecoyHome() {
  return (
    <SafeAreaView style={styles.decoyContainer} edges={['top', 'bottom']}>
      <View style={styles.decoyHeader}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => pressed && { opacity: 0.6 }}
        >
          <Ionicons name="chevron-back" size={24} color="#1c1c1e" />
        </Pressable>
        <Text style={styles.decoyTitle}>Notas</Text>
        <View style={{ width: 24 }} />
      </View>
      <View style={styles.decoyBody}>
        <Text style={styles.decoyNoteTitle}>Lista de compras</Text>
        <Text style={styles.decoyNoteLine}>• Leite</Text>
        <Text style={styles.decoyNoteLine}>• Pão</Text>
        <Text style={styles.decoyNoteLine}>• Café</Text>
        <Text style={[styles.decoyNoteLine, { marginTop: 16, color: '#8e8e93' }]}>
          Última edição: hoje
        </Text>
      </View>
    </SafeAreaView>
  );
}

export default function SosUnlockScreen() {
  const [phase, setPhase] = useState<Phase>('lock');
  const [now, setNow] = useState(() => new Date());
  const [pin, setPin] = useState('');
  const [codeLength, setCodeLength] = useState(MAX_CODE_LENGTH);
  const [storedCode, setStoredCode] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    void (async () => {
      const code = await getStoredPanicCode();
      setStoredCode(code);
      if (code) {
        setCodeLength(
          Math.min(MAX_CODE_LENGTH, Math.max(MIN_CODE_LENGTH, code.length))
        );
      }
    })();
  }, []);

  const goToDecoy = useCallback(() => {
    setPin('');
    setPhase('decoy');
  }, []);

  const evaluatePin = useCallback(
    async (entered: string) => {
      if (processing) return;
      setProcessing(true);

      const isPanicMatch =
        storedCode !== null &&
        storedCode.length >= MIN_CODE_LENGTH &&
        entered === storedCode;

      if (isPanicMatch) {
        void triggerSOS().catch(() => null);
      }

      goToDecoy();
      setProcessing(false);
    },
    [storedCode, processing, goToDecoy]
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (processing || pin.length >= codeLength) return;
      const next = pin + digit;
      setPin(next);
      if (next.length === codeLength) {
        void evaluatePin(next);
      }
    },
    [pin, codeLength, processing, evaluatePin]
  );

  const handleBackspace = useCallback(() => {
    if (processing) return;
    setPin((p) => p.slice(0, -1));
  }, [processing]);

  const dateLabel = useMemo(() => {
    const d = formatDate(now);
    return d.charAt(0).toUpperCase() + d.slice(1);
  }, [now]);

  if (phase === 'decoy') {
    return <DecoyHome />;
  }

  return (
    <View style={styles.lockScreen}>
      <SafeAreaView style={styles.lockSafe} edges={['top', 'bottom']}>
        <Pressable
          onPress={() => router.back()}
          style={styles.lockDismiss}
          hitSlop={16}
        />

        <View style={styles.clockBlock}>
          <Text style={styles.clockTime}>{formatClock(now)}</Text>
          <Text style={styles.clockDate}>{dateLabel}</Text>
        </View>

        <View style={styles.pinBlock}>
          <Text style={styles.pinLabel}>Digite a senha</Text>
          <PinDots length={codeLength} filled={pin.length} />
        </View>

        <NumericKeypad onDigit={handleDigit} onBackspace={handleBackspace} />

        {Platform.OS === 'ios' && (
          <Text style={styles.footerEmergency}>Emergência</Text>
        )}
      </SafeAreaView>
    </View>
  );
}

const LOCK_BG = '#000000';
const KEY_BG = 'rgba(255,255,255,0.12)';

const styles = StyleSheet.create({
  lockScreen: {
    flex: 1,
    backgroundColor: LOCK_BG,
  },
  lockSafe: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  lockDismiss: {
    position: 'absolute',
    top: 56,
    left: 20,
    width: 40,
    height: 40,
    zIndex: 1,
  },
  clockBlock: {
    alignItems: 'center',
    paddingTop: 72,
  },
  clockTime: {
    fontSize: 82,
    fontWeight: '200',
    color: '#ffffff',
    letterSpacing: -2,
  },
  clockDate: {
    marginTop: 4,
    fontSize: 20,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.85)',
  },
  pinBlock: {
    alignItems: 'center',
    gap: 20,
  },
  pinLabel: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 18,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: '#ffffff',
    borderColor: '#ffffff',
  },
  keypad: {
    alignSelf: 'center',
    width: '85%',
    paddingHorizontal: 24,
    gap: 18,
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
    backgroundColor: KEY_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyEmpty: {
    flex: 1,
    aspectRatio: 1,
  },
  keyPressed: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  keyContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: {
    fontSize: 36,
    fontWeight: '300',
    color: '#ffffff',
  },
  keyLetter: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  footerEmergency: {
    alignSelf: 'flex-start',
    paddingLeft: 28,
    fontSize: 15,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.85)',
  },
  decoyContainer: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  decoyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#c6c6c8',
    backgroundColor: '#f9f9f9',
  },
  decoyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1c1c1e',
  },
  decoyBody: {
    flex: 1,
    padding: 20,
  },
  decoyNoteTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1c1c1e',
    marginBottom: 16,
  },
  decoyNoteLine: {
    fontSize: 17,
    color: '#3a3a3c',
    lineHeight: 26,
  },
});
