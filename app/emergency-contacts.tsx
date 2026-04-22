import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  EmergencyContact,
  getEmergencyContacts,
  addEmergencyContact,
  deleteEmergencyContact,
} from '../lib/safety';

export default function EmergencyContactsScreen() {
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getEmergencyContacts();
      setContacts(data);
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível carregar os contatos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAdd = async () => {
    if (!name.trim()) {
      Alert.alert('Atenção', 'Informe o nome do contato.');
      return;
    }

    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      Alert.alert('Atenção', 'Informe um telefone válido com DDD.');
      return;
    }

    if (contacts.length >= 5) {
      Alert.alert('Limite atingido', 'Máximo de 5 contatos.');
      return;
    }

    try {
      setSaving(true);
      const formattedPhone = cleanPhone.startsWith('55')
        ? `+${cleanPhone}`
        : `+55${cleanPhone}`;

      await addEmergencyContact({
        name: name.trim(),
        phone: formattedPhone,
        relationship: relationship.trim(),
      });

      setName('');
      setPhone('');
      setRelationship('');
      setShowForm(false);
      await load();
    } catch (error: any) {
      Alert.alert('Erro', error.message || 'Não foi possível adicionar.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (contact: EmergencyContact) => {
    Alert.alert(
      'Remover contato',
      `Deseja remover ${contact.name}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteEmergencyContact(contact.id);
              await load();
            } catch {
              Alert.alert('Erro', 'Não foi possível remover.');
            }
          },
        },
      ]
    );
  };

  const formatPhoneDisplay = (phone: string) => {
    const clean = phone.replace(/\D/g, '');
    if (clean.startsWith('55') && clean.length === 13) {
      return `+55 (${clean.slice(2, 4)}) ${clean.slice(4, 9)}-${clean.slice(9)}`;
    }
    return phone;
  };

  const handlePhoneChange = (value: string) => {
    const clean = value.replace(/\D/g, '');
    let formatted = clean;
    if (clean.length >= 2) formatted = `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
    if (clean.length >= 7)
      formatted = `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
    setPhone(formatted);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF4D7E" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <Stack.Screen
        options={{
          title: 'Contatos de Emergência',
          headerStyle: { backgroundColor: '#0A0A14' },
          headerTintColor: '#FFFFFF',
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Quem vai te ajudar</Text>
          <Text style={styles.subtitle}>
            Essas pessoas recebem um SMS com sua localização só quando você
            apertar o botão SOS. Cadastre pessoas de total confiança.
          </Text>
        </View>

        {contacts.length > 0 && (
          <View style={styles.section}>
            {contacts.map((contact) => (
              <View key={contact.id} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <View style={styles.contactHeader}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    {contact.is_primary && (
                      <View style={styles.primaryBadge}>
                        <Text style={styles.primaryBadgeText}>Principal</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.contactPhone}>
                    {formatPhoneDisplay(contact.phone)}
                  </Text>
                  {contact.relationship && (
                    <Text style={styles.contactRelationship}>
                      {contact.relationship}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(contact)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="trash-outline" size={22} color="#EF4444" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {contacts.length === 0 && !showForm && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📱</Text>
            <Text style={styles.emptyTitle}>Nenhum contato ainda</Text>
            <Text style={styles.emptyText}>
              Cadastre pelo menos 1 contato pra poder usar o SOS
            </Text>
          </View>
        )}

        {showForm && (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Novo contato</Text>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Nome *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: Mariana"
                placeholderTextColor="#7A7A94"
                value={name}
                onChangeText={setName}
                autoFocus
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Telefone com DDD *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="(11) 99999-9999"
                placeholderTextColor="#7A7A94"
                value={phone}
                onChangeText={handlePhoneChange}
                keyboardType="phone-pad"
                maxLength={15}
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Relação (opcional)</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Ex: melhor amiga, mãe"
                placeholderTextColor="#7A7A94"
                value={relationship}
                onChangeText={setRelationship}
              />
            </View>

            <View style={styles.formButtons}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setShowForm(false);
                  setName('');
                  setPhone('');
                  setRelationship('');
                }}
                disabled={saving}
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleAdd}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveBtnText}>Salvar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {!showForm && contacts.length < 5 && (
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setShowForm(true)}
          >
            <Ionicons name="add-circle" size={22} color="#FF4D7E" />
            <Text style={styles.addBtnText}>
              {contacts.length === 0 ? 'Adicionar primeiro contato' : 'Adicionar outro contato'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoIcon}>🔒</Text>
          <Text style={styles.infoText}>
            <Text style={{ fontWeight: '700' }}>Privacidade:</Text> seus contatos
            só recebem SMS quando você aperta o SOS. Nunca automaticamente.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
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
  header: { marginBottom: 24 },
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
  section: { gap: 12, marginBottom: 20 },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#151525',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  contactInfo: { flex: 1 },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  primaryBadge: {
    backgroundColor: '#FF4D7E',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  contactPhone: {
    fontSize: 14,
    color: '#B4B4C7',
    marginBottom: 2,
  },
  contactRelationship: {
    fontSize: 12,
    color: '#7A7A94',
    fontStyle: 'italic',
  },
  deleteBtn: { padding: 8 },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
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
  formCard: {
    backgroundColor: '#151525',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#FF4D7E',
    marginBottom: 20,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  formField: { marginBottom: 14 },
  formLabel: {
    fontSize: 13,
    color: '#B4B4C7',
    marginBottom: 6,
    fontWeight: '600',
  },
  formInput: {
    backgroundColor: '#1E1E35',
    color: '#FFFFFF',
    fontSize: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A42',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A42',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#B4B4C7',
    fontSize: 15,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FF4D7E',
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
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
    marginBottom: 24,
  },
  addBtnText: {
    color: '#FF4D7E',
    fontSize: 15,
    fontWeight: '700',
  },
  infoBox: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    backgroundColor: '#151525',
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  infoIcon: { fontSize: 18 },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#B4B4C7',
    lineHeight: 18,
  },
});
