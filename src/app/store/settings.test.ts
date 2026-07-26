import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  resolveTheme,
  useSettings,
} from './settings';

describe('resolveTheme', () => {
  it('follows the OS when set to system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('ignores the OS when a theme is chosen explicitly', () => {
    expect(resolveTheme('sepia', true)).toBe('sepia');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('settings store', () => {
  beforeEach(() => {
    useSettings.getState().reset();
  });

  it('starts from the documented defaults', () => {
    const { theme, fontScale, postDensity, blurUnreadTitles } = useSettings.getState();
    expect({ theme, fontScale, postDensity, blurUnreadTitles }).toEqual({
      theme: DEFAULT_SETTINGS.theme,
      fontScale: DEFAULT_SETTINGS.fontScale,
      postDensity: DEFAULT_SETTINGS.postDensity,
      blurUnreadTitles: DEFAULT_SETTINGS.blurUnreadTitles,
    });
  });

  it('updates a single setting without disturbing the rest', () => {
    useSettings.getState().set('theme', 'sepia');
    expect(useSettings.getState().theme).toBe('sepia');
    expect(useSettings.getState().fontScale).toBe(DEFAULT_SETTINGS.fontScale);
  });

  it('clamps the font scale to the readable range', () => {
    useSettings.getState().set('fontScale', 5);
    expect(useSettings.getState().fontScale).toBe(FONT_SCALE_MAX);

    useSettings.getState().set('fontScale', 0.1);
    expect(useSettings.getState().fontScale).toBe(FONT_SCALE_MIN);
  });
});
