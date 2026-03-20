/**
 * Narrate — Nordic Earth Design System
 * From the Visual Identity Manual v1.1
 *
 * RULE: NEVER use #000000 or #FFFFFF as backgrounds.
 * Light bg: Linen (#F7F3F0)  |  Dark bg: Night Forest (#1B1D1C)
 * Light accent: Terracotta (#C67B5C)  |  Dark accent: Amber (#D4A373)
 */

export const palette = {
  // Light Mode — Linen & Oak
  linen: '#F7F3F0',
  alabaster: '#FFFFFF',
  charcoal: '#2D2926',
  stone: '#8E8883',
  terracotta: '#C67B5C',
  fjord: '#4A6070',
  birch: '#EAE2D9',

  // Dark Mode — Midnight Cabin
  nightForest: '#1B1D1C',
  smokedOak: '#262928',
  sand: '#D6CFC7',
  moss: '#70736A',
  amber: '#D4A373',
  darkBirch: '#2D312F',
  fjordDark: '#6A8A9A',
} as const;

export const lightTheme = {
  background: palette.linen,
  surface: palette.alabaster,
  textPrimary: palette.charcoal,
  textSecondary: palette.stone,
  accent: palette.terracotta,
  accentSecondary: palette.fjord,
  border: palette.birch,
} as const;

export const darkTheme = {
  background: palette.nightForest,
  surface: palette.smokedOak,
  textPrimary: palette.sand,
  textSecondary: palette.moss,
  accent: palette.amber,
  accentSecondary: palette.fjordDark,
  border: palette.darkBirch,
} as const;

export type NordicTheme = typeof lightTheme;
