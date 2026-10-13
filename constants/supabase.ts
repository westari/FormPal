import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Was hardcoded to ATHLT's own project (byte-identical URL/key to
// C:\Users\arize\ATHLT\expo\constants\supabase.ts) — almost certainly a
// bootstrap leftover, not the real new FormPal Supabase project. Moved to
// .env so real FormPal data never accidentally lands in ATHLT's database.
// See OVERNIGHT_REPORT.md for exactly where to paste the real values.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (__DEV__ && (!supabaseUrl || supabaseUrl.startsWith('REPLACE_'))) {
  console.warn('[supabase] EXPO_PUBLIC_SUPABASE_URL / ANON_KEY not set yet — see .env and OVERNIGHT_REPORT.md');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
