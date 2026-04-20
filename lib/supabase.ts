import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Types
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  plan: 'free' | 'annual';
  plan_expires_at: string | null;
  searches_count: number;
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
