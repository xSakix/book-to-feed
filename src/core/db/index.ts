import { openDB, type IDBPDatabase } from 'idb';
import {
  DB_NAME,
  DB_VERSION,
  type BookRecord,
  type BookToFeedDB,
  type ChapterRecord,
  type EdgeRecord,
  type ProgressRecord,
  type ResourceRecord,
} from './schema';

let instance: Promise<IDBPDatabase<BookToFeedDB>> | undefined;

export function db(): Promise<IDBPDatabase<BookToFeedDB>> {
  instance ??= openDB<BookToFeedDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      // v1 — the initial schema. Later versions add their own `if` block and
      // never mutate an earlier one, so an upgrade from any version replays
      // cleanly.
      if (oldVersion < 1) {
        const books = database.createObjectStore('books', { keyPath: 'bookId' });
        books.createIndex('by-lastOpened', 'lastOpenedAt');

        const chapters = database.createObjectStore('chapters', {
          keyPath: ['bookId', 'index'],
        });
        chapters.createIndex('by-book', 'bookId');

        const posts = database.createObjectStore('posts', {
          keyPath: ['bookId', 'chapterIndex', 'postIndex'],
        });
        posts.createIndex('by-chapter', ['bookId', 'chapterIndex']);

        const resources = database.createObjectStore('resources', {
          keyPath: ['bookId', 'path'],
        });
        resources.createIndex('by-book', 'bookId');

        const edges = database.createObjectStore('edges', {
          keyPath: ['bookId', 'from', 'to', 'type'],
        });
        edges.createIndex('by-from', ['bookId', 'from']);

        database.createObjectStore('progress', { keyPath: 'bookId' });

        const interactions = database.createObjectStore('interactions', {
          keyPath: 'id',
          autoIncrement: true,
        });
        interactions.createIndex('by-book', 'bookId');
        interactions.createIndex('by-chapter', ['bookId', 'chapterIndex']);

        database.createObjectStore('settings', { keyPath: 'key' });
      }
    },
  });

  return instance;
}

/**
 * Closes the cached connection.
 *
 * An open connection blocks `deleteDatabase` indefinitely, so anything that
 * wants to drop or recreate the database has to come through here first.
 */
export async function closeDb(): Promise<void> {
  const open = instance;
  instance = undefined;
  if (open) (await open).close();
}

/**
 * Asks the browser not to evict the library under storage pressure.
 *
 * Without this a reader can lose every book they have imported with no warning
 * and no way to get it back (ARCHITECTURE.md §13.3).
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function listBooks(): Promise<BookRecord[]> {
  const all = await (await db()).getAll('books');
  return all.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
}

export async function getBook(bookId: string): Promise<BookRecord | undefined> {
  return (await db()).get('books', bookId);
}

export async function putBook(book: BookRecord): Promise<void> {
  await (await db()).put('books', book);
}

export async function touchBook(bookId: string): Promise<void> {
  const database = await db();
  const book = await database.get('books', bookId);
  if (!book) return;
  await database.put('books', { ...book, lastOpenedAt: Date.now() });
}

export async function getChapters(bookId: string): Promise<ChapterRecord[]> {
  const chapters = await (await db()).getAllFromIndex('chapters', 'by-book', bookId);
  return chapters.sort((a, b) => a.index - b.index);
}

export async function getChapter(
  bookId: string,
  index: number,
): Promise<ChapterRecord | undefined> {
  return (await db()).get('chapters', [bookId, index]);
}

export async function putChapters(chapters: ChapterRecord[]): Promise<void> {
  const database = await db();
  const tx = database.transaction('chapters', 'readwrite');
  await Promise.all([...chapters.map((chapter) => tx.store.put(chapter)), tx.done]);
}

export async function putResources(resources: ResourceRecord[]): Promise<void> {
  if (resources.length === 0) return;
  const database = await db();
  const tx = database.transaction('resources', 'readwrite');
  await Promise.all([...resources.map((resource) => tx.store.put(resource)), tx.done]);
}

export async function getResource(
  bookId: string,
  path: string,
): Promise<ResourceRecord | undefined> {
  return (await db()).get('resources', [bookId, path]);
}

export async function putEdges(edges: EdgeRecord[]): Promise<void> {
  if (edges.length === 0) return;
  const database = await db();
  const tx = database.transaction('edges', 'readwrite');
  await Promise.all([...edges.map((edge) => tx.store.put(edge)), tx.done]);
}

export async function getProgress(bookId: string): Promise<ProgressRecord | undefined> {
  return (await db()).get('progress', bookId);
}

export async function putProgress(progress: ProgressRecord): Promise<void> {
  await (await db()).put('progress', progress);
}

/**
 * Removes a book's content while keeping the reader's history.
 *
 * "Remove book, keep progress" (#43): re-importing the same file restores
 * everything, because the book's identity is the hash of its bytes.
 */
export async function evictBookContent(bookId: string): Promise<void> {
  const database = await db();
  await deleteByBook(database, 'resources', bookId);
  await deleteByBook(database, 'chapters', bookId);
  await deletePostsByBook(database, bookId);

  const book = await database.get('books', bookId);
  if (book) await database.put('books', { ...book, contentEvicted: true });
}

/** Deletes a book and everything belonging to it, including reader data. */
export async function deleteBook(bookId: string): Promise<void> {
  const database = await db();
  await deleteByBook(database, 'resources', bookId);
  await deleteByBook(database, 'chapters', bookId);
  await deleteByBook(database, 'edges', bookId, 'by-from');
  await deletePostsByBook(database, bookId);
  await deleteInteractions(database, bookId);
  await database.delete('progress', bookId);
  await database.delete('books', bookId);
}

async function deleteByBook(
  database: IDBPDatabase<BookToFeedDB>,
  store: 'resources' | 'chapters' | 'edges',
  bookId: string,
  index: 'by-book' | 'by-from' = 'by-book',
): Promise<void> {
  const tx = database.transaction(store, 'readwrite');
  const range =
    index === 'by-from'
      ? IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity])
      : IDBKeyRange.only(bookId);

  // @ts-expect-error — the index name is narrowed per store at the call site.
  let cursor = await tx.store.index(index).openCursor(range);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

async function deletePostsByBook(
  database: IDBPDatabase<BookToFeedDB>,
  bookId: string,
): Promise<void> {
  const tx = database.transaction('posts', 'readwrite');
  let cursor = await tx.store.openCursor(
    IDBKeyRange.bound([bookId, -Infinity, -Infinity], [bookId, Infinity, Infinity]),
  );
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

async function deleteInteractions(
  database: IDBPDatabase<BookToFeedDB>,
  bookId: string,
): Promise<void> {
  const tx = database.transaction('interactions', 'readwrite');
  let cursor = await tx.store.index('by-book').openCursor(IDBKeyRange.only(bookId));
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

/** Per-book byte usage for the storage manager (#43). */
export async function bookStorageUsage(bookId: string): Promise<number> {
  const resources = await (await db()).getAllFromIndex('resources', 'by-book', bookId);
  return resources.reduce((total, resource) => total + resource.size, 0);
}
