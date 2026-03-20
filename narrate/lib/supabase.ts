import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Expo client — uses ANON key (RLS enforced).
 * Edge Functions use SERVICE_ROLE_KEY instead. Never swap these.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
