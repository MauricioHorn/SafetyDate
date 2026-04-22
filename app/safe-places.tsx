import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import {
  SafePlace,
  getSafePlaces,
  addSafePlace,
  deleteSafePlace,
} from '../lib/safety';

const EMOJI_OPTIONS = ['🏠', '🏢', '👵', '🏋️', '☕', '🏫', '❤️', '📍'];

export default function SafePlacesScreen() {
  const [places, setPlaces] = useState<SafePlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('🏠');
  const [radius, setRadius] = useState(100);
  const [markerPos, setMarkerPos] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [currentLocation, setCurrentLocation] = useState<Location.LocationObject | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSafePlaces();
      setPlaces(data);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar os locais.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const openAddModal = () => {
    setName('');
    setEmoji('🏠');
    setRadius(100);
    if (currentLocation) {
      setMarkerPos({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('Atenção', 'Dê um nome ao local.');
      return;
    }
    if (!markerPos) {
      Alert.alert('Atenção', 'Toque no mapa para marcar o local.');
      return;
    }

    try {
      setSaving(true);
      await addSafePlace({
        name: name.trim(),
        icon_emoji: emoji,
        latitude: markerPos.latitude,
        longitude: markerPos.longitude,
        radius_meters: radius,
      });
      setShowModal(false);
      await load();
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (place: SafePlace) => {
    Alert.alert(
      'Remover local',
      `Deseja remover ${place.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSafePlace(place.id);
              await load();
            } catch {
              Alert.alert('Erro', 'Não foi possível remover.');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF4D7E" />
      </View>
    );
  }

  const initialRegion = currentLocation
    ? {
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : {
        latitude: -23.533,
        longitude: -46.625,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Locais Seguros',
          headerStyle: { backgroundColor: '#0A0A14' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Onde é seguro?</Text>
          <Text style={styles.subtitle}>
            Cadastre casa, trabalho ou casa de parentes. Quando chegar em um desses,
            o Safety Mode encerra automaticamente.
          </Text>
        </View>

        {places.length > 0 ? (
          <View style={styles.list}>
            {places.map((p) => (
              <View key={p.id} style={styles.placeCard}>
                <Text style={styles.placeEmoji}>{p.icon_emoji}</Text>
                <View style={styles.placeInfo}>
                  <Text style={styles.placeName}>{p.name}</Text>
                  <Text style={styles.placeRadius}>
                    Raio de detecção: {p.radius_meters}m
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(p)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏠</Text>
            <Text style={styles.emptyTitle}>Nenhum local cadastrado</Text>
            <Text style={styles.emptyText}>
              Cadastre sua casa para o Safety Mode funcionar bem
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
          <Ionicons name="add-circle" size={22} color="#FF4D7E" />
          <Text style={styles.addBtnText}>Adicionar local seguro</Text>
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalCancel}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Novo local</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#FF4D7E" />
              ) : (
                <Text style={styles.modalSave}>Salvar</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView>
            <View style={styles.modalSection}>
              <Text style={styles.formLabel}>Nome</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Casa, Trabalho, Casa da mãe"
                placeholderTextColor="#7A7A94"
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.formLabel}>Ícone</Text>
              <View style={styles.emojiRow}>
                {EMOJI_OPTIONS.map((e) => (
                  <TouchableOpacity
                    key={e}
                    style={[styles.emojiChoice, emoji === e && styles.emojiChoiceActive]}
                    onPress={() => setEmoji(e)}
                  >
                    <Text style={styles.emojiText}>{e}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.formLabel}>Toque no mapa pra marcar o local</Text>
              <View style={styles.mapWrap}>
                <MapView
                  style={styles.modalMap}
                  provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
                  initialRegion={initialRegion}
                  onPress={(e) => setMarkerPos(e.nativeEvent.coordinate)}
                >
                  {markerPos && (
                    <>
                      <Marker coordinate={markerPos}>
                        <Text style={styles.mapMarker}>{emoji}</Text>
                      </Marker>
                      <Circle
                        center={markerPos}
                        radius={radius}
                        strokeColor="rgba(255, 77, 126, 0.8)"
                        fillColor="rgba(255, 77, 126, 0.15)"
                        strokeWidth={2}
                      />
                    </>
                  )}
                </MapView>
              </View>
            </View>

            <View style={styles.modalSection}>
              <Text style={styles.formLabel}>Raio de detecção: {radius}m</Text>
              <View style={styles.radiusRow}>
                {[50, 100, 200, 500].map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.radiusChip, radius === r && styles.radiusChipActive]}
                    onPress={() => setRadius(r)}
                  >
                    <Text
                      style={[
                        styles.radiusText,
                        radius === r && styles.radiusTextActive,
                      ]}
                    >
                      {r}m
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.helpText}>
                Maior raio = detecção mais rápida, mas menos precisa.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 20 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#B4B4C7',
    lineHeight: 20,
  },
  list: { gap: 12, marginBottom: 20 },
  placeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    backgroundColor: '#151525',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  placeEmoji: { fontSize: 32 },
  placeInfo: { flex: 1 },
  placeName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  placeRadius: {
    fontSize: 12,
    color: '#7A7A94',
  },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: '#B4B4C7',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FF4D7E',
    borderStyle: 'dashed',
  },
  addBtnText: {
    color: '#FF4D7E',
    fontSize: 15,
    fontWeight: '700',
  },
  modalContainer: { flex: 1, backgroundColor: '#0A0A14' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A42',
  },
  modalCancel: { color: '#B4B4C7', fontSize: 15 },
  modalTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  modalSave: { color: '#FF4D7E', fontSize: 15, fontWeight: '700' },
  modalSection: { padding: 16 },
  formLabel: {
    fontSize: 13,
    color: '#B4B4C7',
    marginBottom: 8,
    fontWeight: '600',
  },
  formInput: {
    backgroundColor: '#151525',
    color: '#FFFFFF',
    fontSize: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emojiChoice: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#151525',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  emojiChoiceActive: {
    borderColor: '#FF4D7E',
    backgroundColor: 'rgba(255, 77, 126, 0.1)',
  },
  emojiText: { fontSize: 24 },
  mapWrap: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  modalMap: { flex: 1 },
  mapMarker: { fontSize: 32 },
  radiusRow: { flexDirection: 'row', gap: 8 },
  radiusChip: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    backgroundColor: '#151525',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  radiusChipActive: {
    borderColor: '#FF4D7E',
    backgroundColor: 'rgba(255, 77, 126, 0.1)',
  },
  radiusText: { color: '#B4B4C7', fontWeight: '600' },
  radiusTextActive: { color: '#FF4D7E' },
  helpText: {
    fontSize: 12,
    color: '#7A7A94',
    marginTop: 8,
    fontStyle: 'italic',
  },
});
