import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Edge Function Supabase client — uses SERVICE_ROLE_KEY (bypasses RLS).
 * NEVER use the anon key in Edge Functions.
 */
export function createServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
