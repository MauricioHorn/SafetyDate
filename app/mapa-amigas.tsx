import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Stack, useFocusEffect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { LiveFriend, getLiveFriends } from '../lib/location-share';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}

export default function MapaAmigasScreen() {
  const [friends, setFriends] = useState<LiveFriend[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapView | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getLiveFriends();
      setFriends(data);
      // centraliza no primeiro, se houver
      if (data.length > 0 && mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: data[0].latitude,
          longitude: data[0].longitude,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }, 500);
      }
    } catch {
      // silencioso
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen
        options={{
          title: 'Amigas no mapa',
          headerStyle: { backgroundColor: '#0A0A14' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={{
          latitude: -23.5505,
          longitude: -46.6333,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
        showsUserLocation
      >
        {friends.map((f) => (
          <Marker
            key={f.friend_id}
            coordinate={{ latitude: f.latitude, longitude: f.longitude }}
            title={f.full_name || 'Amiga'}
            description={`${timeAgo(f.last_update)}${f.battery_level != null ? ` · ${f.battery_level}%` : ''}`}
            pinColor="#FF4D7E"
          />
        ))}
      </MapView>

      {/* Painel inferior flutuante */}
      <View style={styles.panel}>
        <View style={styles.grabber} />
        {loading ? (
          <View style={styles.panelContent}>
            <ActivityIndicator size="small" color="#FF4D7E" />
          </View>
        ) : friends.length === 0 ? (
          <View style={styles.panelContent}>
            <View style={styles.emptyIconWrap}>
              <Ionicons name="location-outline" size={26} color="#FF4D7E" />
            </View>
            <Text style={styles.emptyTitle}>Nenhuma amiga ao vivo</Text>
            <Text style={styles.emptySub}>
              Elas aparecem aqui quando ativam a localização ao vivo
            </Text>
            <TouchableOpacity style={styles.refreshGhost} onPress={load}>
              <Ionicons name="refresh" size={16} color="#FFFFFF" />
              <Text style={styles.refreshGhostText}>Atualizar</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.panelHeaderRow}>
            <View style={styles.liveDotRow}>
              <View style={styles.liveDot} />
              <Text style={styles.countText}>
                {friends.length} {friends.length === 1 ? 'amiga ao vivo' : 'amigas ao vivo'}
              </Text>
            </View>
            <TouchableOpacity style={styles.refreshIcon} onPress={load}>
              <Ionicons name="refresh" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A14' },
  map: { flex: 1 },
  panel: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    backgroundColor: '#151525',
    borderRadius: 22,
    paddingTop: 8,
    paddingBottom: 14,
    paddingHorizontal: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3A3A52',
    marginBottom: 10,
  },
  panelContent: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  emptyIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,77,126,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  emptySub: {
    color: '#7A7A94',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  refreshGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF4D7E',
    paddingHorizontal: 22,
    paddingVertical: 9,
    borderRadius: 12,
  },
  refreshGhostText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  panelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#3DD68C',
  },
  countText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  refreshIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1E1E35',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
