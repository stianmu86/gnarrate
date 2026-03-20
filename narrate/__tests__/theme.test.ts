import { palette, lightTheme, darkTheme } from '../constants/theme';

describe('Nordic Earth palette', () => {
  it('should never use pure black or pure white for backgrounds', () => {
    expect(lightTheme.background).not.toBe('#000000');
    expect(lightTheme.background).not.toBe('#FFFFFF');
    expect(darkTheme.background).not.toBe('#000000');
    expect(darkTheme.background).not.toBe('#FFFFFF');
  });

  it('light background is Linen (#F7F3F0)', () => {
    expect(lightTheme.background).toBe('#F7F3F0');
  });

  it('dark background is Night Forest (#1B1D1C)', () => {
    expect(darkTheme.background).toBe('#1B1D1C');
  });

  it('light accent is Terracotta (#C67B5C)', () => {
    expect(lightTheme.accent).toBe('#C67B5C');
  });

  it('dark accent is Amber (#D4A373) — NOT Terracotta', () => {
    expect(darkTheme.accent).toBe('#D4A373');
    expect(darkTheme.accent).not.toBe(palette.terracotta);
  });

  it('light and dark themes have the same shape', () => {
    const lightKeys = Object.keys(lightTheme).sort();
    const darkKeys = Object.keys(darkTheme).sort();
    expect(lightKeys).toEqual(darkKeys);
  });

  it('all palette values are valid hex colours', () => {
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    for (const [key, value] of Object.entries(palette)) {
      expect(value).toMatch(hexRegex);
    }
  });
});
