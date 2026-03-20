/**
 * Explore screen — Social feed stub (Phase 3 / Sprint 7).
 * Supports unauthenticated guest access for public narrations.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';

export default function ExploreScreen() {
  const { theme } = useNordicTheme();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 48,
      }}
    >
      <Text
        style={{
          fontFamily: 'Newsreader',
          fontSize: 20,
          fontWeight: '600',
          color: theme.textPrimary,
          textAlign: 'center',
          marginBottom: 8,
        }}
      >
        Explore
      </Text>
      <Text
        style={{
          fontFamily: 'Inter',
          fontSize: 14,
          color: theme.textSecondary,
          textAlign: 'center',
        }}
      >
        Discover public narrations from the community. Coming soon.
      </Text>
    </View>
  );
}
