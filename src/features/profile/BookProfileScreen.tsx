import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getBook, getChapters, touchBook } from '~/core/db';
import type { BookRecord, ChapterRecord } from '~/core/db/schema';

/**
 * Minimal book profile: enough to prove an import worked and to reach a chapter.
 * The full profile — stats, highlights, friend graph — is #36.
 */
export function BookProfileScreen() {
  const { bookId } = useParams();
  const [book, setBook] = useState<BookRecord | undefined>();
  const [chapters, setChapters] = useState<ChapterRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!bookId) return;
    let cancelled = false;

    void (async () => {
      const [record, list] = await Promise.all([getBook(bookId), getChapters(bookId)]);
      if (cancelled) return;
      setBook(record);
      setChapters(list);
      setLoading(false);
      if (record) void touchBook(bookId);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  if (loading) return <p className="text-muted">Opening…</p>;

  if (!book) {
    return (
      <section className="border-border bg-surface rounded-(--radius-card) border p-6 shadow-(--shadow-card)">
        <h1 className="text-xl font-semibold tracking-tight">That book is not on this device</h1>
        <p className="text-muted mt-2">
          Books live only in the browser they were imported into, so a link cannot carry one with
          it. Import the same EPUB here and your reading position will come back with it.
        </p>
        <p className="mt-4">
          <Link className="text-accent underline underline-offset-2" to="/import">
            Import a book
          </Link>
        </p>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="border-border bg-surface rounded-(--radius-card) border p-5 shadow-(--shadow-card)">
        <h1 className="text-xl font-semibold tracking-tight">{book.title}</h1>
        <p className="text-muted">
          {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author'}
        </p>
        {book.description ? <p className="mt-3 text-sm">{book.description}</p> : null}
        <p className="text-muted mt-3 text-sm">
          {book.chapterCount} chapters · ~{Math.max(1, Math.round(book.charCount / 900))} min read
        </p>

        {book.fixedLayout ? (
          <p className="border-border bg-surface-2 text-muted mt-4 rounded-md border p-3 text-sm">
            This is a fixed-layout book — designed page by page, so the feed would not do it
            justice. Reader mode is coming in #44.
          </p>
        ) : null}
      </section>

      <section className="border-border bg-surface rounded-(--radius-card) border p-5 shadow-(--shadow-card)">
        <h2 className="text-muted text-sm font-semibold tracking-wide uppercase">Chapters</h2>
        <ol className="mt-3 flex flex-col">
          {chapters.map((chapter) => (
            <li key={chapter.index} className="border-border border-b last:border-b-0">
              <Link
                to={`/b/${book.bookId}/c/${chapter.index}`}
                className="hover:bg-surface-2 flex items-baseline justify-between gap-3 py-2.5"
              >
                <span className="truncate" style={{ paddingLeft: `${chapter.tocDepth * 0.75}rem` }}>
                  {chapter.title}
                </span>
                <span className="text-muted shrink-0 text-sm">
                  {Math.max(1, Math.round(chapter.readingSeconds / 60))} min
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
