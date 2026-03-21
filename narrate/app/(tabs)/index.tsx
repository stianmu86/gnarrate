/**
 * Library screen — 2-column grid with Realtime subscription.
 *
 * Shows all user narrations. Animates card to Play icon when
 * status changes to 'completed'. Handles all 8 error/edge states.
 *
 * Background: Linen (#F7F3F0) / Night Forest (#1B1D1C). NEVER #000 or #FFF.
 */
import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, Pressable, Alert, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useLibrary } from '@/lib/hooks/useNarrations';
import type { Narration } from '@/lib/hooks/useNarrations';
import { NarrationCard } from '@/components/ui/NarrationCard';
import { EmptyState } from '@/components/ui/EmptyState';

export default function LibraryScreen() {
  const { theme } = useNordicTheme();
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: narrations, isLoading, error, refetch } = useLibrary();
  const { width } = useWindowDimensions();
  const [retryingId, setRetryingId] = useState<string | null>(null);

  /** Retry a failed narration: delete the old row, re-submit to process-content. */
  const handleRetry = useCallback(async (narration: Narration) => {
    if (retryingId) return; // prevent double-tap
    setRetryingId(narration.id);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) {
        Alert.alert('Not authenticated', 'Please sign in again.');
        return;
      }

      // Build the request body from the original narration data
      const body: Record<string, string> = {
        voice_id: narration.voice_id ?? '',
      };

      if (narration.source_type === 'url' && narration.source_url) {
        body.source_type = 'url';
        body.url = narration.source_url;
      } else {
        // For text or if content_raw is available, re-submit as text
        body.source_type = 'text';
        body.text = narration.content_raw ?? '';
      }

      // Delete the failed narration first
      await supabase.from('narrations').delete().eq('id', narration.id);

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/process-content`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || `Retry failed (${res.status})`);
      }

      // Realtime subscription will refresh the list automatically
      queryClient.invalidateQueries({ queryKey: ['narrations', user?.id] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      Alert.alert('Retry failed', message);
    } finally {
      setRetryingId(null);
    }
  }, [retryingId, user, queryClient]);

  /** Delete a failed narration after confirmation. */
  const handleDelete = useCallback((narration: Narration) => {
    Alert.alert(
      'Delete narration',
      `Are you sure you want to delete "${narration.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error: deleteError } = await supabase
                .from('narrations')
                .delete()
                .eq('id', narration.id);
              if (deleteError) throw deleteError;
              queryClient.invalidateQueries({ queryKey: ['narrations', user?.id] });
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Delete failed';
              Alert.alert('Error', message);
            }
          },
        },
      ]
    );
  }, [user, queryClient]);

  const numColumns = 2;
  const gap = 12;
  const padding = 24;
  const cardWidth = (width - padding * 2 - gap) / numColumns;

  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <EmptyState type="empty-library" onAction={() => router.push('/(auth)/login')} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        <EmptyState type="network-error" onAction={() => refetch()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: padding,
          paddingTop: 60,
          paddingBottom: 16,
        }}
      >
        <Text
          style={{
            fontFamily: 'Newsreader',
            fontSize: 32,
            fontWeight: '500',
            color: theme.textPrimary,
          }}
        >
          Library
        </Text>
        <Pressable
          onPress={() => router.push('/add')}
          style={{
            backgroundColor: theme.accent,
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Plus size={20} color="#FFFFFF" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: 'Inter', fontSize: 14, color: theme.textSecondary }}>
            Loading...
          </Text>
        </View>
      ) : !narrations || narrations.length === 0 ? (
        <EmptyState
          type="empty-library"
          onAction={() => router.push('/add')}
        />
      ) : (
        <FlatList
          data={narrations}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={{ paddingHorizontal: padding, paddingBottom: 24 }}
          columnWrapperStyle={{ gap }}
          ItemSeparatorComponent={() => <View style={{ height: gap }} />}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <NarrationCard
                narration={item}
                onRetry={handleRetry}
                onDelete={handleDelete}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}
