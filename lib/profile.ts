import { supabase } from './supabase';
import * as ImageManipulator from 'expo-image-manipulator';

const AVATAR_BUCKET = 'avatars';
const AVATAR_SIZE = 400;

/**
 * Sobe uma foto de perfil pro bucket avatars (público) e salva a URL em profiles.avatar_url.
 * Comprime/redimensiona pra 400x400 antes de subir.
 */
export async function uploadAvatar(imageUri: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Não autenticado.' };

    // redimensiona pra 400x400 e comprime
    const manipulated = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: AVATAR_SIZE, height: AVATAR_SIZE } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    // lê como bytes (ArrayBuffer) pra subir binário
    const response = await fetch(manipulated.uri);
    const arrayBuffer = await response.arrayBuffer();

    // caminho fixo por usuária (sempre sobrescreve a foto anterior)
    const path = `${user.id}/avatar.jpg`;

    const { error: upErr } = await supabase.storage
      .from(AVATAR_BUCKET)
      .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      console.log('[profile] uploadAvatar erro upload:', upErr);
      return { success: false, error: 'Falha ao subir a foto.' };
    }

    // pega a URL pública (com timestamp pra furar cache quando troca a foto)
    const { data: pub } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    const publicUrl = `${pub.publicUrl}?t=${Date.now()}`;

    // salva no profile
    const { error: dbErr } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);
    if (dbErr) {
      console.log('[profile] uploadAvatar erro db:', dbErr);
      return { success: false, error: 'Foto subiu mas não salvou no perfil.' };
    }

    return { success: true, url: publicUrl };
  } catch (err: any) {
    console.log('[profile] uploadAvatar erro:', err);
    return { success: false, error: 'Não foi possível atualizar a foto.' };
  }
}

/**
 * Atualiza o nome do perfil.
 */
export async function updateFullName(fullName: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Não autenticado.' };
    const clean = fullName.trim();
    if (clean.length < 2) return { success: false, error: 'Digite um nome válido.' };

    const { error } = await supabase.from('profiles').update({ full_name: clean }).eq('id', user.id);
    if (error) return { success: false, error: 'Não foi possível salvar o nome.' };
    return { success: true };
  } catch {
    return { success: false, error: 'Erro ao salvar.' };
  }
}
