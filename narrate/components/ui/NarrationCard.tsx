/**
 * Library card for a narration item.
 *
 * Shows cover art, title, metadata, and status indicator.
 * Progress ring when processing, Play icon when completed.
 * Uses Nordic Earth palette — never #000 or #FFF backgrounds.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Play, Loader, AlertCircle, Cloud } from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import type { Narration } from '@/lib/hooks/useNarrations';
import { formatSeconds } from '@/lib/hooks/useCredits';

interface Props {
  narration: Narration;
}

export function NarrationCard({ narration }: Props) {
  const router = useRouter();
  const { theme, isDark } = useNordicTheme();

  const progress =
    narration.total_chunks && narration.total_chunks > 0
      ? narration.completed_chunks / narration.total_chunks
      : null;

  const handlePress = () => {
    if (narration.status === 'completed') {
      router.push(`/item/${narration.id}`);
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={{
        backgroundColor: theme.surface,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor:
          narration.status === 'failed'
            ? '#C67B5C80' // Soft red-terracotta border for failed
            : theme.border,
        shadowColor: theme.textPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 20,
        elevation: 2,
      }}
    >
      {/* Title */}
      <Text
        numberOfLines={2}
        style={{
          fontFamily: 'Newsreader',
          fontSize: 20,
          fontWeight: '600',
          lineHeight: 26,
          color: theme.textPrimary,
          marginBottom: 4,
        }}
      >
        {narration.title}
      </Text>

      {/* Author */}
      {narration.author && (
        <Text
          numberOfLines={1}
          style={{
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: '500',
            color: theme.textSecondary,
            marginBottom: 8,
          }}
        >
          {narration.author}
        </Text>
      )}

      {/* Status indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <StatusIcon
          status={narration.status}
          progress={progress}
          accent={theme.accent}
          secondary={theme.textSecondary}
        />
        <Text
          style={{
            fontFamily: 'Inter',
            fontSize: 12,
            fontWeight: '500',
            color: theme.textSecondary,
          }}
        >
          {statusLabel(narration)}
        </Text>
      </View>
    </Pressable>
  );
}

function StatusIcon({
  status,
  progress,
  accent,
  secondary,
}: {
  status: string;
  progress: number | null;
  accent: string;
  secondary: string;
}) {
  switch (status) {
    case 'completed':
      return <Play size={16} color={accent} fill={accent} />;
    case 'processing':
      return <Loader size={16} color={accent} />;
    case 'failed':
      return <AlertCircle size={16} color="#C67B5C" />;
    case 'pending':
    default:
      return <Cloud size={16} color={secondary} />;
  }
}

function statusLabel(narration: Narration): string {
  switch (narration.status) {
    case 'completed':
      return narration.duration_seconds
        ? formatSeconds(narration.duration_seconds)
        : 'Ready';
    case 'processing':
      if (
        narration.total_chunks &&
        narration.completed_chunks > 0
      ) {
        const pct = Math.round(
          (narration.completed_chunks / narration.total_chunks) * 100
        );
        return `Processing ${pct}%`;
      }
      return 'Processing...';
    case 'failed':
      return 'Failed — tap to retry';
    case 'pending':
      return 'Queued';
    default:
      return '';
  }
}
