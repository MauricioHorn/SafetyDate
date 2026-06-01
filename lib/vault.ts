import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import Aes from 'react-native-aes-crypto';
import { supabase } from './supabase';

const SECURE_STORE_KEY_PREFIX = 'elas_vault_';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH_BYTES = 32; // AES-256

export type VaultItemType = 'photo' | 'video' | 'note' | 'document' | 'audio';

export type VaultMetadata = {
  user_id: string;
  password_hash: string;
  password_salt: string;
  encryption_salt: string;
  bytes_used: number;
  bytes_limit: number;
  created_at: string;
  last_unlocked_at: string | null;
  reset_count: number;
};

export type VaultItem = {
  id: string;
  user_id: string;
  item_type: VaultItemType;
  encrypted_filename: string;
  encrypted_metadata: string | null;
  storage_path: string | null;
  size_bytes: number;
  iv: string;
  created_at: string;
  updated_at: string;
};

// ============================================================
// BAIXO NÍVEL — implementar agora (criptografia + secure store)
// ============================================================

/**
 * Deriva uma chave de 256 bits a partir da senha + salt usando PBKDF2-SHA256.
 * Retorna a chave em base64.
 */
export async function deriveKey(password: string, salt: string): Promise<string> {
  const keyHex = await Aes.pbkdf2(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH_BYTES * 8,
    'sha256'
  );
  return keyHex;
}

/**
 * Gera um salt aleatório de 16 bytes em hex.
 */
export async function generateSalt(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash da senha pra verificação (separado da chave de criptografia).
 * Usa PBKDF2 com salt diferente do encryption_salt.
 */
export async function hashPassword(password: string, salt: string): Promise<string> {
  const hashHex = await Aes.pbkdf2(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH_BYTES * 8,
    'sha256'
  );
  return hashHex;
}

/**
 * Guarda a chave de criptografia derivada no Keychain (expo-secure-store).
 * Protegida por Face ID via WHEN_PASSCODE_SET_THIS_DEVICE_ONLY.
 */
export async function storeKeyInKeychain(userId: string, key: string): Promise<void> {
  await SecureStore.setItemAsync(`${SECURE_STORE_KEY_PREFIX}${userId}`, key, {
    requireAuthentication: true,
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  });
}

/**
 * Recupera a chave do Keychain. Vai requerer Face ID/Touch ID.
 */
export async function getKeyFromKeychain(userId: string): Promise<string | null> {
  return SecureStore.getItemAsync(`${SECURE_STORE_KEY_PREFIX}${userId}`, {
    requireAuthentication: true,
  });
}

/**
 * Remove a chave do Keychain (uso: ao "trancar" o cofre ou ao resetar).
 */
export async function removeKeyFromKeychain(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(`${SECURE_STORE_KEY_PREFIX}${userId}`);
}

/**
 * Criptografa string usando AES-256-GCM com a chave fornecida.
 * Retorna { ciphertext, iv } em base64.
 */
export async function encryptString(
  plaintext: string,
  key: string
): Promise<{ ciphertext: string; iv: string }> {
  const ivBytes = await Crypto.getRandomBytesAsync(12);
  const ivHex = Array.from(ivBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const ciphertext = await Aes.encrypt(plaintext, key, ivHex, 'aes-256-gcm');
  return { ciphertext, iv: ivHex };
}

/**
 * Descriptografa string criptografada com encryptString.
 */
export async function decryptString(
  ciphertext: string,
  iv: string,
  key: string
): Promise<string> {
  const plaintext = await Aes.decrypt(ciphertext, key, iv, 'aes-256-gcm');
  return plaintext;
}

// ============================================================
// ALTO NÍVEL — stubs (serão implementados nas Fases 2-5)
// ============================================================

/**
 * Verifica se a usuária já criou o cofre (tem entrada em vault_metadata).
 */
export async function hasVault(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('vault_metadata')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return !!data;
}

/**
 * Cria o cofre pela primeira vez: deriva chave, salva metadados, guarda chave no Keychain.
 */
export async function createVault(userId: string, password: string): Promise<void> {
  if (password.length < 8) {
    throw new Error('A senha precisa ter pelo menos 8 caracteres.');
  }

  const passwordSalt = await generateSalt();
  const encryptionSalt = await generateSalt();

  const passwordHash = await hashPassword(password, passwordSalt);
  const encryptionKey = await deriveKey(password, encryptionSalt);

  const { error } = await supabase.from('vault_metadata').insert({
    user_id: userId,
    password_hash: passwordHash,
    password_salt: passwordSalt,
    encryption_salt: encryptionSalt,
    bytes_used: 0,
    last_unlocked_at: new Date().toISOString(),
  });

  if (error) {
    throw new Error(`Erro ao criar cofre: ${error.message}`);
  }

  await storeKeyInKeychain(userId, encryptionKey);
}

/**
 * Destranca o cofre: deriva a chave a partir da senha, valida hash, guarda no Keychain.
 */
export async function unlockVault(userId: string, password: string): Promise<void> {
  const { data: metadata, error } = await supabase
    .from('vault_metadata')
    .select('password_hash, password_salt, encryption_salt')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !metadata) {
    throw new Error('Cofre não encontrado.');
  }

  const computedHash = await hashPassword(password, metadata.password_salt);
  if (computedHash !== metadata.password_hash) {
    throw new Error('Senha incorreta.');
  }

  const encryptionKey = await deriveKey(password, metadata.encryption_salt);
  await storeKeyInKeychain(userId, encryptionKey);

  await supabase
    .from('vault_metadata')
    .update({ last_unlocked_at: new Date().toISOString() })
    .eq('user_id', userId);
}

/**
 * Tranca o cofre: remove chave do Keychain.
 */
export async function lockVault(userId: string): Promise<void> {
  await removeKeyFromKeychain(userId);
}

/**
 * Verifica se a chave está disponível (cofre destrancado nesta sessão).
 * NÃO retorna a chave, só boolean.
 */
export async function isVaultUnlocked(userId: string): Promise<boolean> {
  try {
    const key = await getKeyFromKeychain(userId);
    return !!key;
  } catch {
    return false;
  }
}

/**
 * Lista itens do cofre, descriptografando metadados (nome, etc).
 */
export async function listVaultItems(
  userId: string,
  type?: VaultItemType
): Promise<VaultItem[]> {
  void userId;
  void type;
  throw new Error('listVaultItems: not implemented yet (Fase 4)');
}

/**
 * Adiciona um item ao cofre (criptografa + sobe pro Supabase + cria linha).
 * Params completos na Fase 4.
 */
export async function addVaultItem(_params: unknown): Promise<VaultItem> {
  void _params;
  throw new Error('addVaultItem: not implemented yet (Fase 4)');
}

/**
 * Apaga um item do cofre (storage + linha).
 */
export async function deleteVaultItem(userId: string, itemId: string): Promise<void> {
  void userId;
  void itemId;
  throw new Error('deleteVaultItem: not implemented yet (Fase 4)');
}

/**
 * Reset destrutivo: apaga todos os itens do storage e da tabela, e a entrada em vault_metadata.
 * Usuária precisa criar de novo com createVault depois.
 */
export async function resetVault(userId: string): Promise<void> {
  void userId;
  throw new Error('resetVault: not implemented yet (Fase 5)');
}
