import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, type NordicTheme } from '@/constants/theme';

type ThemeMode = 'light' | 'dark' | 'system';

interface NordicThemeContextValue {
  theme: NordicTheme;
  mode: ThemeMode;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
}

const NordicThemeContext = createContext<NordicThemeContextValue>({
  theme: lightTheme,
  mode: 'system',
  isDark: false,
  setMode: () => {},
});

export function useNordicTheme() {
  return useContext(NordicThemeContext);
}

interface Props {
  children: React.ReactNode;
}

/**
 * NordicThemeProvider
 *
 * Default: system preference. User can override via Settings screen.
 * Stores mode in component state (could persist to AsyncStorage later).
 */
export function NordicThemeProvider({ children }: Props) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
  }, []);

  const value = useMemo(() => {
    const resolvedDark =
      mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

    return {
      theme: resolvedDark ? darkTheme : lightTheme,
      mode,
      isDark: resolvedDark,
      setMode,
    };
  }, [mode, systemScheme, setMode]);

  return (
    <NordicThemeContext.Provider value={value}>
      {children}
    </NordicThemeContext.Provider>
  );
}
