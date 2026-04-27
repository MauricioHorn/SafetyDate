import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const BACKGROUND_LOCATION_TASK_NAME = 'ELAS_BACKGROUND_LOCATION_TASK';
const SAFETY_SESSION_ID_STORAGE_KEY = '@safety_mode/session_id';
// Expected battery impact with balanced config: ~3-5% per hour while active.

type BackgroundLocationTaskData = {
  locations?: Location.LocationObject[];
};

type UpsertSessionLocationPayload = {
  id: string;
  current_latitude: number;
  current_longitude: number;
  current_accuracy_meters: number | null;
  battery_level: number | null;
  last_location_update: string;
};

type UpsertRetryOptions = {
  maxAttempts: number;
  timeoutMs: number;
  retryDelayMs: number;
};

const DEFAULT_UPSERT_RETRY_OPTIONS: UpsertRetryOptions = {
  maxAttempts: 2,
  timeoutMs: 30000,
  retryDelayMs: 1500,
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

async function getCurrentSessionId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(SAFETY_SESSION_ID_STORAGE_KEY);
  } catch (error) {
    console.error('[bg-location] failed to read session id:', error);
    return null;
  }
}

async function getBatteryLevelPercentage(): Promise<number | null> {
  try {
    const battery = await Battery.getBatteryLevelAsync();
    return Math.round(battery * 100);
  } catch (error) {
    console.error('[bg-location] failed to read battery level:', error);
    return null;
  }
}

async function upsertSessionLocationWithRetry(
  payload: UpsertSessionLocationPayload,
  options: UpsertRetryOptions = DEFAULT_UPSERT_RETRY_OPTIONS
): Promise<void> {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < options.maxAttempts) {
    attempt += 1;

    try {
      const upsertPromise = supabase
        .from('safety_sessions')
        .upsert(payload, { onConflict: 'id' });

      const { error } = await withTimeout(upsertPromise, options.timeoutMs);

      if (error) {
        throw error;
      }

      console.log(`[bg-location] upsert success (attempt ${attempt})`);
      return;
    } catch (error) {
      lastError = error;
      console.error(`[bg-location] upsert failed (attempt ${attempt}):`, error);

      if (attempt < options.maxAttempts) {
        await delay(options.retryDelayMs);
      }
    }
  }

  console.error('[bg-location] giving up after retries:', lastError);
}

export async function handleLocationUpdate(
  locations: Location.LocationObject[] | null | undefined
): Promise<void> {
  if (!locations || locations.length === 0) {
    console.log('[bg-location] no locations received');
    return;
  }

  const latest = locations[locations.length - 1];
  if (!latest?.coords) {
    console.log('[bg-location] invalid location payload');
    return;
  }

  const sessionId = await getCurrentSessionId();
  if (!sessionId) {
    console.log('[bg-location] no active session id in storage, skipping');
    return;
  }

  const batteryLevel = await getBatteryLevelPercentage();

  const payload: UpsertSessionLocationPayload = {
    id: sessionId,
    current_latitude: latest.coords.latitude,
    current_longitude: latest.coords.longitude,
    current_accuracy_meters:
      typeof latest.coords.accuracy === 'number' ? latest.coords.accuracy : null,
    battery_level: batteryLevel,
    last_location_update: new Date().toISOString(),
  };

  console.log('[bg-location] processing update:', {
    sessionId,
    lat: payload.current_latitude,
    lng: payload.current_longitude,
    accuracy: payload.current_accuracy_meters,
    battery: payload.battery_level,
  });

  await upsertSessionLocationWithRetry(payload);
}

/**
 * IMPORTANT: defineTask must be at module root.
 * This ensures Expo can load and run it in background.
 */
if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK_NAME)) {
  TaskManager.defineTask(
    BACKGROUND_LOCATION_TASK_NAME,
    async ({ data, error }: TaskManager.TaskManagerTaskBody<BackgroundLocationTaskData>) => {
      if (error) {
        console.error('[bg-location] task error:', error);
        return;
      }

      try {
        await handleLocationUpdate(data?.locations);
      } catch (taskError) {
        console.error('[bg-location] unhandled task error:', taskError);
      }
    }
  );
}

export async function registerBackgroundLocationTask(): Promise<void> {
  // task is defined at module load; this function exists for explicit bootstrap calls
  const defined = TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK_NAME);
  console.log('[bg-location] task defined:', defined);
}

export async function startBackgroundLocationUpdates(sessionId: string): Promise<void> {
  if (!sessionId) {
    throw new Error('sessionId is required to start background tracking');
  }

  await AsyncStorage.setItem(SAFETY_SESSION_ID_STORAGE_KEY, sessionId);

  const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
  if (isStarted) {
    console.log('[bg-location] updates already started');
    return;
  }

  await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,
    timeInterval: 60000,
    deferredUpdatesInterval: 60000,
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Modo Seguro ativo',
      notificationBody: 'Modo Seguro ativo — suas amigas estão te acompanhando',
      notificationColor: '#FF4D7E',
    },
  });

  console.log('[bg-location] background location updates started');
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  const isStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);

  if (isStarted) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
    console.log('[bg-location] background location updates stopped');
  } else {
    console.log('[bg-location] updates were not running');
  }

  await AsyncStorage.removeItem(SAFETY_SESSION_ID_STORAGE_KEY);
}

export {
  BACKGROUND_LOCATION_TASK_NAME,
  SAFETY_SESSION_ID_STORAGE_KEY,
};
