/**
 * Root layout — NordicThemeProvider, Auth guard, TanStack Query.
 *
 * Auth guard: if no session, redirect to /(auth)/login.
 * explore.tsx and item/[id].tsx support unauthenticated guest access
 * for public narrations.
 */
import '../global.css';

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { NordicThemeProvider, useNordicTheme } from '@/components/NordicThemeProvider';
import { AuthProvider, useAuth } from '@/lib/auth';

export {
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

const queryClient = new QueryClient();

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Newsreader: require('../assets/fonts/Newsreader-Regular.ttf'),
    'Newsreader-Italic': require('../assets/fonts/Newsreader-Italic.ttf'),
    Inter: require('../assets/fonts/Inter-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NordicThemeProvider>
          <RootLayoutNav />
        </NordicThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { theme } = useNordicTheme();
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inPublicRoute =
      segments[0] === 'item' || // item/[id] supports guest access
      (segments[0] === '(tabs)' && segments[1] === 'explore'); // explore supports guest access

    if (!session && !inAuthGroup && !inPublicRoute) {
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  const navTheme = colorScheme === 'dark' ? DarkTheme : DefaultTheme;
  // Override nav theme backgrounds with Nordic palette
  const nordicNavTheme = {
    ...navTheme,
    colors: {
      ...navTheme.colors,
      background: theme.background,
      card: theme.surface,
      text: theme.textPrimary,
      border: theme.border,
      primary: theme.accent,
    },
  };

  return (
    <ThemeProvider value={nordicNavTheme}>
      <Stack>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="item/[id]"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen
          name="add"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen name="paywall" options={{ headerShown: false, presentation: 'modal' }} />
        <Stack.Screen name="settings" options={{ headerShown: false }} />
        <Stack.Screen name="downloads" options={{ headerShown: false }} />
      </Stack>
    </ThemeProvider>
  );
}
