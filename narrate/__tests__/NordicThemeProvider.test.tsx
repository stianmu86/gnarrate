import React from 'react';
import { Text } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { NordicThemeProvider, useNordicTheme } from '../components/NordicThemeProvider';
import { lightTheme, darkTheme } from '../constants/theme';

// Mock useColorScheme
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const useColorScheme = require('react-native/Libraries/Utilities/useColorScheme').default;

describe('NordicThemeProvider', () => {
  beforeEach(() => {
    useColorScheme.mockReturnValue('light');
  });

  it('defaults to light theme when system is light', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NordicThemeProvider>{children}</NordicThemeProvider>
    );

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    expect(result.current.theme).toEqual(lightTheme);
    expect(result.current.isDark).toBe(false);
  });

  it('uses dark theme when system is dark', () => {
    useColorScheme.mockReturnValue('dark');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NordicThemeProvider>{children}</NordicThemeProvider>
    );

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    expect(result.current.theme).toEqual(darkTheme);
    expect(result.current.isDark).toBe(true);
  });

  it('respects explicit light mode override', () => {
    useColorScheme.mockReturnValue('dark');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NordicThemeProvider mode="light">{children}</NordicThemeProvider>
    );

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    expect(result.current.theme).toEqual(lightTheme);
    expect(result.current.isDark).toBe(false);
    expect(result.current.mode).toBe('light');
  });

  it('respects explicit dark mode override', () => {
    useColorScheme.mockReturnValue('light');

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NordicThemeProvider mode="dark">{children}</NordicThemeProvider>
    );

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    expect(result.current.theme).toEqual(darkTheme);
    expect(result.current.isDark).toBe(true);
    expect(result.current.mode).toBe('dark');
  });
});
