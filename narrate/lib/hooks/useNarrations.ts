/**
 * TanStack Query hooks for narrations with Supabase Realtime.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../supabase';
import { useAuth } from '../auth';

export interface Narration {
  id: string;
  user_id: string;
  voice_id: string | null;
  title: string;
  author: string | null;
  source_type: 'url' | 'pdf' | 'text';
  source_url: string | null;
  audio_url: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  word_count: number | null;
  total_chunks: number | null;
  completed_chunks: number;
  content_raw: string | null;
  pdf_storage_path: string | null;
  pdf_page_count: number | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  is_public: boolean;
  chapters: Array<{ title: string; start_time: number }> | null;
  created_at: string;
}

/**
 * Fetch the user's library with Realtime subscription.
 * Animates card to Play icon when status changes to 'completed'.
 */
export function useLibrary() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<Narration[]>({
    queryKey: ['narrations', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('narrations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  // Subscribe to Realtime changes on the narrations table
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('narrations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'narrations',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Invalidate and refetch on any change
          queryClient.invalidateQueries({ queryKey: ['narrations', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  return query;
}

/**
 * Fetch a single narration by ID.
 */
export function useNarration(id: string) {
  return useQuery<Narration>({
    queryKey: ['narration', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('narrations')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}
