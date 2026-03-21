/**
 * Hooks for saving and loading playback progress from Supabase.
 * Uses the playback_progress table for resuming narrations.
 */
import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

/**
 * Fetch the last saved playback position for a narration.
 */
export function useLoadProgress(narrationId: string) {
  const { user } = useAuth();

  return useQuery<number>({
    queryKey: ['playback_progress', narrationId],
    queryFn: async () => {
      if (!user) return 0;

      const { data, error } = await supabase
        .from('playback_progress')
        .select('position_seconds')
        .eq('narration_id', narrationId)
        .eq('user_id', user.id)
        .single();

      if (error || !data) return 0;
      return data.position_seconds ?? 0;
    },
    enabled: !!user && !!narrationId,
  });
}

/**
 * Debounced save of playback position to Supabase.
 * Upserts every `intervalMs` milliseconds (default 10s).
 */
export function useSaveProgress(
  narrationId: string,
  positionSeconds: number,
  intervalMs = 10000
) {
  const { user } = useAuth();
  const lastSavedRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const save = useCallback(async () => {
    if (!user || !narrationId) return;
    const rounded = Math.floor(positionSeconds);
    if (rounded === lastSavedRef.current) return;

    lastSavedRef.current = rounded;

    await supabase.from('playback_progress').upsert(
      {
        user_id: user.id,
        narration_id: narrationId,
        position_seconds: rounded,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,narration_id' }
    );
  }, [user, narrationId, positionSeconds]);

  useEffect(() => {
    if (!user || !narrationId) return;

    timerRef.current = setInterval(() => {
      save();
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Final save on unmount
      save();
    };
  }, [save, intervalMs, user, narrationId]);
}
