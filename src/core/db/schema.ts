import type { DBSchema } from 'idb';
import type { PageProgression } from '~/core/epub/types';

export const DB_NAME = 'book-to-feed';
export const DB_VERSION = 1;

/** Bumping this re-segments stored books and remaps reader data by anchor (#25). */
export const SEGMENTER_VERSION = 0;

/** A position in a chapter's source text. Reader data anchors here, never to a post index. */
export interface Anchor {
  blockIndex: number;
  charOffset: number;
}

export interface BookRecord {
  bookId: string;
  title: string;
  authors: string[];
  language: string;
  publisher: string | undefined;
  description: string | undefined;
  identifier: string | undefined;
  pageProgression: PageProgression;
  fixedLayout: boolean;
  coverPath: string | undefined;
  chapterCount: number;
  charCount: number;
  /** Size of the source file, for the storage manager (#43). */
  fileSize: number;
  addedAt: number;
  lastOpenedAt: number | undefined;
  segmenterVersion: number;
  /** Set when the archive contained no readable resources (removed to free space, #43). */
  contentEvicted: boolean;
}

export interface ChapterRecord {
  bookId: string;
  index: number;
  title: string;
  href: string;
  order: number;
  tocDepth: number;
  parentIndex: number | undefined;
  /**
   * Sanitised XHTML for the chapter.
   *
   * Not in the original §8 table: M2 needs the cleaned markup to build its block
   * stream, and re-deriving it would mean keeping the whole archive and
   * re-sanitising on every segmenter change. Storing it here keeps the rule that
   * nothing unsanitised is ever persisted.
   */
  html: string;
  charCount: number;
  readingSeconds: number;
  postCount: number;
  avatarSeed: number;
}

export interface ResourceRecord {
  bookId: string;
  path: string;
  mediaType: string;
  blob: Blob;
  size: number;
}

export type EdgeType =
  'sequential' | 'sibling' | 'mentions' | 'mutualMention' | 'references' | 'sharedCast';

export interface EdgeRecord {
  bookId: string;
  from: number;
  to: number;
  type: EdgeType;
  weight: number;
}

export type ChapterState = 'unread' | 'reading' | 'read';

export interface ProgressRecord {
  bookId: string;
  currentChapter: number;
  currentAnchor: Anchor | undefined;
  chapters: Record<number, { state: ChapterState; furthestAnchor?: Anchor; completedAt?: number }>;
  totalSecondsRead: number;
  streakDays: number;
  lastReadAt: number | undefined;
}

export interface InteractionRecord {
  id?: number;
  bookId: string;
  chapterIndex: number;
  anchor: Anchor;
  anchorEnd: Anchor | undefined;
  kind: 'reaction' | 'note' | 'highlight';
  payload: string;
  createdAt: number;
}

export interface SettingsRecord {
  key: 'settings';
  value: Record<string, unknown>;
}

export interface BookToFeedDB extends DBSchema {
  books: {
    key: string;
    value: BookRecord;
    indexes: { 'by-lastOpened': number };
  };
  chapters: {
    key: [string, number];
    value: ChapterRecord;
    indexes: { 'by-book': string };
  };
  posts: {
    key: [string, number, number];
    value: {
      bookId: string;
      chapterIndex: number;
      postIndex: number;
      type: string;
      html: string;
      plainText: string;
      anchor: Anchor;
      anchorEnd: Anchor;
      charCount: number;
      readingSeconds: number;
      isContinuation: boolean;
      pullQuote: string | undefined;
      segmenterVersion: number;
    };
    indexes: { 'by-chapter': [string, number] };
  };
  resources: {
    key: [string, string];
    value: ResourceRecord;
    indexes: { 'by-book': string };
  };
  edges: {
    key: [string, number, number, string];
    value: EdgeRecord;
    indexes: { 'by-from': [string, number] };
  };
  progress: {
    key: string;
    value: ProgressRecord;
  };
  interactions: {
    key: number;
    value: InteractionRecord;
    indexes: { 'by-book': string; 'by-chapter': [string, number] };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
}
