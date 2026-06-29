import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

if (!supabaseUrl) {
  console.error(
    '[supabase] FATAL: EXPO_PUBLIC_SUPABASE_URL ausente no build. Verifique o bloco env do perfil de produção no eas.json.'
  );
}

if (!supabaseAnonKey) {
  console.error(
    '[supabase] FATAL: EXPO_PUBLIC_SUPABASE_ANON_KEY ausente no build. Verifique o bloco env do perfil de produção no eas.json.'
  );
}

export const supabase = createClient(
  supabaseUrl || 'https://invalid.supabase.co',
  supabaseAnonKey || 'invalid-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  }
);

// Types
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url?: string | null;
  phone: string | null;
  plan: 'free' | 'annual';
  plan_expires_at: string | null;
  searches_count: number;
  fake_call_count: number;
  live_share_count: number;
  created_at: string;
};

export type BackgroundCheck = {
  id: string;
  user_id: string;
  target_name: string;
  target_cpf: string | null;
  target_birth_date: string | null;
  target_phone: string | null;
  flag: 'green' | 'yellow' | 'red';
  summary: string;
  processes_count: number;
  criminal_processes_count: number;
  raw_data: any;
  created_at: string;
};
