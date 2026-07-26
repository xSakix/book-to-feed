import { resolveTheme, useSettings, type Settings } from './store/settings';

const FONT_STACKS: Record<Settings['fontFamily'], string> = {
  serif: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
  sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  // Swapped for a self-hosted OpenDyslexic in M5 (#41); until then this at least
  // honours a face the reader has installed themselves.
  dyslexic: "'OpenDyslexic', 'Comic Sans MS', ui-sans-serif, system-ui, sans-serif",
};

function apply(settings: Settings, prefersDark: boolean): void {
  const root = document.documentElement;
  root.dataset['theme'] = resolveTheme(settings.theme, prefersDark);
  root.dataset['motion'] = settings.reduceMotion ? 'reduced' : 'full';
  root.style.setProperty('--font-scale', String(settings.fontScale));
  root.style.setProperty('--font-reading', FONT_STACKS[settings.fontFamily]);
}

/**
 * Applies theme settings to <html> and keeps them in sync.
 *
 * Called from main.tsx before the first render, so there is no flash of the
 * wrong theme — the CSP forbids the usual inline bootstrap script, and the app
 * is client-rendered, so this is both sufficient and the only option.
 */
export function startThemeSync(): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  apply(useSettings.getState(), media.matches);

  const unsubscribe = useSettings.subscribe((state) => apply(state, media.matches));
  const onSystemChange = (event: MediaQueryListEvent) =>
    apply(useSettings.getState(), event.matches);
  media.addEventListener('change', onSystemChange);

  return () => {
    unsubscribe();
    media.removeEventListener('change', onSystemChange);
  };
}
