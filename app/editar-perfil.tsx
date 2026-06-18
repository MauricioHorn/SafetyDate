import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native';
import { Stack, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../lib/supabase';
import { uploadAvatar, updateFullName } from '../lib/profile';

export default function EditarPerfilScreen() {
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single();
      if (data) {
        setName(data.full_name || '');
        setAvatarUrl(data.avatar_url || null);
      }
      setLoading(false);
    })();
  }, []);

  function initial() {
    return (name || '?').trim().charAt(0).toUpperCase();
  }

  async function handlePickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permissão necessária', 'Precisamos de acesso às suas fotos para escolher um avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingPhoto(true);
    const res = await uploadAvatar(result.assets[0].uri);
    setUploadingPhoto(false);
    if (res.success && res.url) {
      setAvatarUrl(res.url);
    } else {
      Alert.alert('Atenção', res.error || 'Não foi possível atualizar a foto.');
    }
  }

  async function handleSave() {
    setSaving(true);
    const res = await updateFullName(name);
    setSaving(false);
    if (res.success) {
      Alert.alert('Pronto', 'Perfil atualizado.', [{ text: 'OK', onPress: () => router.back() }]);
    } else {
      Alert.alert('Atenção', res.error || 'Não foi possível salvar.');
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF4D7E" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Editar perfil</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickPhoto} disabled={uploadingPhoto} style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarLetter}>{initial()}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={16} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.avatarHint}>Toque para trocar a foto</Text>
        </View>

        {/* Nome */}
        <Text style={styles.label}>Nome</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Seu nome"
          placeholderTextColor="#7A7A94"
          maxLength={60}
        />

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.saveBtnText}>Salvar</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A14' },
  loadingContainer: { flex: 1, backgroundColor: '#0A0A14', alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  topTitle: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  content: { padding: 20 },
  avatarSection: { alignItems: 'center', marginBottom: 28, marginTop: 8 },
  avatarWrap: { width: 110, height: 110, marginBottom: 10 },
  avatarImg: { width: 110, height: 110, borderRadius: 55, borderWidth: 2, borderColor: '#FF4D7E' },
  avatarFallback: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,77,126,0.18)',
    borderWidth: 2, borderColor: '#FF4D7E',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarLetter: { color: '#FF4D7E', fontSize: 40, fontWeight: '800' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#FF4D7E',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#0A0A14',
  },
  avatarHint: { color: '#B4B4C7', fontSize: 13 },
  label: { color: '#B4B4C7', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#151525', borderRadius: 12, padding: 15,
    color: '#FFFFFF', fontSize: 16, marginBottom: 28,
    borderWidth: 1, borderColor: '#2A2A42',
  },
  saveBtn: {
    backgroundColor: '#FF4D7E', paddingVertical: 15,
    borderRadius: 12, alignItems: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
});
