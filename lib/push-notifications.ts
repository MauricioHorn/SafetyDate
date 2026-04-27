import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export async function registerForPushNotifications(): Promise<string | null> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    const currentPermissions = await Notifications.getPermissionsAsync();
    let finalStatus = currentPermissions.status;

    if (finalStatus !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermissions.status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId ??
      process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        expo_push_token: tokenResponse.data,
      },
      { onConflict: 'expo_push_token' }
    );

    if (error) throw error;
    return tokenResponse.data;
  } catch (error) {
    console.warn('[push] registerForPushNotifications failed:', error);
    return null;
  }
}
