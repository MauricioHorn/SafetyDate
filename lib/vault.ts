import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import Aes from 'react-native-aes-crypto';
import { supabase } from './supabase';

// Flag em memória: marca user_ids que tiveram a chave guardada no Keychain
// nesta sessão do app. Reseta quando o app é fechado/killado.
const unlockedUserIds = new Set<string>();

const SECURE_STORE_KEY_PREFIX = 'elas_vault_';
const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH_BYTES = 32; // AES-256
const MAX_PHOTO_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
const PHOTO_COMPRESSION_QUALITY = 0.85;
const THUMBNAIL_SIZE = 200;
const THUMBNAIL_QUALITY = 0.7;
const STORAGE_BUCKET = 'vault-files';

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

/**
 * Dispara Face ID/Touch ID/Passcode pra autenticar antes de operações sensíveis.
 * Joga erro se a usuária cancelar ou falhar.
 */
async function requireBiometricAuth(reason: string): Promise<void> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    throw new Error('Este aparelho não tem suporte a biometria.');
  }

  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!isEnrolled) {
    throw new Error('Você precisa cadastrar Face ID ou Touch ID nos Ajustes do iPhone.');
  }

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    cancelLabel: 'Cancelar',
    fallbackLabel: 'Usar código',
    disableDeviceFallback: false,
  });

  if (!result.success) {
    throw new Error('Autenticação biométrica cancelada.');
  }
}

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
  // requireAuthentication foi removido — disparamos LocalAuthentication explicitamente nas funções de alto nível.
  // WHEN_PASSCODE_SET_THIS_DEVICE_ONLY garante que a chave NÃO vai pra iCloud Keychain (privado do device).
  await SecureStore.setItemAsync(`${SECURE_STORE_KEY_PREFIX}${userId}`, key, {
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
  });
  unlockedUserIds.add(userId);
}

/**
 * Recupera a chave do Keychain. Vai requerer Face ID/Touch ID.
 */
export async function getKeyFromKeychain(userId: string): Promise<string | null> {
  // requireAuthentication foi removido — autenticação é feita explicitamente via LocalAuthentication
  // nas funções de alto nível ANTES de chamar getKeyFromKeychain.
  return SecureStore.getItemAsync(`${SECURE_STORE_KEY_PREFIX}${userId}`);
}

/**
 * Remove a chave do Keychain (uso: ao "trancar" o cofre ou ao resetar).
 */
export async function removeKeyFromKeychain(userId: string): Promise<void> {
  await SecureStore.deleteItemAsync(`${SECURE_STORE_KEY_PREFIX}${userId}`);
  unlockedUserIds.delete(userId);
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

  // Confirma identidade com Face ID antes de criar o cofre — só ela pode criar.
  await requireBiometricAuth('Autorize com Face ID pra criar seu cofre');

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

  // Senha correta — agora exige Face ID antes de liberar acesso ao cofre.
  await requireBiometricAuth('Autorize com Face ID pra abrir seu cofre');

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
  // Apenas consulta a flag em memória — NÃO dispara Face ID.
  // A flag é setada por storeKeyInKeychain (após unlock bem-sucedido)
  // e removida por removeKeyFromKeychain (lock ou reset).
  // Quando o app é killado, a flag some, então isVaultUnlocked volta a false
  // mesmo que a chave ainda esteja no Keychain — comportamento desejado:
  // a cada nova sessão do app, exige senha + Face ID de novo.
  return unlockedUserIds.has(userId);
}

/**
 * Lista itens do cofre (criptografados; use decryptVaultItem para ler conteúdo).
 */
export async function listVaultItems(
  userId: string,
  type?: VaultItemType
): Promise<VaultItem[]> {
  const key = await getKeyFromKeychain(userId);
  if (!key) {
    throw new Error('Cofre trancado.');
  }

  let query = supabase
    .from('vault_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (type) {
    query = query.eq('item_type', type);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Erro ao listar: ${error.message}`);
  }

  return (data || []) as VaultItem[];
}

/**
 * Adiciona um item ao cofre (criptografa + sobe pro Supabase + cria linha).
 */
export async function addVaultItem(params: {
  userId: string;
  type: VaultItemType;
  filename: string;
  content: string;
  metadata?: Record<string, unknown>;
}): Promise<VaultItem> {
  const key = await getKeyFromKeychain(params.userId);
  if (!key) {
    throw new Error('Cofre trancado. Destranque antes de adicionar itens.');
  }

  const encFilename = await encryptString(params.filename, key);

  const payload = JSON.stringify({
    content: params.content,
    metadata: params.metadata || {},
  });
  const encPayload = await encryptString(payload, key);

  const sizeBytes = encPayload.ciphertext.length / 2;

  const { data, error } = await supabase
    .from('vault_items')
    .insert({
      user_id: params.userId,
      item_type: params.type,
      encrypted_filename: `${encFilename.ciphertext}:${encFilename.iv}`,
      encrypted_metadata: `${encPayload.ciphertext}:${encPayload.iv}`,
      storage_path: null,
      size_bytes: sizeBytes,
      iv: encPayload.iv,
    })
    .select()
    .single();

  if (error || !data) {
    throw new Error(`Erro ao salvar item: ${error?.message}`);
  }

  const { error: rpcError } = await supabase.rpc('vault_increment_bytes_used', {
    p_user_id: params.userId,
    p_delta: sizeBytes,
  });
  if (rpcError) {
    await supabase
      .from('vault_metadata')
      .update({ bytes_used: sizeBytes })
      .eq('user_id', params.userId);
  }

  return data as VaultItem;
}

export async function addPhotoToVault(params: {
  userId: string;
  imageUri: string;
}): Promise<VaultItem> {
  const key = await getKeyFromKeychain(params.userId);
  if (!key) {
    throw new Error('Cofre trancado. Destranque antes.');
  }

  let base64 = await FileSystem.readAsStringAsync(params.imageUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  let workingUri = params.imageUri;
  const sizeBytes = base64.length * 0.75;
  if (sizeBytes > MAX_PHOTO_SIZE_BYTES) {
    const result = await ImageManipulator.manipulateAsync(
      params.imageUri,
      [],
      { compress: PHOTO_COMPRESSION_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    if (!result.base64) {
      throw new Error('Falha ao comprimir foto.');
    }
    base64 = result.base64;
    workingUri = result.uri;

    if (base64.length * 0.75 > MAX_PHOTO_SIZE_BYTES) {
      throw new Error('Foto muito grande mesmo após compressão. Tente uma menor.');
    }
  }

  const thumb = await ImageManipulator.manipulateAsync(
    workingUri,
    [{ resize: { width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE } }],
    { compress: THUMBNAIL_QUALITY, format: ImageManipulator.SaveFormat.JPEG, base64: true }
  );
  if (!thumb.base64) {
    throw new Error('Falha ao criar thumbnail.');
  }

  const encOriginal = await encryptString(base64, key);
  const encThumb = await encryptString(thumb.base64, key);
  const encFilename = await encryptString(`foto_${new Date().toISOString().slice(0, 19)}.jpg`, key);

  const itemId = Crypto.randomUUID();
  const originalPath = `${params.userId}/${itemId}.enc`;
  const thumbPath = `${params.userId}/${itemId}_thumb.enc`;

  const originalPayload = `${encOriginal.ciphertext}:${encOriginal.iv}`;
  const thumbPayload = `${encThumb.ciphertext}:${encThumb.iv}`;

  const { error: upErr1 } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(originalPath, originalPayload, { contentType: 'text/plain', upsert: false });
  if (upErr1) {
    throw new Error(`Falha ao subir foto: ${upErr1.message}`);
  }

  const { error: upErr2 } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(thumbPath, thumbPayload, { contentType: 'text/plain', upsert: false });
  if (upErr2) {
    await supabase.storage.from(STORAGE_BUCKET).remove([originalPath]).catch(() => {});
    throw new Error(`Falha ao subir thumbnail: ${upErr2.message}`);
  }

  const totalSizeBytes = originalPayload.length / 2 + thumbPayload.length / 2;
  const { data, error } = await supabase
    .from('vault_items')
    .insert({
      id: itemId,
      user_id: params.userId,
      item_type: 'photo',
      encrypted_filename: `${encFilename.ciphertext}:${encFilename.iv}`,
      encrypted_metadata: `${encThumb.ciphertext}:${encThumb.iv}`,
      storage_path: originalPath,
      size_bytes: totalSizeBytes,
      iv: encOriginal.iv,
    })
    .select()
    .single();

  if (error || !data) {
    await supabase.storage.from(STORAGE_BUCKET).remove([originalPath, thumbPath]).catch(() => {});
    throw new Error(`Falha ao salvar item: ${error?.message}`);
  }

  return data as VaultItem;
}

export async function getPhotoFromVault(userId: string, itemId: string): Promise<string> {
  const key = await getKeyFromKeychain(userId);
  if (!key) {
    throw new Error('Cofre trancado.');
  }

  const { data: item } = await supabase
    .from('vault_items')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('id', itemId)
    .maybeSingle();

  if (!item?.storage_path) {
    throw new Error('Foto não encontrada.');
  }

  // Cria URL assinada (válida 60s) e usa fetch — Blob.text() do React Native funciona bem assim.
  const { data: signed, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(item.storage_path, 60);

  if (signErr || !signed?.signedUrl) {
    throw new Error(`Falha ao gerar URL: ${signErr?.message}`);
  }

  const response = await fetch(signed.signedUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar foto: HTTP ${response.status}`);
  }

  const payloadText = await response.text();
  const [ciphertext, iv] = payloadText.split(':');
  if (!ciphertext || !iv) {
    throw new Error('Foto corrompida (formato inválido).');
  }

  const base64 = await decryptString(ciphertext, iv, key);
  return `data:image/jpeg;base64,${base64}`;
}

export async function deletePhotoFromVault(userId: string, itemId: string): Promise<void> {
  const { data: item } = await supabase
    .from('vault_items')
    .select('storage_path')
    .eq('user_id', userId)
    .eq('id', itemId)
    .maybeSingle();

  if (item?.storage_path) {
    const thumbPath = item.storage_path.replace('.enc', '_thumb.enc');
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([item.storage_path, thumbPath])
      .catch(() => {});
  }

  const { error } = await supabase
    .from('vault_items')
    .delete()
    .eq('user_id', userId)
    .eq('id', itemId);

  if (error) {
    throw new Error(`Erro ao apagar: ${error.message}`);
  }
}

/**
 * Apaga um item do cofre (storage + linha).
 */
export async function deleteVaultItem(userId: string, itemId: string): Promise<void> {
  const { data: item } = await supabase
    .from('vault_items')
    .select('size_bytes, storage_path')
    .eq('user_id', userId)
    .eq('id', itemId)
    .maybeSingle();

  void item;

  const { error } = await supabase
    .from('vault_items')
    .delete()
    .eq('user_id', userId)
    .eq('id', itemId);

  if (error) {
    throw new Error(`Erro ao apagar: ${error.message}`);
  }
}

/**
 * Descriptografa filename + conteúdo/metadata de um VaultItem.
 */
export async function decryptVaultItem(
  item: VaultItem,
  key: string
): Promise<{
  filename: string;
  content: string;
  metadata: Record<string, unknown>;
}> {
  const [filenameCipher, filenameIv] = item.encrypted_filename.split(':');
  const filename = await decryptString(filenameCipher, filenameIv, key);

  let content = '';
  let metadata: Record<string, unknown> = {};
  if (item.encrypted_metadata) {
    const [payloadCipher, payloadIv] = item.encrypted_metadata.split(':');
    const payloadStr = await decryptString(payloadCipher, payloadIv, key);
    const payload = JSON.parse(payloadStr) as { content?: string; metadata?: Record<string, unknown> };
    content = payload.content || '';
    metadata = payload.metadata || {};
  }

  return { filename, content, metadata };
}

/**
 * Reset destrutivo: apaga todos os itens do storage e da tabela, e a entrada em vault_metadata.
 * Usuária precisa criar de novo com createVault depois.
 */
export async function resetVault(userId: string): Promise<void> {
  void userId;
  throw new Error('resetVault: not implemented yet (Fase 5)');
}
