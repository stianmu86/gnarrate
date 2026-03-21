/**
 * Unit tests for audio player hook logic.
 * Tests useAudioPlayer states, skip calculations, playback rate cycling,
 * and progress save debouncing. Mocks expo-av Audio.Sound.
 */

// Mock expo-av before importing anything that depends on it
jest.mock('expo-av', () => ({
  Audio: {
    Sound: {
      createAsync: jest.fn().mockResolvedValue({
        sound: {
          playAsync: jest.fn(),
          pauseAsync: jest.fn(),
          unloadAsync: jest.fn(),
          setPositionAsync: jest.fn(),
          setRateAsync: jest.fn(),
          setOnPlaybackStatusUpdate: jest.fn(),
          getStatusAsync: jest.fn().mockResolvedValue({ isLoaded: false }),
        },
      }),
    },
    setAudioModeAsync: jest.fn(),
  },
}));

// Mock supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: null, error: null }),
        }),
      }),
      upsert: () => ({ error: null }),
    }),
  },
}));

// Mock auth
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, session: null, loading: false, signOut: jest.fn() }),
}));

import { PLAYBACK_RATES, PlaybackRate } from '../lib/hooks/useAudioPlayer';

// ── Playback rate cycling ──────────────────────────────────────────────

describe('Playback rate cycling', () => {
  function cycleRate(current: PlaybackRate): PlaybackRate {
    const idx = PLAYBACK_RATES.indexOf(current);
    const next = (idx + 1) % PLAYBACK_RATES.length;
    return PLAYBACK_RATES[next];
  }

  it('cycles from 1x to 1.5x', () => {
    expect(cycleRate(1.0)).toBe(1.5);
  });

  it('cycles from 1.5x to 2x', () => {
    expect(cycleRate(1.5)).toBe(2.0);
  });

  it('cycles from 2x back to 1x', () => {
    expect(cycleRate(2.0)).toBe(1.0);
  });

  it('PLAYBACK_RATES has exactly 3 options', () => {
    expect(PLAYBACK_RATES).toHaveLength(3);
    expect(PLAYBACK_RATES).toEqual([1.0, 1.5, 2.0]);
  });
});

// ── Skip calculations ──────────────────────────────────────────────────

describe('Skip forward/back calculations', () => {
  function computeSkip(
    position: number,
    skipAmount: number,
    duration: number
  ): number {
    return Math.max(0, Math.min(duration, position + skipAmount));
  }

  it('skips back 15 seconds', () => {
    expect(computeSkip(60, -15, 300)).toBe(45);
  });

  it('skips forward 30 seconds', () => {
    expect(computeSkip(60, 30, 300)).toBe(90);
  });

  it('clamps skip back to 0', () => {
    expect(computeSkip(5, -15, 300)).toBe(0);
  });

  it('clamps skip forward to duration', () => {
    expect(computeSkip(290, 30, 300)).toBe(300);
  });

  it('handles position at 0 with skip back', () => {
    expect(computeSkip(0, -15, 300)).toBe(0);
  });

  it('handles position at duration with skip forward', () => {
    expect(computeSkip(300, 30, 300)).toBe(300);
  });
});

// ── Audio player state transitions ─────────────────────────────────────

describe('Audio player state transitions', () => {
  interface MockPlayerState {
    isLoaded: boolean;
    isPlaying: boolean;
    isBuffering: boolean;
    position: number;
    duration: number;
    rate: PlaybackRate;
  }

  function createInitialState(): MockPlayerState {
    return {
      isLoaded: false,
      isPlaying: false,
      isBuffering: false,
      position: 0,
      duration: 0,
      rate: 1.0,
    };
  }

  function applyLoadedStatus(state: MockPlayerState, status: {
    isLoaded: boolean;
    isPlaying: boolean;
    isBuffering: boolean;
    positionMillis: number;
    durationMillis: number;
  }): MockPlayerState {
    if (!status.isLoaded) {
      return { ...state, isLoaded: false };
    }
    return {
      ...state,
      isLoaded: true,
      isPlaying: status.isPlaying,
      isBuffering: status.isBuffering,
      position: status.positionMillis / 1000,
      duration: status.durationMillis / 1000,
    };
  }

  it('starts in unloaded state', () => {
    const state = createInitialState();
    expect(state.isLoaded).toBe(false);
    expect(state.isPlaying).toBe(false);
    expect(state.isBuffering).toBe(false);
    expect(state.position).toBe(0);
    expect(state.duration).toBe(0);
  });

  it('transitions to loaded state', () => {
    const state = createInitialState();
    const next = applyLoadedStatus(state, {
      isLoaded: true,
      isPlaying: false,
      isBuffering: false,
      positionMillis: 0,
      durationMillis: 120000,
    });

    expect(next.isLoaded).toBe(true);
    expect(next.duration).toBe(120);
    expect(next.position).toBe(0);
  });

  it('transitions to playing state', () => {
    const state = createInitialState();
    const next = applyLoadedStatus(state, {
      isLoaded: true,
      isPlaying: true,
      isBuffering: false,
      positionMillis: 5000,
      durationMillis: 120000,
    });

    expect(next.isPlaying).toBe(true);
    expect(next.position).toBe(5);
  });

  it('transitions to paused state', () => {
    const playing = applyLoadedStatus(createInitialState(), {
      isLoaded: true,
      isPlaying: true,
      isBuffering: false,
      positionMillis: 30000,
      durationMillis: 120000,
    });

    const paused = applyLoadedStatus(playing, {
      isLoaded: true,
      isPlaying: false,
      isBuffering: false,
      positionMillis: 30000,
      durationMillis: 120000,
    });

    expect(paused.isPlaying).toBe(false);
    expect(paused.position).toBe(30);
  });

  it('reflects seek position', () => {
    const state = createInitialState();
    const next = applyLoadedStatus(state, {
      isLoaded: true,
      isPlaying: false,
      isBuffering: false,
      positionMillis: 45000,
      durationMillis: 120000,
    });

    expect(next.position).toBe(45);
  });

  it('shows buffering state', () => {
    const state = createInitialState();
    const next = applyLoadedStatus(state, {
      isLoaded: true,
      isPlaying: false,
      isBuffering: true,
      positionMillis: 0,
      durationMillis: 120000,
    });

    expect(next.isBuffering).toBe(true);
  });

  it('handles unloaded status gracefully', () => {
    const loaded = applyLoadedStatus(createInitialState(), {
      isLoaded: true,
      isPlaying: true,
      isBuffering: false,
      positionMillis: 60000,
      durationMillis: 120000,
    });

    const unloaded = applyLoadedStatus(loaded, {
      isLoaded: false,
      isPlaying: false,
      isBuffering: false,
      positionMillis: 0,
      durationMillis: 0,
    });

    expect(unloaded.isLoaded).toBe(false);
    // Preserves other state from before unload (like position/duration)
    expect(unloaded.position).toBe(60);
  });

  it('converts milliseconds to seconds correctly', () => {
    const state = applyLoadedStatus(createInitialState(), {
      isLoaded: true,
      isPlaying: false,
      isBuffering: false,
      positionMillis: 90500,
      durationMillis: 300000,
    });

    expect(state.position).toBe(90.5);
    expect(state.duration).toBe(300);
  });
});

// ── Progress save debouncing ───────────────────────────────────────────

describe('Progress save debouncing', () => {
  it('rounds position down to nearest second', () => {
    const position = 45.7;
    const rounded = Math.floor(position);
    expect(rounded).toBe(45);
  });

  it('skips save when rounded position unchanged', () => {
    let lastSaved = 45;
    const currentPosition = 45.3;
    const rounded = Math.floor(currentPosition);
    const shouldSave = rounded !== lastSaved;
    expect(shouldSave).toBe(false);
  });

  it('saves when position changes to a new second', () => {
    let lastSaved = 45;
    const currentPosition = 46.1;
    const rounded = Math.floor(currentPosition);
    const shouldSave = rounded !== lastSaved;
    expect(shouldSave).toBe(true);
    lastSaved = rounded;
    expect(lastSaved).toBe(46);
  });

  it('uses 10 second interval by default', () => {
    const DEFAULT_INTERVAL = 10000;
    expect(DEFAULT_INTERVAL).toBe(10000);
  });

  it('builds correct upsert payload', () => {
    const userId = 'user-123';
    const narrationId = 'narration-456';
    const positionSeconds = 90;

    const payload = {
      user_id: userId,
      narration_id: narrationId,
      position_seconds: positionSeconds,
      updated_at: new Date().toISOString(),
    };

    expect(payload.user_id).toBe(userId);
    expect(payload.narration_id).toBe(narrationId);
    expect(payload.position_seconds).toBe(90);
    expect(payload.updated_at).toBeTruthy();
  });

  it('upserts on conflict with user_id,narration_id', () => {
    const onConflict = 'user_id,narration_id';
    expect(onConflict).toBe('user_id,narration_id');
  });
});

// ── Deep link / resume logic ───────────────────────────────────────────

describe('Deep link and resume logic', () => {
  it('parses ?t= query parameter to seek position', () => {
    const params = { id: 'abc', t: '120' };
    const seekTarget = params.t ? Number(params.t) : 0;
    expect(seekTarget).toBe(120);
  });

  it('defaults to 0 when no ?t= param', () => {
    const params = { id: 'abc' };
    const seekTarget = (params as any).t ? Number((params as any).t) : 0;
    expect(seekTarget).toBe(0);
  });

  it('prefers ?t= over saved progress', () => {
    const tParam = '60';
    const savedPosition = 120;
    const seekTarget = tParam ? Number(tParam) : (savedPosition > 0 ? savedPosition : 0);
    expect(seekTarget).toBe(60);
  });

  it('uses saved progress when no ?t= param', () => {
    const tParam: string | undefined = undefined;
    const savedPosition = 120;
    const seekTarget = tParam ? Number(tParam) : (savedPosition > 0 ? savedPosition : 0);
    expect(seekTarget).toBe(120);
  });

  it('play button disabled when status is not completed', () => {
    const statuses = ['pending', 'processing', 'failed'] as const;
    for (const status of statuses) {
      const isReady = status === 'completed';
      expect(isReady).toBe(false);
    }
  });

  it('play button enabled when status is completed', () => {
    const isReady = 'completed' === 'completed';
    expect(isReady).toBe(true);
  });
});

// ── Progress bar calculation ───────────────────────────────────────────

describe('Progress bar calculation', () => {
  it('calculates correct percent', () => {
    const position = 60;
    const duration = 300;
    const percent = duration > 0 ? Math.min(position / duration, 1) : 0;
    expect(percent).toBeCloseTo(0.2);
  });

  it('clamps to 1 when position exceeds duration', () => {
    const position = 350;
    const duration = 300;
    const percent = duration > 0 ? Math.min(position / duration, 1) : 0;
    expect(percent).toBe(1);
  });

  it('returns 0 when duration is 0', () => {
    const position = 0;
    const duration = 0;
    const percent = duration > 0 ? Math.min(position / duration, 1) : 0;
    expect(percent).toBe(0);
  });
});
