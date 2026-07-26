import { Link, isRouteErrorResponse, useRouteError } from 'react-router';

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error) ?? 'Unknown error';
}

export function NotFoundScreen() {
  const error = useRouteError();

  return (
    <section className="border-border bg-surface rounded-(--radius-card) border p-6 shadow-(--shadow-card)">
      <h1 className="text-xl font-semibold tracking-tight">Nothing here</h1>
      <p className="text-muted mt-2">
        That page does not exist. If you followed a link to a book, remember that books live only in
        the browser they were imported into — a link cannot carry one with it.
      </p>
      {error ? (
        <pre className="bg-surface-2 mt-4 overflow-x-auto rounded-md p-3 font-mono text-xs">
          {describe(error)}
        </pre>
      ) : null}
      <p className="mt-4">
        <Link className="text-accent underline underline-offset-2" to="/">
          Back to your library
        </Link>
      </p>
    </section>
  );
}
