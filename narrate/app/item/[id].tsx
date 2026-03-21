/**
 * Now Playing screen — shows narration details, playback controls,
 * chapter list, and progress bar. Wired to expo-av via useAudioPlayer.
 * Supports ?t=seconds deep link for seeking to a timestamp.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Share, Alert, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
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
import { useAudioPlayer, PLAYBACK_RATES } from '@/lib/hooks/useAudioPlayer';
import { useLoadProgress } from '@/lib/hooks/usePlaybackProgress';

export default function NowPlayingScreen() {
  const { theme } = useNordicTheme();
  const router = useRouter();
  const { id, t } = useLocalSearchParams<{ id: string; t?: string }>();
  const { data: narration, isLoading, error } = useNarration(id);
  const player = useAudioPlayer(id);
  const { data: savedPosition } = useLoadProgress(id);
  const hasLoadedAudio = useRef(false);
  const hasResumed = useRef(false);

  // Load audio when narration is ready
  useEffect(() => {
    if (
      narration?.status === 'completed' &&
      narration.audio_url &&
      !hasLoadedAudio.current
    ) {
      hasLoadedAudio.current = true;

      // Convert storage URL to public URL
      // From: /storage/v1/object/audio/... → /storage/v1/object/public/audio/...
      const publicUrl = narration.audio_url.replace(
        '/storage/v1/object/audio/',
        '/storage/v1/object/public/audio/'
      );
      player.loadAudio(publicUrl);
    }
  }, [narration?.status, narration?.audio_url]);

  // Seek to ?t= deep link param or saved progress after audio loads
  useEffect(() => {
    if (player.isLoaded && !hasResumed.current) {
      hasResumed.current = true;
      if (t) {
        player.seekTo(Number(t));
      } else if (savedPosition && savedPosition > 0) {
        player.seekTo(savedPosition);
      }
    }
  }, [player.isLoaded, t, savedPosition]);

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

  const duration = player.isLoaded ? player.duration : (narration.duration_seconds ?? 0);
  const position = player.position;
  const progressPercent = duration > 0 ? Math.min(position / duration, 1) : 0;
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
          <Pressable
            hitSlop={12}
            onPress={async () => {
              try {
                await Share.share({
                  message: `${narration.title} — narrate://item/${id}`,
                });
              } catch {}
            }}
          >
            <Share2 size={20} color={theme.textSecondary} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={async () => {
              if (!narration.audio_url) {
                Alert.alert('Not ready', 'Audio is not available yet.');
                return;
              }
              const publicUrl = narration.audio_url.replace(
                '/storage/v1/object/audio/',
                '/storage/v1/object/public/audio/'
              );
              if (Platform.OS === 'web') {
                window.open(publicUrl, '_blank');
              } else {
                try {
                  const filename = `${narration.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp3`;
                  const dest = `${FileSystem.documentDirectory}${filename}`;
                  await FileSystem.downloadAsync(publicUrl, dest);
                  Alert.alert('Downloaded', `Saved to device as ${filename}`);
                } catch (err) {
                  Alert.alert('Download failed', err instanceof Error ? err.message : 'Unknown error');
                }
              }
            }}
          >
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
          {duration > 0 ? formatSeconds(Math.floor(duration)) : 'Duration pending'}
        </Text>

        {/* Buffering indicator */}
        {player.isBuffering && (
          <View style={{ alignItems: 'center', marginBottom: 8 }}>
            <ActivityIndicator size="small" color={theme.accent} />
            <Text style={{ fontFamily: 'Inter', fontSize: 11, color: theme.textSecondary, marginTop: 4 }}>
              Buffering…
            </Text>
          </View>
        )}

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
              {formatSeconds(Math.floor(position))}
            </Text>
            <Text style={{ fontFamily: 'Inter', fontSize: 11, color: theme.textSecondary }}>
              {duration > 0 ? formatSeconds(Math.floor(duration)) : '--:--'}
            </Text>
          </View>
        </View>

        {/* Audio load error */}
        {player.error && (
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} color={theme.accent} strokeWidth={1.5} />
              <Text style={{ fontFamily: 'Inter', fontSize: 13, color: theme.accent }}>
                Failed to load audio
              </Text>
            </View>
            <Pressable
              onPress={() => {
                if (narration.audio_url) {
                  hasLoadedAudio.current = false;
                  const publicUrl = narration.audio_url.replace(
                    '/storage/v1/object/audio/',
                    '/storage/v1/object/public/audio/'
                  );
                  player.loadAudio(publicUrl);
                }
              }}
              style={{
                marginTop: 8,
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.accent,
              }}
            >
              <Text style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: theme.accent }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

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
          <Pressable
            hitSlop={12}
            onPress={() => player.skip(-15)}
            disabled={!isReady}
          >
            <SkipBack size={28} color={isReady ? theme.textPrimary : theme.textSecondary} strokeWidth={1.5} />
          </Pressable>
          <Pressable
            onPress={() => {
              if (!isReady) return;
              player.isPlaying ? player.pause() : player.play();
            }}
            disabled={!isReady}
            style={{
              backgroundColor: isReady ? theme.accent : theme.border,
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {player.isPlaying ? (
              <Pause size={28} color={theme.surface} strokeWidth={2} />
            ) : (
              <Play size={28} color={theme.surface} strokeWidth={2} style={{ marginLeft: 3 }} />
            )}
          </Pressable>
          <Pressable
            hitSlop={12}
            onPress={() => player.skip(30)}
            disabled={!isReady}
          >
            <SkipForward size={28} color={isReady ? theme.textPrimary : theme.textSecondary} strokeWidth={1.5} />
          </Pressable>
        </View>

        {/* Speed control */}
        {isReady && (
          <View style={{ alignItems: 'center', marginBottom: 24 }}>
            <Pressable
              onPress={() => player.cycleRate()}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>
                {player.rate}x
              </Text>
            </Pressable>
          </View>
        )}

        {/* Chapters */}
        {(() => {
          // chapters may be a JSON string or an array
          let chapters: { title: string; start_char: number }[] = [];
          try {
            chapters = typeof narration.chapters === 'string'
              ? JSON.parse(narration.chapters)
              : Array.isArray(narration.chapters)
                ? narration.chapters
                : [];
          } catch {
            chapters = [];
          }
          if (chapters.length <= 1) return null; // Don't show single "Full Text" chapter
          return (
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
              {chapters.map((chapter: { title: string; start_char: number }, idx: number) => (
                <View
                  key={idx}
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
                </View>
              ))}
            </View>
          );
        })()}
      </ScrollView>
    </View>
  );
}
