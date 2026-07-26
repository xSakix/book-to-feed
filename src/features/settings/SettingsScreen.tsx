import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  useSettings,
  type ThemePreference,
} from '~/app/store/settings';

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'sepia', label: 'Sepia' },
];

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-border bg-surface rounded-(--radius-card) border p-5 shadow-(--shadow-card)">
      <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsScreen() {
  const theme = useSettings((s) => s.theme);
  const fontScale = useSettings((s) => s.fontScale);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const set = useSettings((s) => s.set);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>

      <Card title="Theme">
        <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
          {THEMES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => set('theme', value)}
              className={[
                'rounded-(--radius-pill) border px-4 py-2 text-sm transition-colors',
                theme === value
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-border bg-surface-2 hover:border-accent',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Typography">
        <label htmlFor="font-scale" className="block text-sm">
          Text size — {Math.round(fontScale * 100)}%
        </label>
        <input
          id="font-scale"
          type="range"
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={0.05}
          value={fontScale}
          onChange={(event) => set('fontScale', Number(event.target.value))}
          className="accent-accent mt-3 w-full"
        />
      </Card>

      <Card title="Motion">
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={reduceMotion}
            onChange={(event) => set('reduceMotion', event.target.checked)}
            className="accent-accent size-4"
          />
          Reduce motion
        </label>
        <p className="text-muted mt-2 text-sm">
          Your system setting is always honoured; this forces it on regardless.
        </p>
      </Card>

      <Card title="Your data">
        <p className="text-muted text-sm">
          Books, reading position, highlights and notes are stored only in this browser, on this
          device. Nothing is uploaded and there is no account.
        </p>
        <p className="text-muted mt-3 text-sm">
          Storage management and export land in{' '}
          <a
            className="text-accent underline underline-offset-2"
            href="https://github.com/xSakix/book-to-feed/issues/43"
          >
            #43
          </a>{' '}
          and{' '}
          <a
            className="text-accent underline underline-offset-2"
            href="https://github.com/xSakix/book-to-feed/issues/42"
          >
            #42
          </a>
          .
        </p>
      </Card>
    </div>
  );
}
