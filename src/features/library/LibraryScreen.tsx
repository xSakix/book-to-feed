import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { deleteBook, listBooks } from '~/core/db';
import type { BookRecord } from '~/core/db/schema';
import { CoverImage } from './CoverImage';

export function LibraryScreen() {
  const [books, setBooks] = useState<BookRecord[] | undefined>();

  useEffect(() => {
    void listBooks().then(setBooks);
  }, []);

  const remove = async (bookId: string) => {
    await deleteBook(bookId);
    setBooks(await listBooks());
  };

  if (books === undefined) {
    return <p className="text-muted">Opening your library…</p>;
  }

  if (books.length === 0) {
    return (
      <section className="border-border bg-surface rounded-(--radius-card) border p-8 text-center shadow-(--shadow-card)">
        <h1 className="text-xl font-semibold tracking-tight">Nothing here yet</h1>
        <p className="text-muted mx-auto mt-2 max-w-sm">
          Import an EPUB and read it as a feed — one chapter at a time, one post at a time. Your
          books stay on this device.
        </p>
        <Link
          to="/import"
          className="bg-accent text-accent-contrast mt-5 inline-block rounded-(--radius-pill) px-5 py-2.5 text-sm font-medium"
        >
          Import a book
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Your library</h1>
        <Link className="text-accent text-sm underline underline-offset-2" to="/import">
          Import
        </Link>
      </div>

      <ul className="flex flex-col gap-3">
        {books.map((book) => (
          <li
            key={book.bookId}
            className="border-border bg-surface rounded-(--radius-card) border shadow-(--shadow-card)"
          >
            <div className="flex gap-4 p-4">
              <CoverImage book={book} />

              <div className="min-w-0 flex-1">
                <Link to={`/b/${book.bookId}`} className="block">
                  <h2 className="truncate font-semibold">{book.title}</h2>
                  <p className="text-muted truncate text-sm">
                    {book.authors.length > 0 ? book.authors.join(', ') : 'Unknown author'}
                  </p>
                </Link>

                <p className="text-muted mt-2 text-sm">
                  {book.chapterCount} chapters · ~{Math.max(1, Math.round(book.charCount / 900))}{' '}
                  min read
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    to={`/b/${book.bookId}/c/0`}
                    className="bg-accent text-accent-contrast rounded-(--radius-pill) px-3 py-1.5 text-sm font-medium"
                  >
                    Start reading
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remove(book.bookId)}
                    className="border-border text-muted rounded-(--radius-pill) border px-3 py-1.5 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
