import { db, getChapters, getChapter } from '~/core/db';
import { SEGMENTER_VERSION, type BookRecord, type ChapterRecord } from '~/core/db/schema';
import type { PostDensity } from '~/app/store/settings';
import { extractBlocks } from './blocks';
import { segmentChapter, type Post } from './segment';

export * from './blocks';
export * from './segment';
export * from './anchors';
export * from './sentences';

/** Segments one stored chapter. Pure with respect to the database. */
export function postsForChapter(
  chapter: Pick<ChapterRecord, 'html'>,
  options: { density?: PostDensity; locale?: string } = {},
): Post[] {
  return segmentChapter(extractBlocks(chapter.html), options);
}

/**
 * Segments a whole book and stores its posts.
 *
 * Runs after import, and again whenever the segmenter version or the reader's
 * density setting changes. Reader data is not touched: it is anchored to the
 * source text, so it simply resolves into whichever new post now contains it
 * (#25).
 */
export async function segmentBook(
  book: BookRecord,
  options: { density?: PostDensity; onProgress?: (current: number, total: number) => void } = {},
): Promise<number> {
  const chapters = await getChapters(book.bookId);
  const database = await db();
  let total = 0;

  for (const [position, chapter] of chapters.entries()) {
    const posts = postsForChapter(chapter, {
      ...(options.density !== undefined ? { density: options.density } : {}),
      locale: book.language,
    });

    const tx = database.transaction(['posts', 'chapters'], 'readwrite');
    const store = tx.objectStore('posts');

    // Clear this chapter's previous posts before writing: a shorter
    // re-segmentation would otherwise leave stale trailing posts behind.
    let cursor = await store.openCursor(
      IDBKeyRange.bound(
        [book.bookId, chapter.index, -Infinity],
        [book.bookId, chapter.index, Infinity],
      ),
    );
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    for (const post of posts) {
      await store.put({
        bookId: book.bookId,
        chapterIndex: chapter.index,
        postIndex: post.index,
        type: post.type,
        html: post.html,
        plainText: post.plainText,
        anchor: post.anchor,
        anchorEnd: post.anchorEnd,
        charCount: post.charCount,
        readingSeconds: post.readingSeconds,
        isContinuation: post.isContinuation,
        pullQuote: post.pullQuote,
        segmenterVersion: SEGMENTER_VERSION,
      });
    }

    await tx.objectStore('chapters').put({ ...chapter, postCount: posts.length });
    await tx.done;

    total += posts.length;
    options.onProgress?.(position + 1, chapters.length);
  }

  await database.put('books', { ...book, segmenterVersion: SEGMENTER_VERSION });
  return total;
}

/** Reads a chapter's stored posts in order. */
export async function getPosts(bookId: string, chapterIndex: number) {
  const posts = await (
    await db()
  ).getAllFromIndex('posts', 'by-chapter', IDBKeyRange.only([bookId, chapterIndex]));
  return posts.sort((a, b) => a.postIndex - b.postIndex);
}

/** True when a book's stored posts were produced by an older segmenter. */
export function needsResegmentation(book: BookRecord): boolean {
  return book.segmenterVersion !== SEGMENTER_VERSION;
}

/** Re-segments a chapter without storing, for previewing a density change. */
export async function previewChapter(
  bookId: string,
  chapterIndex: number,
  density: PostDensity,
): Promise<Post[]> {
  const chapter = await getChapter(bookId, chapterIndex);
  return chapter ? postsForChapter(chapter, { density }) : [];
}
