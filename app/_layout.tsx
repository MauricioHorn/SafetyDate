import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { initRevenueCat, logoutRevenueCat } from '@/lib/revenuecat';
import { registerForPushNotifications } from '@/lib/push-notifications';
import { colors } from '@/lib/theme';
import { Session } from '@supabase/supabase-js';
import { useRouter, useSegments } from 'expo-router';

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  async function registerPushIfAuthenticated(nextSession: Session | null) {
    if (!nextSession?.user) return;
    await registerForPushNotifications();
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        initRevenueCat(session.user.id);
        void registerPushIfAuthenticated(session);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (event === 'SIGNED_IN' && session?.user) {
        initRevenueCat(session.user.id);
        void registerPushIfAuthenticated(session);
      } else if (event === 'SIGNED_OUT') {
        logoutRevenueCat();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!session && !inAuthGroup) {
      router.replace('/(auth)/welcome');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="sos-countdown" />
        <Stack.Screen name="sos-aftermath" />
        <Stack.Screen name="report/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
