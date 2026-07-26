import { NavLink, Outlet } from 'react-router';

const navItem = ({ isActive }: { isActive: boolean }) =>
  [
    'rounded-(--radius-pill) px-3 py-1.5 text-sm transition-colors',
    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:text-text',
  ].join(' ');

export function AppShell() {
  return (
    <div className="bg-bg text-text min-h-dvh">
      <a
        href="#main"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <header className="border-border bg-surface/85 sticky top-0 z-40 border-b backdrop-blur">
        <div className="mx-auto flex max-w-(--feed-width) items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="font-semibold tracking-tight">
            book<span className="text-muted"> to </span>feed
          </NavLink>
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink to="/" end className={navItem}>
              Library
            </NavLink>
            <NavLink to="/import" className={navItem}>
              Import
            </NavLink>
            <NavLink to="/settings" className={navItem}>
              Settings
            </NavLink>
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-(--feed-width) px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
