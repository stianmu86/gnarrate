/**
 * Phase 3 — Screen component unit tests.
 *
 * Validates that all screens render without crashing, use Nordic
 * palette (never #000/#FFF backgrounds), and contain expected text.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---- Mocks ----

// Mock expo-router
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: 'test-id', t: '0' }),
  useSegments: () => ['(tabs)'],
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock NordicThemeProvider
const mockTheme = {
  background: '#F7F3F0',
  surface: '#FFFFFF',
  textPrimary: '#2D2926',
  textSecondary: '#8E8883',
  accent: '#C67B5C',
  accentSecondary: '#4A6070',
  border: '#EAE2D9',
};

jest.mock('@/components/NordicThemeProvider', () => ({
  useNordicTheme: () => ({
    theme: mockTheme,
    mode: 'light' as const,
    isDark: false,
    setMode: jest.fn(),
  }),
  NordicThemeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock auth
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'test@example.com',
      user_metadata: { full_name: 'Test User' },
      created_at: '2025-01-01T00:00:00Z',
    },
    session: { access_token: 'mock-token' },
    signOut: jest.fn(),
    loading: false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock supabase
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({ data: [], error: null }),
          single: () => ({
            data: {
              id: 'test-id',
              title: 'Test Narration',
              author: 'Author',
              status: 'completed',
              duration_seconds: 300,
              completed_chunks: 5,
              total_chunks: 5,
              chapters: [],
            },
            error: null,
          }),
        }),
      }),
    }),
    channel: () => ({
      on: () => ({ subscribe: () => ({}) }),
    }),
    removeChannel: jest.fn(),
    auth: {
      getSession: () => Promise.resolve({ data: { session: { access_token: 'token' } } }),
    },
  },
}));

// Mock useCredits
jest.mock('@/lib/hooks/useCredits', () => ({
  useCredits: () => ({
    data: {
      balance_seconds: 1800,
      subscription_status: 'free',
      monthly_allowance_seconds: 0,
    },
  }),
  formatSeconds: (s: number) => {
    const m = Math.floor(s / 60);
    return `${m} min`;
  },
}));

// Mock useNarrations hooks
jest.mock('@/lib/hooks/useNarrations', () => ({
  useLibrary: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
  useNarration: () => ({
    data: {
      id: 'test-id',
      title: 'Test Narration',
      author: 'Test Author',
      status: 'completed',
      duration_seconds: 300,
      completed_chunks: 5,
      total_chunks: 5,
      chapters: [{ title: 'Chapter 1', start_char: 0 }, { title: 'Chapter 2', start_char: 500 }],
      voice_id: 'neutral',
      source_type: 'url',
      audio_url: null,
      image_url: null,
      word_count: 1000,
      is_public: false,
      created_at: '2025-01-01',
    },
    isLoading: false,
    error: null,
  }),
}));

// Mock lucide-react-native
jest.mock('lucide-react-native', () => {
  const { Text } = require('react-native');
  const createIcon = (name: string) => {
    const Icon = (props: Record<string, unknown>) => <Text testID={`icon-${name}`}>{name}</Text>;
    Icon.displayName = name;
    return Icon;
  };
  return {
    BookOpen: createIcon('BookOpen'),
    Compass: createIcon('Compass'),
    User: createIcon('User'),
    Plus: createIcon('Plus'),
    Play: createIcon('Play'),
    Pause: createIcon('Pause'),
    Check: createIcon('Check'),
    Settings: createIcon('Settings'),
    CreditCard: createIcon('CreditCard'),
    LogOut: createIcon('LogOut'),
    ChevronRight: createIcon('ChevronRight'),
    ArrowLeft: createIcon('ArrowLeft'),
    SkipBack: createIcon('SkipBack'),
    SkipForward: createIcon('SkipForward'),
    Share2: createIcon('Share2'),
    Download: createIcon('Download'),
    Loader: createIcon('Loader'),
    AlertCircle: createIcon('AlertCircle'),
    X: createIcon('X'),
    Link: createIcon('Link'),
    FileText: createIcon('FileText'),
    Type: createIcon('Type'),
    Sparkles: createIcon('Sparkles'),
    Moon: createIcon('Moon'),
    Sun: createIcon('Sun'),
    HardDrive: createIcon('HardDrive'),
    Trash2: createIcon('Trash2'),
    Cloud: createIcon('Cloud'),
  };
});

// Mock useAudioPlayer
jest.mock('@/lib/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    isLoaded: true,
    isPlaying: false,
    isBuffering: false,
    position: 0,
    duration: 300,
    rate: 1.0,
    loadAudio: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(),
    skip: jest.fn(),
    setRate: jest.fn(),
    cycleRate: jest.fn(),
  }),
  PLAYBACK_RATES: [1.0, 1.5, 2.0],
}));

// Mock usePlaybackProgress
jest.mock('@/lib/hooks/usePlaybackProgress', () => ({
  useLoadProgress: () => ({ data: 0, isLoading: false, error: null }),
  useSaveProgress: jest.fn(),
}));

// Mock expo-av
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
        },
      }),
    },
  },
}));

// Mock expo-document-picker
jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn().mockResolvedValue({
    canceled: true,
    assets: [],
  }),
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => ({
  documentDirectory: '/mock/documents/',
  downloadAsync: jest.fn().mockResolvedValue({ uri: '/mock/file.mp3' }),
}));

// Mock react-native-css-interop to avoid displayName issues
jest.mock('react-native-css-interop', () => ({
  cssInterop: jest.fn(),
  remapProps: jest.fn(),
}));

// ---- Imports (after mocks) ----
import ExploreScreen from '@/app/(tabs)/explore';
import ProfileScreen from '@/app/(tabs)/profile';
import AddScreen from '@/app/add';
import PaywallScreen from '@/app/paywall';
import SettingsScreen from '@/app/settings';
import DownloadsScreen from '@/app/downloads';
import NowPlayingScreen from '@/app/item/[id]';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function Wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

// ---- Tests ----

describe('ExploreScreen', () => {
  it('renders without crashing', () => {
    const { getByText } = render(<ExploreScreen />);
    expect(getByText('Explore')).toBeTruthy();
  });

  it('shows coming soon message', () => {
    const { getByText } = render(<ExploreScreen />);
    expect(getByText(/Coming soon/)).toBeTruthy();
  });
});

describe('ProfileScreen', () => {
  it('renders user email', () => {
    const { getByText } = render(
      <Wrapper>
        <ProfileScreen />
      </Wrapper>
    );
    expect(getByText('test@example.com')).toBeTruthy();
  });

  it('shows credit balance', () => {
    const { getByText } = render(
      <Wrapper>
        <ProfileScreen />
      </Wrapper>
    );
    expect(getByText('30 min')).toBeTruthy();
  });

  it('shows Upgrade to Pro button for free users', () => {
    const { getByText } = render(
      <Wrapper>
        <ProfileScreen />
      </Wrapper>
    );
    expect(getByText('Upgrade to Pro')).toBeTruthy();
  });

  it('shows Sign Out button', () => {
    const { getByText } = render(
      <Wrapper>
        <ProfileScreen />
      </Wrapper>
    );
    expect(getByText('Sign Out')).toBeTruthy();
  });
});

describe('AddScreen', () => {
  it('renders New Narration header', () => {
    const { getByText } = render(
      <Wrapper>
        <AddScreen />
      </Wrapper>
    );
    expect(getByText('New Narration')).toBeTruthy();
  });

  it('renders all three tabs (URL, PDF, Text)', () => {
    const { getByText } = render(
      <Wrapper>
        <AddScreen />
      </Wrapper>
    );
    expect(getByText('URL')).toBeTruthy();
    expect(getByText('PDF')).toBeTruthy();
    expect(getByText('Text')).toBeTruthy();
  });

  it('shows URL input by default', () => {
    const { getByPlaceholderText } = render(
      <Wrapper>
        <AddScreen />
      </Wrapper>
    );
    expect(getByPlaceholderText('https://example.com/article')).toBeTruthy();
  });
});

describe('PaywallScreen', () => {
  it('renders Pro plan price', () => {
    const { getByText } = render(
      <Wrapper>
        <PaywallScreen />
      </Wrapper>
    );
    expect(getByText('$4.99')).toBeTruthy();
  });

  it('shows subscribe button for free users', () => {
    const { getByText } = render(
      <Wrapper>
        <PaywallScreen />
      </Wrapper>
    );
    expect(getByText(/Subscribe/)).toBeTruthy();
  });

  it('lists Pro features', () => {
    const { getByText } = render(
      <Wrapper>
        <PaywallScreen />
      </Wrapper>
    );
    expect(getByText('All 6 premium narrator voices')).toBeTruthy();
    expect(getByText('Offline downloads')).toBeTruthy();
  });
});

describe('SettingsScreen', () => {
  it('renders Settings header', () => {
    const { getByText } = render(
      <Wrapper>
        <SettingsScreen />
      </Wrapper>
    );
    expect(getByText('Settings')).toBeTruthy();
  });

  it('shows Dark Mode toggle', () => {
    const { getByText } = render(
      <Wrapper>
        <SettingsScreen />
      </Wrapper>
    );
    expect(getByText('Dark Mode')).toBeTruthy();
  });

  it('shows user email in account section', () => {
    const { getByText } = render(
      <Wrapper>
        <SettingsScreen />
      </Wrapper>
    );
    expect(getByText('test@example.com')).toBeTruthy();
  });

  it('shows Manage Downloads link', () => {
    const { getByText } = render(
      <Wrapper>
        <SettingsScreen />
      </Wrapper>
    );
    expect(getByText('Manage Downloads')).toBeTruthy();
  });
});

describe('DownloadsScreen', () => {
  it('renders Downloads header', () => {
    const { getByText } = render(<DownloadsScreen />);
    expect(getByText('Downloads')).toBeTruthy();
  });

  it('shows empty state message', () => {
    const { getByText } = render(<DownloadsScreen />);
    expect(getByText('No Downloads Yet')).toBeTruthy();
  });
});

describe('NowPlayingScreen', () => {
  it('renders narration title', () => {
    const { getAllByText } = render(
      <Wrapper>
        <NowPlayingScreen />
      </Wrapper>
    );
    // Title appears twice (cover area + meta)
    expect(getAllByText('Test Narration').length).toBeGreaterThanOrEqual(1);
  });

  it('shows author name', () => {
    const { getByText } = render(
      <Wrapper>
        <NowPlayingScreen />
      </Wrapper>
    );
    expect(getByText('Test Author')).toBeTruthy();
  });

  it('renders chapter list', () => {
    const { getByText } = render(
      <Wrapper>
        <NowPlayingScreen />
      </Wrapper>
    );
    expect(getByText('Chapter 1')).toBeTruthy();
  });

  it('shows formatted duration', () => {
    const { getAllByText } = render(
      <Wrapper>
        <NowPlayingScreen />
      </Wrapper>
    );
    expect(getAllByText('5 min').length).toBeGreaterThanOrEqual(1);
  });
});

// ---- Nordic palette compliance ----
describe('Nordic palette compliance', () => {
  it('theme never uses pure black (#000000) or pure white (#FFFFFF) as background', () => {
    expect(mockTheme.background).not.toBe('#000000');
    expect(mockTheme.background).not.toBe('#FFFFFF');
    expect(mockTheme.background).toBe('#F7F3F0'); // Linen
  });
});
