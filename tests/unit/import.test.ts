import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryArchive } from '~/core/epub/archive';
import { importBook, DrmProtectedError } from '~/core/epub/import';
import { EpubFormatError } from '~/core/epub/container';
import {
  getBook,
  getChapters,
  getResource,
  listBooks,
  closeDb,
  deleteBook,
  evictBookContent,
  db,
} from '~/core/db';
import { sha256 } from '~/core/hash';
import { buildEpub, simpleBook, TINY_PNG } from '../fixtures/build';

async function runImport(bytes: Uint8Array, overrides: { bookId?: string } = {}) {
  const bookId = overrides.bookId ?? (await sha256(bytes));
  return importBook({
    bookId,
    fileSize: bytes.byteLength,
    archive: new MemoryArchive(bytes),
    yieldToUi: () => Promise.resolve(),
  });
}

beforeEach(async () => {
  // fake-indexeddb keeps state between tests; start each one from empty. The
  // connection has to be closed first or deleteDatabase blocks forever.
  await closeDb();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('book-to-feed');
    request.onsuccess = () => resolve();
    request.onblocked = () => resolve();
    request.onerror = () => reject(new Error('Could not reset the test database'));
  });
});

describe('importing a book', () => {
  it('stores the book, its chapters and its cover', async () => {
    const bytes = buildEpub({
      title: 'The Quiet House',
      authors: ['Marta Kovac'],
      cover: { filename: 'cover.png', bytes: TINY_PNG },
      chapters: [
        {
          filename: 'ch1.xhtml',
          title: 'An Arrival',
          body: '<h1>An Arrival</h1><p>Hello there.</p>',
        },
        { filename: 'ch2.xhtml', title: 'The Second Night', body: '<p>Later that week.</p>' },
      ],
    });

    const result = await runImport(bytes);
    expect(result.alreadyPresent).toBe(false);
    expect(result.chapterCount).toBe(2);

    const book = await getBook(result.bookId);
    expect(book?.title).toBe('The Quiet House');
    expect(book?.authors).toEqual(['Marta Kovac']);
    expect(book?.coverPath).toBe('OEBPS/cover.png');
    expect(book?.fileSize).toBe(bytes.byteLength);

    // fake-indexeddb does not round-trip Blob instances — they come back as
    // plain objects — so the stored byte count is what can be asserted here.
    // Real Blob storage is covered by the browser e2e suite.
    const cover = await getResource(result.bookId, 'OEBPS/cover.png');
    expect(cover?.mediaType).toBe('image/png');
    expect(cover?.size).toBeGreaterThan(0);

    const chapters = await getChapters(result.bookId);
    expect(chapters.map((chapter) => chapter.title)).toEqual(['An Arrival', 'The Second Night']);
    expect(chapters[0]?.charCount).toBeGreaterThan(0);
    expect(chapters[0]?.readingSeconds).toBeGreaterThanOrEqual(3);
  });

  it('stores only sanitised chapter markup', async () => {
    const bytes = buildEpub({
      chapters: [
        {
          filename: 'ch1.xhtml',
          title: 'Hostile',
          body: '<p onclick="steal()">text</p><script>fetch("https://evil.test")</script>',
        },
      ],
    });

    const result = await runImport(bytes);
    const [chapter] = await getChapters(result.bookId);

    expect(chapter?.html).not.toContain('script');
    expect(chapter?.html).not.toContain('onclick');
    expect(chapter?.html).not.toContain('evil.test');
    expect(chapter?.html).toContain('text');
  });

  it('reports progress through every phase', async () => {
    const phases: string[] = [];
    const bytes = simpleBook();

    await importBook({
      bookId: await sha256(bytes),
      fileSize: bytes.byteLength,
      archive: new MemoryArchive(bytes),
      yieldToUi: () => Promise.resolve(),
      onProgress: (progress) => phases.push(progress.phase),
    });

    expect(phases).toContain('reading-metadata');
    expect(phases).toContain('reading-chapters');
    expect(phases).toContain('done');
  });

  it('falls back to the first heading when a chapter is missing from the TOC', async () => {
    const bytes = buildEpub({
      tocFormat: 'none',
      chapters: [
        { filename: 'ch1.xhtml', title: 'ignored', body: '<h1>A Real Heading</h1><p>x</p>' },
      ],
    });

    const result = await runImport(bytes);
    const [chapter] = await getChapters(result.bookId);
    expect(chapter?.title).toBe('A Real Heading');
  });
});

describe('re-importing', () => {
  it('is idempotent for the same bytes and keeps one library entry', async () => {
    const bytes = simpleBook();

    const first = await runImport(bytes);
    const second = await runImport(bytes);

    expect(second.alreadyPresent).toBe(true);
    expect(second.bookId).toBe(first.bookId);
    expect(await listBooks()).toHaveLength(1);
  });

  it('treats a different file as a different book', async () => {
    await runImport(simpleBook());
    await runImport(
      buildEpub({
        title: 'Another Book',
        chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>different</p>' }],
      }),
    );

    expect(await listBooks()).toHaveLength(2);
  });

  it('restores content after the book was evicted to free space', async () => {
    const bytes = simpleBook();
    const first = await runImport(bytes);

    await evictBookContent(first.bookId);
    expect(await getChapters(first.bookId)).toHaveLength(0);

    const again = await runImport(bytes);
    expect(again.alreadyPresent).toBe(false);
    expect(await getChapters(first.bookId)).toHaveLength(3);
  });
});

describe('refusing books we cannot read', () => {
  it('rejects a DRM-protected book without leaving a partial entry behind', async () => {
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
      extraFiles: { 'META-INF/rights.xml': '<rights/>' },
    });

    await expect(runImport(bytes)).rejects.toThrow(DrmProtectedError);
    expect(await listBooks()).toHaveLength(0);
  });

  it('rejects a file that is not an EPUB', async () => {
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
      omitContainer: true,
    });

    await expect(runImport(bytes)).rejects.toThrow(EpubFormatError);
    expect(await listBooks()).toHaveLength(0);
  });
});

describe('the chapter graph', () => {
  it('links spine neighbours and records mentions between chapters', async () => {
    const result = await runImport(simpleBook());
    const edges = await (await db()).getAll('edges');

    const sequential = edges.filter((edge) => edge.type === 'sequential');
    expect(sequential).toContainEqual(
      expect.objectContaining({ from: 0, to: 1, type: 'sequential' }),
    );
    // Adjacency runs both ways: chapter 2 is chapter 1's neighbour too.
    expect(sequential).toContainEqual(
      expect.objectContaining({ from: 1, to: 0, type: 'sequential' }),
    );

    // ch2 links to ch1, ch3 links to ch2.
    const mentions = edges.filter((edge) => edge.type === 'mentions');
    expect(mentions).toContainEqual(expect.objectContaining({ from: 1, to: 0 }));
    expect(mentions).toContainEqual(expect.objectContaining({ from: 2, to: 1 }));

    expect(result.chapterCount).toBe(3);
  });

  it('never links a chapter to itself', async () => {
    const result = await runImport(
      buildEpub({
        chapters: [
          { filename: 'ch1.xhtml', title: 'One', body: '<p>See <a href="ch1.xhtml">here</a>.</p>' },
          { filename: 'ch2.xhtml', title: 'Two', body: '<p>b</p>' },
        ],
      }),
    );

    const edges = await (await db()).getAll('edges');
    expect(edges.filter((edge) => edge.from === edge.to)).toHaveLength(0);
    expect(result.chapterCount).toBe(2);
  });
});

describe('deleting a book', () => {
  it('removes the book and everything belonging to it', async () => {
    const result = await runImport(simpleBook());
    await deleteBook(result.bookId);

    expect(await listBooks()).toHaveLength(0);
    expect(await getChapters(result.bookId)).toHaveLength(0);
    expect(await (await db()).getAll('edges')).toHaveLength(0);
  });
});
