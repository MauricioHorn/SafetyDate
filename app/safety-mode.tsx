import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';
import * as SMS from 'expo-sms';
import { Ionicons } from '@expo/vector-icons';
import {
  SafePlace,
  SafetySession,
  EmergencyContact,
  getSafePlaces,
  getEmergencyContacts,
  getActiveSession,
  startSafetySession,
  updateSessionLocation,
  endSafetySession,
  createSessionViews,
  checkArrivalAtSafePlace,
} from '../lib/safety';
import {
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from '../lib/background-location';

type Mode = 'idle' | 'starting' | 'active';

export default function SafetyModeScreen() {
  const [mode, setMode] = useState<Mode>('idle');
  const [loading, setLoading] = useState(true);
  const [safePlaces, setSafePlaces] = useState<SafePlace[]>([]);
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [activeSession, setActiveSession] = useState<SafetySession | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);
  const [isBackgroundPermissionGranted, setIsBackgroundPermissionGranted] = useState(false);
  const [isBackgroundTrackingRunning, setIsBackgroundTrackingRunning] = useState(false);
  const locationWatcher = useRef<Location.LocationSubscription | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [places, cts, session] = await Promise.all([
        getSafePlaces(),
        getEmergencyContacts(),
        getActiveSession(),
      ]);
      setSafePlaces(places);
      setContacts(cts);
      setActiveSession(session);
      setMode(session ? 'active' : 'idle');

      if (cts.length > 0 && selectedContacts.length === 0) {
        setSelectedContacts(cts.map((c) => c.id));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [selectedContacts.length]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setCurrentLocation(loc);
      }
    })();
  }, []);

  useEffect(() => {
    if (mode === 'active' && activeSession) {
      startWatchingLocation(activeSession);
    }

    return () => {
      locationWatcher.current?.remove();
      locationWatcher.current = null;
    };
  }, [mode, activeSession?.id]);

  const askLocationPermissionsForSafetyMode = async (): Promise<{
    foregroundGranted: boolean;
    backgroundGranted: boolean;
  }> => {
    // iOS exige foreground antes de solicitar background.
    const foreground = await Location.requestForegroundPermissionsAsync();
    const foregroundGranted = foreground.status === 'granted';

    if (!foregroundGranted) {
      Alert.alert(
        'Permissão de localização necessária',
        'Precisamos da sua localização para ativar o Modo Seguro.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
        ]
      );
      return { foregroundGranted: false, backgroundGranted: false };
    }

    const background = await Location.requestBackgroundPermissionsAsync();
    const backgroundGranted = background.status === 'granted';

    if (!backgroundGranted) {
      Alert.alert(
        'Modo limitado sem localização em background',
        'Sem permissão "Sempre", sua localização só atualiza com o app aberto. Você pode continuar assim ou abrir Ajustes.',
        [
          { text: 'Continuar limitado', style: 'default' },
          { text: 'Abrir Ajustes', onPress: () => Linking.openSettings() },
        ]
      );
    }

    return { foregroundGranted: true, backgroundGranted };
  };

  const startWatchingLocation = async (session: SafetySession) => {
    locationWatcher.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60000,
        distanceInterval: 50,
      },
      async (loc) => {
        setCurrentLocation(loc);

        let battery: number | undefined;
        try {
          battery = Math.round((await Battery.getBatteryLevelAsync()) * 100);
        } catch {}

        await updateSessionLocation(session.id, {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy || undefined,
          battery,
        });

        const arrivedPlace = checkArrivalAtSafePlace(
          loc.coords.latitude,
          loc.coords.longitude,
          safePlaces
        );

        if (arrivedPlace) {
          await endSafetySession(session.id, 'arrived_safe_place', arrivedPlace.id);
          await stopBackgroundLocationUpdates().catch((error) => {
            console.error('[safety-mode] failed to stop background updates on arrival:', error);
          });
          setIsBackgroundTrackingRunning(false);
          Alert.alert(
            `Bem-vinda${arrivedPlace.name === 'Casa' ? ' em casa' : ''}! 🏠`,
            `Safety Mode encerrado automaticamente. Seus contatos foram avisados que você chegou.`
          );
          setMode('idle');
          setActiveSession(null);
          locationWatcher.current?.remove();
        }
      }
    );
  };

  const handleStart = async () => {
    if (selectedContacts.length === 0) {
      Alert.alert('Selecione contatos', 'Escolha pelo menos 1 pessoa pra te acompanhar.');
      return;
    }

    if (safePlaces.length === 0) {
      Alert.alert(
        'Cadastre um local seguro',
        'Antes de ativar o Safety Mode, cadastre sua casa ou outro lugar seguro. Assim o app sabe quando encerrar.',
        [
          { text: 'Depois', style: 'cancel' },
          { text: 'Cadastrar', onPress: () => router.push('/safe-places') },
        ]
      );
      return;
    }

    try {
      setMode('starting');

      const permissions = await askLocationPermissionsForSafetyMode();
      if (!permissions.foregroundGranted) {
        setMode('idle');
        return;
      }
      setIsBackgroundPermissionGranted(permissions.backgroundGranted);

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      let battery: number | undefined;
      try {
        battery = Math.round((await Battery.getBatteryLevelAsync()) * 100);
      } catch {}

      const session = await startSafetySession({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        batteryLevel: battery,
      });

      if (permissions.backgroundGranted) {
        try {
          await startBackgroundLocationUpdates(session.id);
          setIsBackgroundTrackingRunning(true);
        } catch (bgError) {
          console.error('[safety-mode] failed to start background updates:', bgError);
          setIsBackgroundTrackingRunning(false);
          Alert.alert(
            'Background não iniciou',
            'Não conseguimos iniciar rastreamento em background. O modo seguirá limitado ao app aberto.'
          );
        }
      } else {
        setIsBackgroundTrackingRunning(false);
      }

      const selectedContactObjs = contacts.filter((c) => selectedContacts.includes(c.id));
      const views = await createSessionViews(session.id, selectedContactObjs);

      const isAvailable = await SMS.isAvailableAsync();
      if (isAvailable) {
        for (const view of views) {
          const message =
            `🛡️ ELAS\n\n` +
            `Estou ativando o Safety Mode. Você pode me acompanhar em tempo real aqui:\n\n` +
            `${view.url}\n\n` +
            `O link expira quando eu chegar em um lugar seguro.\n\n` +
            `Se algo der errado, vou apertar o botão SOS.`;

          await SMS.sendSMSAsync([view.contact.phone], message);
        }
      }

      setActiveSession(session);
      setMode('active');
    } catch (error: any) {
      console.error(error);
      await stopBackgroundLocationUpdates().catch((cleanupError) => {
        console.error('[safety-mode] cleanup failed after start error:', cleanupError);
      });
      setIsBackgroundTrackingRunning(false);
      Alert.alert('Erro', error.message || 'Não foi possível ativar.');
      setMode('idle');
    }
  };

  const handleEnd = () => {
    if (!activeSession) return;

    Alert.alert(
      'Encerrar Safety Mode?',
      'Suas amigas deixarão de ver sua localização.',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Encerrar',
          style: 'destructive',
          onPress: async () => {
            try {
              await endSafetySession(activeSession.id, 'manual');
              await stopBackgroundLocationUpdates().catch((error) => {
                console.error('[safety-mode] failed to stop background updates:', error);
              });
              setIsBackgroundTrackingRunning(false);
              setActiveSession(null);
              setMode('idle');
              locationWatcher.current?.remove();
            } catch {
              Alert.alert('Erro', 'Não foi possível encerrar.');
            }
          },
        },
      ]
    );
  };

  const toggleContact = (id: string) => {
    setSelectedContacts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF4D7E" />
      </View>
    );
  }

  const region = currentLocation
    ? {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : {
        latitude: -23.533,
        longitude: -46.625,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Safety Mode',
          headerStyle: { backgroundColor: '#0A0A14' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          region={region}
          showsUserLocation
          showsMyLocationButton
        >
          {safePlaces.map((place) => (
            <React.Fragment key={place.id}>
              <Marker
                coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                title={place.name}
              >
                <Text style={styles.placeMarker}>{place.icon_emoji}</Text>
              </Marker>
              <Circle
                center={{ latitude: place.latitude, longitude: place.longitude }}
                radius={place.radius_meters}
                strokeColor="rgba(16, 185, 129, 0.8)"
                fillColor="rgba(16, 185, 129, 0.15)"
                strokeWidth={2}
              />
            </React.Fragment>
          ))}
        </MapView>

        {mode === 'active' && (
          <View style={styles.activeBadge}>
            <View style={styles.pulseDot} />
            <Text style={styles.activeBadgeText}>Safety Mode ATIVO</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        {mode === 'idle' && (
          <>
            <Text style={styles.sectionTitle}>Quem vai te acompanhar?</Text>
            {contacts.length === 0 ? (
              <TouchableOpacity
                style={styles.addFirstBtn}
                onPress={() => router.push('/emergency-contacts')}
              >
                <Ionicons name="add-circle" size={20} color="#FF4D7E" />
                <Text style={styles.addFirstText}>Cadastre seu primeiro contato</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.contactsList}>
                {contacts.map((c) => {
                  const selected = selectedContacts.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.contactChip, selected && styles.contactChipSelected]}
                      onPress={() => toggleContact(c.id)}
                    >
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={20}
                        color={selected ? '#FF4D7E' : '#7A7A94'}
                      />
                      <Text style={[styles.contactChipText, selected && styles.contactChipTextSelected]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Encerrar ao chegar em:</Text>
            {safePlaces.length === 0 ? (
              <TouchableOpacity
                style={styles.addFirstBtn}
                onPress={() => router.push('/safe-places')}
              >
                <Ionicons name="add-circle" size={20} color="#FF4D7E" />
                <Text style={styles.addFirstText}>Cadastre sua casa ou local seguro</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.placesList}>
                {safePlaces.map((p) => (
                  <View key={p.id} style={styles.placeChip}>
                    <Text style={styles.placeEmoji}>{p.icon_emoji}</Text>
                    <Text style={styles.placeChipText}>{p.name}</Text>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.startBtn,
                (contacts.length === 0 || safePlaces.length === 0) && styles.startBtnDisabled,
              ]}
              onPress={handleStart}
              disabled={contacts.length === 0 || safePlaces.length === 0}
            >
              <Text style={styles.startBtnText}>🛡️ Ativar Safety Mode</Text>
            </TouchableOpacity>
          </>
        )}

        {mode === 'starting' && (
          <View style={styles.startingState}>
            <ActivityIndicator size="large" color="#FF4D7E" />
            <Text style={styles.startingText}>Ativando Safety Mode...</Text>
            <Text style={styles.startingSubtext}>Enviando links para seus contatos</Text>
          </View>
        )}

        {mode === 'active' && activeSession && (
          <>
            <View style={styles.activeCard}>
              <Text style={styles.activeTitle}>🛡️ Compartilhando localização</Text>
              <Text style={styles.activeSubtitle}>
                {selectedContacts.length}{' '}
                {selectedContacts.length === 1 ? 'pessoa está' : 'pessoas estão'} te acompanhando
              </Text>
            </View>

            <View
              style={[
                styles.trackingStatusCard,
                isBackgroundTrackingRunning ? styles.trackingStatusOk : styles.trackingStatusLimited,
              ]}
            >
              <Text style={styles.trackingStatusTitle}>
                {isBackgroundTrackingRunning
                  ? 'Localização ativa em background'
                  : 'Modo limitado: localização só com app aberto'}
              </Text>
              {!isBackgroundPermissionGranted && (
                <TouchableOpacity onPress={() => Linking.openSettings()}>
                  <Text style={styles.trackingStatusLink}>Abrir Ajustes</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity style={styles.endBtn} onPress={handleEnd}>
              <Text style={styles.endBtnText}>Encerrar Safety Mode</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A14' },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0A0A14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapContainer: { height: 300, position: 'relative' },
  map: { flex: 1 },
  placeMarker: { fontSize: 28 },
  activeBadge: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#10B981',
    borderRadius: 999,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
  activeBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  controls: { flex: 1 },
  controlsContent: { padding: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  contactsList: { gap: 8, marginBottom: 8 },
  contactChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#151525',
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  contactChipSelected: {
    borderColor: '#FF4D7E',
    backgroundColor: 'rgba(255, 77, 126, 0.1)',
  },
  contactChipText: {
    fontSize: 15,
    color: '#B4B4C7',
    fontWeight: '500',
  },
  contactChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  placesList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#151525',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  placeEmoji: { fontSize: 16 },
  placeChipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  addFirstBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF4D7E',
    borderStyle: 'dashed',
    marginBottom: 8,
  },
  addFirstText: { color: '#FF4D7E', fontWeight: '600', fontSize: 14 },
  startBtn: {
    backgroundColor: '#10B981',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  startBtnDisabled: { opacity: 0.4 },
  startBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  startingState: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  startingText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  startingSubtext: { color: '#B4B4C7', fontSize: 13 },
  activeCard: {
    backgroundColor: '#10B981',
    padding: 18,
    borderRadius: 16,
    marginBottom: 16,
  },
  activeTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  activeSubtitle: { color: '#D1FAE5', fontSize: 13 },
  trackingStatusCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  trackingStatusOk: {
    backgroundColor: 'rgba(255, 77, 126, 0.15)',
    borderColor: '#FF4D7E',
  },
  trackingStatusLimited: {
    backgroundColor: 'rgba(252, 211, 77, 0.15)',
    borderColor: '#FCD34D',
  },
  trackingStatusTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  trackingStatusLink: {
    color: '#A78BFA',
    marginTop: 6,
    fontSize: 12,
    fontWeight: '600',
  },
  endBtn: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
    alignItems: 'center',
  },
  endBtnText: { color: '#EF4444', fontSize: 15, fontWeight: '700' },
});
