import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemePreference = 'system' | 'light' | 'dark' | 'sepia';
export type ResolvedTheme = 'light' | 'dark' | 'sepia';
export type PostDensity = 'compact' | 'normal' | 'roomy';
export type ReadingMode = 'feed' | 'reader';

export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 2;

export interface Settings {
  theme: ThemePreference;
  /** 0.8–2.0, applied to the root font size. */
  fontScale: number;
  fontFamily: 'serif' | 'sans' | 'dyslexic';
  /** Segmentation budget preset. Changing this re-segments the open book (#25). */
  postDensity: PostDensity;
  /** Force-reduce motion even when the OS does not ask for it. */
  reduceMotion: boolean;
  /** Which mode a chapter opens in. */
  defaultReadingMode: ReadingMode;
  /** Chapter titles are themselves a spoiler in some books (ARCHITECTURE.md §13.7). */
  blurUnreadTitles: boolean;
}

export interface SettingsStore extends Settings {
  // Declared as properties rather than methods so they stay safe to pull out of
  // the store with a selector.
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  reset: () => void;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontScale: 1,
  fontFamily: 'serif',
  postDensity: 'normal',
  reduceMotion: false,
  defaultReadingMode: 'feed',
  blurUnreadTitles: true,
};

const clampFontScale = (value: number): number =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, value));

/**
 * Persisted to localStorage for now. Settings move into the IndexedDB `settings`
 * store when the storage layer lands (#15) — this store is the only thing that
 * has to change when they do.
 */
export const useSettings = create<SettingsStore>()(
  persist(
    (setState) => ({
      ...DEFAULT_SETTINGS,
      set: (key, value) =>
        setState({ [key]: key === 'fontScale' ? clampFontScale(value as number) : value } as Pick<
          Settings,
          typeof key
        >),
      reset: () => setState({ ...DEFAULT_SETTINGS }),
    }),
    { name: 'book-to-feed:settings', version: 1 },
  ),
);

/** Resolves `system` against the OS preference. Sepia is never a system value. */
export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean = typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-color-scheme: dark)').matches === true,
): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}
