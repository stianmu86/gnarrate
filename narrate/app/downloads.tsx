/**
 * Downloads screen — manage offline narrations.
 * Phase 2.5 stub; will wire up expo-file-system for local caching.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ArrowLeft, Download } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';

export default function DownloadsScreen() {
  const { theme } = useNordicTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingTop: 56,
          paddingHorizontal: 24,
          paddingBottom: 12,
          gap: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={theme.textPrimary} strokeWidth={1.5} />
        </Pressable>
        <Text style={{ fontFamily: 'Newsreader', fontSize: 24, fontWeight: '500', color: theme.textPrimary }}>
          Downloads
        </Text>
      </View>

      {/* Empty state */}
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 48,
        }}
      >
        <Download size={32} color={theme.textSecondary} strokeWidth={1} />
        <Text
          style={{
            fontFamily: 'Newsreader',
            fontSize: 18,
            fontWeight: '600',
            color: theme.textPrimary,
            marginTop: 12,
            textAlign: 'center',
          }}
        >
          No Downloads Yet
        </Text>
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 13,
            color: theme.textSecondary,
            marginTop: 4,
            textAlign: 'center',
          }}
        >
          Downloaded narrations will appear here for offline listening.
        </Text>
      </View>
    </View>
  );
}
