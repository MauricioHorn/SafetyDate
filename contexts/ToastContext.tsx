import React, {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import { Toast, type ToastType } from '@/components/Toast';

const FADE_MS = 220;
const DEFAULT_DURATION_MS = 2500;

type ShowToastFn = (message: string, type?: ToastType, durationMs?: number) => void;

const ToastContext = createContext<ShowToastFn | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>('success');
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const isVisibleRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    animationRef.current?.stop();
  }, []);

  const scheduleHide = useCallback(
    (durationMs: number) => {
      hideTimeoutRef.current = setTimeout(() => {
        animationRef.current = Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          useNativeDriver: true,
        });
        animationRef.current.start(() => {
          isVisibleRef.current = false;
          setMessage(null);
        });
      }, durationMs);
    },
    [opacity]
  );

  const showToast = useCallback(
    (msg: string, toastType: ToastType = 'success', durationMs = DEFAULT_DURATION_MS) => {
      clearTimers();

      const replacing = isVisibleRef.current;
      setMessage(msg);
      setType(toastType);

      if (replacing) {
        opacity.setValue(1);
        scheduleHide(durationMs);
        return;
      }

      opacity.setValue(0);
      animationRef.current = Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        useNativeDriver: true,
      });
      animationRef.current.start(() => {
        isVisibleRef.current = true;
        scheduleHide(durationMs);
      });
    },
    [clearTimers, opacity, scheduleHide]
  );

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <View style={styles.overlay} pointerEvents="none">
        {message && <Toast message={message} type={type} opacity={opacity} />}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const showToast = useContext(ToastContext);
  if (!showToast) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return { showToast };
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
});
