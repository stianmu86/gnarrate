/**
 * Now Playing screen — shows narration details, playback controls,
 * chapter list, and progress bar. Supports ?t=seconds deep link.
 *
 * Phase 4 will wire up real expo-av audio; this is the UI shell.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Share2,
  Download,
  Loader,
  AlertCircle,
} from 'lucide-react-native';
import { useNordicTheme } from '@/components/NordicThemeProvider';
import { useNarration } from '@/lib/hooks/useNarrations';
import { formatSeconds } from '@/lib/hooks/useCredits';

export default function NowPlayingScreen() {
  const { theme } = useNordicTheme();
  const router = useRouter();
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const { data: narration, isLoading, error } = useNarration(id);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(t ? Number(t) : 0);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center' }}>
        <Loader size={24} color={theme.textSecondary} />
      </View>
    );
  }

  if (error || !narration) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 48 }}>
        <AlertCircle size={32} color={theme.accent} strokeWidth={1.5} />
        <Text style={{ fontFamily: 'Newsreader', fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginTop: 12 }}>
          Narration not found
        </Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: 'Inter', fontSize: 14, color: theme.accent }}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const duration = narration.duration_seconds ?? 0;
  const progressPercent = duration > 0 ? Math.min(progress / duration, 1) : 0;
  const isReady = narration.status === 'completed';
  const isProcessing = narration.status === 'processing' || narration.status === 'pending';

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top bar */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 56,
          paddingHorizontal: 24,
          paddingBottom: 12,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={24} color={theme.textPrimary} strokeWidth={1.5} />
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable hitSlop={12}>
            <Share2 size={20} color={theme.textSecondary} strokeWidth={1.5} />
          </Pressable>
          <Pressable hitSlop={12}>
            <Download size={20} color={theme.textSecondary} strokeWidth={1.5} />
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}>
        {/* Cover / Title area */}
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 24,
            aspectRatio: 1,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: theme.border,
            marginBottom: 24,
          }}
        >
          {isProcessing ? (
            <View style={{ alignItems: 'center' }}>
              <Loader size={32} color={theme.accent} />
              <Text
                style={{
                  fontFamily: 'Inter',
                  fontSize: 12,
                  color: theme.textSecondary,
                  marginTop: 12,
                }}
              >
                {narration.total_chunks
                  ? `Processing ${narration.completed_chunks}/${narration.total_chunks} chunks…`
                  : 'Preparing narration…'}
              </Text>
            </View>
          ) : (
            <Text
              style={{
                fontFamily: 'Newsreader',
                fontSize: 24,
                fontWeight: '500',
                color: theme.textPrimary,
                textAlign: 'center',
                paddingHorizontal: 32,
              }}
            >
              {narration.title}
            </Text>
          )}
        </View>

        {/* Meta */}
        <Text
          style={{
            fontFamily: 'Newsreader',
            fontSize: 22,
            fontWeight: '600',
            color: theme.textPrimary,
            marginBottom: 4,
          }}
        >
          {narration.title}
        </Text>
        {narration.author && (
          <Text style={{ fontFamily: 'Inter', fontSize: 13, color: theme.textSecondary, marginBottom: 4 }}>
            {narration.author}
          </Text>
        )}
        <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary, marginBottom: 24 }}>
          {duration > 0 ? formatSeconds(duration) : 'Duration pending'}
        </Text>

        {/* Progress bar */}
        <View style={{ marginBottom: 8 }}>
          <View
            style={{
              height: 4,
              backgroundColor: theme.border,
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                height: 4,
                backgroundColor: theme.accent,
                borderRadius: 2,
                width: `${progressPercent * 100}%`,
              }}
            />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontFamily: 'Inter', fontSize: 11, color: theme.textSecondary }}>
              {formatSeconds(progress)}
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 11, color: theme.textSecondary }}>
              {duration > 0 ? formatSeconds(duration) : '--:--'}
            </Text>
          </View>
        </View>

        {/* Playback controls */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 32,
            marginVertical: 24,
          }}
        >
          <Pressable hitSlop={12} onPress={() => setProgress(Math.max(0, progress - 15))}>
            <SkipBack size={28} color={theme.textPrimary} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            onPress={() => isReady && setIsPlaying(!isPlaying)}
            style={{
              backgroundColor: isReady ? theme.accent : theme.border,
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isPlaying ? (
              <Pause size={28} color="#FFFFFF" strokeWidth={2} />
            ) : (
              <Play size={28} color="#FFFFFF" strokeWidth={2} style={{ marginLeft: 3 }} />
            )}
          </Pressable>
          <Pressable hitSlop={12} onPress={() => setProgress(Math.min(duration, progress + 30))}>
            <SkipForward size={28} color={theme.textPrimary} strokeWidth={1.5} />
          </Pressable>
        </View>

        {/* Chapters */}
        {narration.chapters && narration.chapters.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text
              style={{
                fontFamily: 'Inter',
                fontSize: 12,
                fontWeight: '600',
                color: theme.textSecondary,
                textTransform: 'uppercase',
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              Chapters
            </Text>
            {narration.chapters.map((chapter, idx) => (
              <Pressable
                key={idx}
                onPress={() => setProgress(chapter.start_time)}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Inter',
                    fontSize: 14,
                    color: theme.textPrimary,
                    flex: 1,
                  }}
                >
                  {chapter.title}
                </Text>
                <Text style={{ fontFamily: 'Inter', fontSize: 12, color: theme.textSecondary }}>
                  {formatSeconds(chapter.start_time)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
