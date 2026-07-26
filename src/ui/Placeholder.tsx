import type { ReactNode } from 'react';

interface PlaceholderProps {
  title: string;
  /** The issue that will replace this placeholder with the real screen. */
  issue: number;
  children?: ReactNode;
}

/**
 * Stand-in for a screen that has a route but no implementation yet.
 *
 * Every M0 route renders one of these so the shell, theming and navigation can
 * be verified end to end before any feature code exists.
 */
export function Placeholder({ title, issue, children }: PlaceholderProps) {
  return (
    <section className="border-border bg-surface rounded-(--radius-card) border p-6 shadow-(--shadow-card)">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      {children ? <div className="text-muted mt-2">{children}</div> : null}
      <p className="text-muted mt-4 text-sm">
        Not built yet — tracked in{' '}
        <a
          className="text-accent underline underline-offset-2"
          href={`https://github.com/xSakix/book-to-feed/issues/${issue}`}
        >
          #{issue}
        </a>
        .
      </p>
    </section>
  );
}
