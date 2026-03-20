import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, type NordicTheme } from '@/constants/theme';

type ThemeMode = 'light' | 'dark' | 'system';

interface NordicThemeContextValue {
  theme: NordicTheme;
  mode: ThemeMode;
  isDark: boolean;
}

const NordicThemeContext = createContext<NordicThemeContextValue>({
  theme: lightTheme,
  mode: 'system',
  isDark: false,
});

export function useNordicTheme() {
  return useContext(NordicThemeContext);
}

interface Props {
  mode?: ThemeMode;
  children: React.ReactNode;
}

/**
 * NordicThemeProvider
 *
 * Default: Light mode. Respects system preference when mode='system'.
 * Manual override via Settings screen (pass mode='light' or 'dark').
 */
export function NordicThemeProvider({ mode = 'system', children }: Props) {
  const systemScheme = useColorScheme();

  const value = useMemo(() => {
    const resolvedDark =
      mode === 'system' ? systemScheme === 'dark' : mode === 'dark';

    return {
      theme: resolvedDark ? darkTheme : lightTheme,
      mode,
      isDark: resolvedDark,
    };
  }, [mode, systemScheme]);

  return (
    <NordicThemeContext.Provider value={value}>
      {children}
    </NordicThemeContext.Provider>
  );
}
