/**
 * Custom hook wrapping expo-av Audio.Sound for narration playback.
 * Provides load, play, pause, seek, skip, and playback rate controls.
 * Auto-saves progress to Supabase every 10 seconds.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { useSaveProgress } from './usePlaybackProgress';

export const PLAYBACK_RATES = [0.75, 1.0, 1.2, 1.5, 2.0] as const;
export type PlaybackRate = (typeof PLAYBACK_RATES)[number];

export interface AudioPlayerState {
  isLoaded: boolean;
  isPlaying: boolean;
  isBuffering: boolean;
  position: number; // seconds
  duration: number; // seconds
  rate: PlaybackRate;
  error: string | null;
}

export interface AudioPlayerControls {
  loadAudio: (uri: string) => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  skip: (seconds: number) => Promise<void>;
  setRate: (rate: PlaybackRate) => Promise<void>;
  cycleRate: () => Promise<void>;
}

export type UseAudioPlayerReturn = AudioPlayerState & AudioPlayerControls;

export function useAudioPlayer(narrationId: string): UseAudioPlayerReturn {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [state, setState] = useState<AudioPlayerState>({
    isLoaded: false,
    isPlaying: false,
    isBuffering: false,
    position: 0,
    duration: 0,
    rate: 1.0,
    error: null,
  });

  // Save progress to Supabase every 10 seconds
  useSaveProgress(narrationId, state.position);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      setState((prev) => ({
        ...prev,
        isLoaded: false,
        isBuffering: status.error ? false : prev.isBuffering,
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      isLoaded: true,
      isPlaying: status.isPlaying,
      isBuffering: status.isBuffering,
      position: (status.positionMillis ?? 0) / 1000,
      duration: (status.durationMillis ?? 0) / 1000,
    }));
  }, []);

  const loadAudio = useCallback(
    async (uri: string) => {
      // Unload existing sound first
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      setState((prev) => ({ ...prev, isBuffering: true, error: null }));

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false, progressUpdateIntervalMillis: 500 },
          onPlaybackStatusUpdate
        );

        soundRef.current = sound;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load audio';
        setState((prev) => ({
          ...prev,
          isBuffering: false,
          isLoaded: false,
          error: message,
        }));
      }
    },
    [onPlaybackStatusUpdate]
  );

  const play = useCallback(async () => {
    if (soundRef.current && state.isLoaded) {
      await soundRef.current.playAsync();
    }
  }, [state.isLoaded]);

  const pause = useCallback(async () => {
    if (soundRef.current && state.isLoaded) {
      await soundRef.current.pauseAsync();
    }
  }, [state.isLoaded]);

  const seekTo = useCallback(async (seconds: number) => {
    if (soundRef.current && state.isLoaded) {
      const millis = Math.max(0, seconds * 1000);
      await soundRef.current.setPositionAsync(millis);
    }
  }, [state.isLoaded]);

  const skip = useCallback(
    async (seconds: number) => {
      const newPosition = Math.max(
        0,
        Math.min(state.duration, state.position + seconds)
      );
      await seekTo(newPosition);
    },
    [state.position, state.duration, seekTo]
  );

  const setRate = useCallback(async (rate: PlaybackRate) => {
    if (soundRef.current && state.isLoaded) {
      await soundRef.current.setRateAsync(rate, true);
    }
    setState((prev) => ({ ...prev, rate }));
  }, [state.isLoaded]);

  const cycleRate = useCallback(async () => {
    const currentIndex = PLAYBACK_RATES.indexOf(state.rate);
    const nextIndex = (currentIndex + 1) % PLAYBACK_RATES.length;
    const nextRate = PLAYBACK_RATES[nextIndex];
    await setRate(nextRate);
  }, [state.rate, setRate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    };
  }, []);

  return {
    ...state,
    loadAudio,
    play,
    pause,
    seekTo,
    skip,
    setRate,
    cycleRate,
  };
}
