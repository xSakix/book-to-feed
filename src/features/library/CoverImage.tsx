import { useEffect, useState } from 'react';
import { getResource } from '~/core/db';
import type { BookRecord } from '~/core/db/schema';

/**
 * Renders a stored cover.
 *
 * The Blob URL is minted on mount and revoked on unmount — an unreleased one is
 * a memory leak, which matters much more once the feed is scrolling hundreds of
 * illustrated posts (#31).
 */
export function CoverImage({ book }: { book: BookRecord }) {
  const [url, setUrl] = useState<string>();

  useEffect(() => {
    if (!book.coverPath) return;

    let objectUrl: string | undefined;
    let cancelled = false;

    void getResource(book.bookId, book.coverPath).then((resource) => {
      if (cancelled || !resource) return;
      objectUrl = URL.createObjectURL(resource.blob);
      setUrl(objectUrl);
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [book.bookId, book.coverPath]);

  if (url) {
    return (
      <img src={url} alt="" className="bg-surface-2 h-28 w-20 shrink-0 rounded-md object-cover" />
    );
  }

  // Deterministic placeholder: the same book always gets the same face.
  return (
    <div
      aria-hidden="true"
      className="bg-surface-2 text-muted flex h-28 w-20 shrink-0 items-center justify-center rounded-md text-2xl font-semibold"
    >
      {book.title.slice(0, 1).toUpperCase()}
    </div>
  );
}
