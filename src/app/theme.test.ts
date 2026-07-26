import { afterEach, describe, expect, it, vi } from 'vitest';
import { startThemeSync } from './theme';
import { useSettings } from './store/settings';

/** Lets a test drive `prefers-color-scheme` and fire changes at listeners. */
function mockPrefersDark(matches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) =>
      listeners.delete(listener),
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;

  return (next: boolean) => {
    for (const listener of listeners) listener({ matches: next } as MediaQueryListEvent);
  };
}

afterEach(() => {
  useSettings.getState().reset();
  vi.restoreAllMocks();
});

describe('startThemeSync', () => {
  it('resolves the system preference onto the document', () => {
    mockPrefersDark(true);
    const stop = startThemeSync();

    expect(document.documentElement.dataset['theme']).toBe('dark');
    stop();
  });

  it('reacts to a settings change', () => {
    mockPrefersDark(false);
    const stop = startThemeSync();
    expect(document.documentElement.dataset['theme']).toBe('light');

    useSettings.getState().set('theme', 'sepia');
    expect(document.documentElement.dataset['theme']).toBe('sepia');

    stop();
  });

  it('reacts to the OS changing while set to system', () => {
    const emit = mockPrefersDark(false);
    const stop = startThemeSync();
    expect(document.documentElement.dataset['theme']).toBe('light');

    emit(true);
    expect(document.documentElement.dataset['theme']).toBe('dark');

    stop();
  });

  it('applies the font scale and motion preference', () => {
    mockPrefersDark(false);
    const stop = startThemeSync();

    useSettings.getState().set('fontScale', 1.5);
    useSettings.getState().set('reduceMotion', true);

    expect(document.documentElement.style.getPropertyValue('--font-scale')).toBe('1.5');
    expect(document.documentElement.dataset['motion']).toBe('reduced');

    stop();
  });

  it('stops applying changes once torn down', () => {
    mockPrefersDark(false);
    const stop = startThemeSync();
    stop();

    useSettings.getState().set('theme', 'dark');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
