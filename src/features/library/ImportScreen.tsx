import { useCallback, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { phaseLabel, useImport } from './useImport';

export function ImportScreen() {
  const { state, start, reset } = useImport();
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const accept = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) void start(file);
    },
    [start],
  );

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files);
  };

  if (state.status === 'working') {
    const { progress } = state;
    const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

    return (
      <section className="border-border bg-surface rounded-(--radius-card) border p-6 shadow-(--shadow-card)">
        <h1 className="text-xl font-semibold tracking-tight">{state.fileName}</h1>
        <p className="text-muted mt-1" aria-live="polite">
          {phaseLabel(progress)}
        </p>

        <div
          className="bg-surface-2 mt-5 h-2 overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Import progress"
        >
          <div
            className="bg-accent h-full rounded-full transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>

        <p className="text-muted mt-4 text-sm">
          This is happening in your browser. The file is not being uploaded.
        </p>
      </section>
    );
  }

  if (state.status === 'done') {
    return (
      <section className="border-border bg-surface rounded-(--radius-card) border p-6 shadow-(--shadow-card)">
        <h1 className="text-xl font-semibold tracking-tight">
          {state.alreadyPresent ? 'Already in your library' : 'Your feed is ready'}
        </h1>
        <p className="text-muted mt-2">
          {state.alreadyPresent
            ? `${state.title} was already here, with your reading progress intact.`
            : `${state.title} is ready to read.`}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void navigate(`/b/${state.bookId}`)}
            className="bg-accent text-accent-contrast rounded-(--radius-pill) px-4 py-2 text-sm font-medium"
          >
            Open {state.title}
          </button>
          <button
            type="button"
            onClick={reset}
            className="border-border rounded-(--radius-pill) border px-4 py-2 text-sm"
          >
            Import another
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state.status === 'error' ? (
        <div
          role="alert"
          className="border-danger/40 bg-danger/10 rounded-(--radius-card) border p-4"
        >
          <p className="font-medium">{state.message}</p>
          {state.detail ? <p className="text-muted mt-1 text-sm">{state.detail}</p> : null}
        </div>
      ) : null}

      <section
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={[
          'rounded-(--radius-card) border-2 border-dashed p-10 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft' : 'border-border bg-surface',
        ].join(' ')}
      >
        <h1 className="text-xl font-semibold tracking-tight">Import a book</h1>
        <p className="text-muted mx-auto mt-2 max-w-sm">
          Drop an EPUB here, or choose one. It is unzipped and turned into a feed in this browser —
          the file never crosses the network.
        </p>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="bg-accent text-accent-contrast mt-5 rounded-(--radius-pill) px-5 py-2.5 text-sm font-medium"
        >
          Choose an EPUB
        </button>

        <input
          ref={inputRef}
          type="file"
          accept=".epub,application/epub+zip"
          className="sr-only"
          aria-label="Choose an EPUB file"
          onChange={(event) => accept(event.target.files)}
        />
      </section>

      <p className="text-muted text-center text-sm">
        Already have books here?{' '}
        <Link className="text-accent underline underline-offset-2" to="/">
          Go to your library
        </Link>
      </p>
    </div>
  );
}
