import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryArchive } from '~/core/epub/archive';
import { importBook } from '~/core/epub/import';
import { closeDb, db, getBook, getChapters } from '~/core/db';
import { sha256 } from '~/core/hash';
import { extractBlocks } from '~/core/segment/blocks';
import { segmentChapter } from '~/core/segment/segment';
import { findPostForAnchor, remapToPosts, compareAnchors } from '~/core/segment/anchors';
import { getPosts, segmentBook } from '~/core/segment';
import { buildEpub } from '../fixtures/build';
import { DIALOGUE_CHAPTER, NONFICTION_CHAPTER, NOVEL_CHAPTER } from '../fixtures/prose';

const book = () =>
  buildEpub({
    title: 'The Quiet House',
    chapters: [
      { filename: 'ch1.xhtml', title: 'An Arrival', body: NOVEL_CHAPTER },
      { filename: 'ch2.xhtml', title: 'What the Neighbour Said', body: DIALOGUE_CHAPTER },
      { filename: 'ch3.xhtml', title: 'The Cost of Closing a House', body: NONFICTION_CHAPTER },
    ],
  });

async function importFixture() {
  const bytes = book();
  const bookId = await sha256(bytes);
  await importBook({
    bookId,
    fileSize: bytes.byteLength,
    archive: new MemoryArchive(bytes),
    yieldToUi: () => Promise.resolve(),
  });
  return bookId;
}

beforeEach(async () => {
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('book-to-feed');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(new Error('Could not reset the test database'));
  });
});

describe('segmentation during import', () => {
  it('writes posts for every chapter', async () => {
    const bookId = await importFixture();

    for (const chapter of await getChapters(bookId)) {
      const posts = await getPosts(bookId, chapter.index);
      expect(posts.length).toBeGreaterThan(0);
      expect(chapter.postCount).toBe(posts.length);
    }
  });

  it('stores posts in order with contiguous indexes', async () => {
    const bookId = await importFixture();
    const posts = await getPosts(bookId, 0);
    expect(posts.map((post) => post.postIndex)).toEqual(posts.map((_, index) => index));
  });

  it('opens the chapter with its heading as the first post', async () => {
    const bookId = await importFixture();
    const [first] = await getPosts(bookId, 0);
    expect(first).toMatchObject({ type: 'heading' });
  });
});

describe('re-segmenting', () => {
  it('replaces the previous posts rather than leaving stale ones behind', async () => {
    const bookId = await importFixture();
    const before = await getPosts(bookId, 2);

    const record = await getBook(bookId);
    // Roomy produces fewer, larger posts — the case where stale trailing posts
    // would survive a naive rewrite.
    await segmentBook(record!, { density: 'roomy' });
    const after = await getPosts(bookId, 2);

    expect(after.length).toBeLessThanOrEqual(before.length);
    expect(after.map((post) => post.postIndex)).toEqual(after.map((_, index) => index));

    const stored = await (await db()).getAll('posts');
    const chapter2 = stored.filter((post) => post.chapterIndex === 2);
    expect(chapter2).toHaveLength(after.length);
  });

  it('updates the chapter post counts', async () => {
    const bookId = await importFixture();
    const record = await getBook(bookId);
    await segmentBook(record!, { density: 'compact' });

    for (const chapter of await getChapters(bookId)) {
      expect(chapter.postCount).toBe((await getPosts(bookId, chapter.index)).length);
    }
  });
});

/**
 * The promise that makes improving the segmenter safe: reader data is anchored
 * to the source text, so re-segmentation moves which post contains it, never
 * which words it points at (ARCHITECTURE.md §6.4).
 */
describe('anchors survive a segmenter change', () => {
  const blocks = extractBlocks(NOVEL_CHAPTER);

  it('finds the post containing an anchor at any density', () => {
    const anchor = { blockIndex: 4, charOffset: 10 };

    for (const density of ['compact', 'normal', 'roomy'] as const) {
      const posts = segmentChapter(blocks, { density });
      const post = findPostForAnchor(posts, anchor);

      expect(post).toBeDefined();
      expect(compareAnchors(post!.anchor, anchor)).toBeLessThanOrEqual(0);
      expect(compareAnchors(post!.anchorEnd, anchor)).toBeGreaterThanOrEqual(0);
    }
  });

  it('lands every highlight on the same words after re-segmentation', () => {
    const before = segmentChapter(blocks, { density: 'normal' });
    const after = segmentChapter(blocks, { density: 'compact' });

    // One highlight per post, taken from where the reader would have made it.
    const highlights = before.map((post) => ({
      anchor: post.anchor,
      text: post.plainText.slice(0, 30),
    }));

    const { remapped, unmapped } = remapToPosts(highlights, after);
    expect(unmapped).toEqual([]);

    for (const { item, postIndex } of remapped) {
      const post = after[postIndex]!;
      // The words the highlight was made on are still inside the post it now
      // belongs to.
      if (item.text.trim()) expect(post.plainText).toContain(item.text.trim().slice(0, 20));
    }
  });

  it('places an anchor in a dropped block at the nearest earlier post', () => {
    const posts = segmentChapter(blocks);
    const beyond = { blockIndex: 9_999, charOffset: 0 };
    expect(findPostForAnchor(posts, beyond)).toBe(posts[posts.length - 1]);
  });

  it('reports nothing to remap when there are no posts', () => {
    expect(findPostForAnchor([], { blockIndex: 0, charOffset: 0 })).toBeUndefined();
  });
});
