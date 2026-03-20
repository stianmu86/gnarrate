import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
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

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <NordicThemeProvider>{children}</NordicThemeProvider>
  );

  it('defaults to system mode with light theme when system is light', () => {
    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    expect(result.current.theme).toEqual(lightTheme);
    expect(result.current.isDark).toBe(false);
    expect(result.current.mode).toBe('system');
  });

  it('uses dark theme when system is dark', () => {
    useColorScheme.mockReturnValue('dark');

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    expect(result.current.theme).toEqual(darkTheme);
    expect(result.current.isDark).toBe(true);
  });

  it('setMode to dark overrides system light', () => {
    useColorScheme.mockReturnValue('light');

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    act(() => {
      result.current.setMode('dark');
    });

    expect(result.current.theme).toEqual(darkTheme);
    expect(result.current.isDark).toBe(true);
    expect(result.current.mode).toBe('dark');
  });

  it('setMode to light overrides system dark', () => {
    useColorScheme.mockReturnValue('dark');

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    // Initially dark from system
    expect(result.current.isDark).toBe(true);

    act(() => {
      result.current.setMode('light');
    });

    expect(result.current.theme).toEqual(lightTheme);
    expect(result.current.isDark).toBe(false);
    expect(result.current.mode).toBe('light');
  });

  it('setMode to system restores system preference', () => {
    useColorScheme.mockReturnValue('dark');

    const { result } = renderHook(() => useNordicTheme(), { wrapper });

    // Override to light
    act(() => {
      result.current.setMode('light');
    });
    expect(result.current.isDark).toBe(false);

    // Back to system (which is dark)
    act(() => {
      result.current.setMode('system');
    });
    expect(result.current.isDark).toBe(true);
    expect(result.current.mode).toBe('system');
  });
});
