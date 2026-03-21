/**
 * TanStack Query hook for user credits.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

export interface UserCredits {
  user_id: string;
  subscription_status: 'free' | 'pro' | 'cancelled';
  balance_seconds: number;
  monthly_allowance_seconds: number;
  lifetime_generated_seconds: number;
  period_resets_at: string | null;
}

export function useCredits() {
  const { user } = useAuth();

  return useQuery<UserCredits>({
    queryKey: ['credits', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_credits')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}

/**
 * Format seconds into human-readable time (e.g., "4m 30s" or "1h 15m").
 */
export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}
