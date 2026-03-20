/**
 * Library screen — 2-column grid with Realtime subscription.
 *
 * Shows all user narrations. Animates card to Play icon when
 * status changes to 'completed'. Handles all 8 error/edge states.
 *
 * Background: Linen (#F7F3F0) / Night Forest (#1B1D1C). NEVER #000 or #FFF.
 */
import React from 'react';
import { View, Text, FlatList, Pressable, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import { useAuth } from '@/lib/auth';
import { useLibrary } from '@/lib/hooks/useNarrations';
import { NarrationCard } from '@/components/ui/NarrationCard';
import { EmptyState } from '@/components/ui/EmptyState';

export default function LibraryScreen() {
  const { theme } = useNordicTheme();
  const { user } = useAuth();
  const router = useRouter();
  const { data: narrations, isLoading, error } = useLibrary();
  const { width } = useWindowDimensions();

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
        <EmptyState type="network-error" onAction={() => {}} />
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
              <NarrationCard narration={item} />
            </View>
          )}
        />
      )}
    </View>
  );
}
