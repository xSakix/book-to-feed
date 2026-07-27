import type { ArchiveReader } from './archive';
import { EpubFormatError, findPackagePath } from './container';
import { detectDrm } from './drm';
import { parsePackage } from './opf';
import { flattenToc, parseToc } from './toc';
import { XHTML_MEDIA_TYPES, type EpubPackage, type ParsedChapter } from './types';
import { sanitizeChapter } from '~/core/sanitize/sanitize';
import { fnv1a } from '~/core/hash';
import { putBook, putChapters, putEdges, putResources, getBook, touchBook } from '~/core/db';
import { SEGMENTER_VERSION, type BookRecord, type EdgeRecord } from '~/core/db/schema';
import { segmentBook } from '~/core/segment';
import type { PostDensity } from '~/app/store/settings';

/** Characters per minute used for reading estimates; character-based so CJK stays honest. */
const CHARS_PER_MINUTE = 900;

export type ImportPhase =
  | 'hashing'
  | 'opening'
  | 'reading-metadata'
  | 'reading-chapters'
  | 'storing-resources'
  | 'segmenting'
  | 'linking'
  | 'done';

export interface ImportProgress {
  phase: ImportPhase;
  current: number;
  total: number;
  /** Title of whatever is being worked on, for the progress line. */
  label?: string;
}

export interface ImportResult {
  bookId: string;
  title: string;
  chapterCount: number;
  /** True when the file was already in the library and nothing was re-imported. */
  alreadyPresent: boolean;
  blockedExternal: number;
}

export class DrmProtectedError extends Error {
  constructor(readonly scheme: string) {
    super('This book is protected by DRM, so it cannot be opened here.');
    this.name = 'DrmProtectedError';
  }
}

export interface ImportOptions {
  bookId: string;
  fileSize: number;
  archive: ArchiveReader;
  onProgress?: (progress: ImportProgress) => void;
  /** Yields to the event loop between chapters so the UI keeps painting. */
  yieldToUi?: () => Promise<void>;
  /** Segmentation budget preset; defaults to the engine's own default. */
  density?: PostDensity;
}

const defaultYield = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Imports a book from an open archive into IndexedDB.
 *
 * Takes an `ArchiveReader` rather than a file so the pipeline can be driven by
 * the worker-backed archive in the app and a plain in-memory one in tests.
 */
export async function importBook(options: ImportOptions): Promise<ImportResult> {
  const { archive, bookId, fileSize } = options;
  const report = options.onProgress ?? (() => {});
  const pause = options.yieldToUi ?? defaultYield;

  // Re-importing the same bytes is a no-op that preserves reading history (#17).
  const existing = await getBook(bookId);
  if (existing && !existing.contentEvicted) {
    await touchBook(bookId);
    return {
      bookId,
      title: existing.title,
      chapterCount: existing.chapterCount,
      alreadyPresent: true,
      blockedExternal: 0,
    };
  }

  report({ phase: 'opening', current: 0, total: 1 });

  const drm = await detectDrm(archive);
  if (drm.protected) throw new DrmProtectedError(drm.scheme ?? 'unknown');

  report({ phase: 'reading-metadata', current: 0, total: 1 });
  const opfPath = await findPackagePath(archive);
  const pkg = await parsePackage(archive, opfPath);

  const toc = await parseToc(archive, pkg);
  const titles = tocTitles(toc);

  report({ phase: 'reading-chapters', current: 0, total: pkg.spine.length });

  const chapters: ParsedChapter[] = [];
  const referencedResources = new Set<string>();
  const links: { from: number; to: string }[] = [];
  let blockedExternal = 0;

  const spine = pkg.spine.filter(
    (item) => item.linear && XHTML_MEDIA_TYPES.has(item.mediaType.toLowerCase()),
  );

  for (const [position, item] of spine.entries()) {
    let markup: string;
    try {
      markup = await archive.readText(item.href);
    } catch {
      // A spine entry we cannot read should cost us that chapter, not the book.
      continue;
    }

    const clean = sanitizeChapter(markup, { basePath: item.href });
    blockedExternal += clean.blockedExternal.length;
    for (const path of clean.resources) referencedResources.add(path);

    const index = chapters.length;
    for (const link of clean.links) links.push({ from: index, to: link.href });

    const entry = titles.get(item.href);
    const title = entry?.title ?? fallbackTitle(clean.html, index);

    chapters.push({
      index,
      title,
      href: item.href,
      order: position,
      tocDepth: entry?.depth ?? 0,
      parentIndex: undefined,
      html: clean.html,
      charCount: textLength(clean.html),
    });

    report({
      phase: 'reading-chapters',
      current: chapters.length,
      total: spine.length,
      label: title,
    });

    // Sanitising 300 chapters back to back would still lock the UI, so give the
    // browser a chance to paint the progress it is being told about.
    if (chapters.length % 5 === 0) await pause();
  }

  if (chapters.length === 0) {
    throw new EpubFormatError('No readable chapters were found in this book.', 'no-spine');
  }

  linkParents(chapters, toc, titles);

  report({ phase: 'storing-resources', current: 0, total: referencedResources.size });
  const storedResources = await storeResources(
    archive,
    bookId,
    pkg,
    referencedResources,
    (current, total) => report({ phase: 'storing-resources', current, total }),
  );

  const charCount = chapters.reduce((total, chapter) => total + chapter.charCount, 0);

  const book: BookRecord = {
    bookId,
    title: pkg.metadata.title,
    authors: pkg.metadata.authors,
    language: pkg.metadata.language,
    publisher: pkg.metadata.publisher,
    description: pkg.metadata.description,
    identifier: pkg.metadata.identifier,
    pageProgression: pkg.metadata.pageProgression,
    fixedLayout: pkg.metadata.fixedLayout,
    coverPath: pkg.coverHref && storedResources.has(pkg.coverHref) ? pkg.coverHref : undefined,
    chapterCount: chapters.length,
    charCount,
    fileSize,
    addedAt: existing?.addedAt ?? Date.now(),
    lastOpenedAt: Date.now(),
    segmenterVersion: SEGMENTER_VERSION,
    contentEvicted: false,
  };

  await putBook(book);
  await putChapters(
    chapters.map((chapter) => ({
      bookId,
      index: chapter.index,
      title: chapter.title,
      href: chapter.href,
      order: chapter.order,
      tocDepth: chapter.tocDepth,
      parentIndex: chapter.parentIndex,
      html: chapter.html,
      charCount: chapter.charCount,
      readingSeconds: Math.max(3, Math.round((chapter.charCount / CHARS_PER_MINUTE) * 60)),
      postCount: 0,
      avatarSeed: fnv1a(`${bookId}:${chapter.href}:${chapter.title}`),
    })),
  );

  // Segmentation is what turns chapters into a feed (#21). It runs here so a
  // finished import is immediately readable rather than segmenting on first open.
  report({ phase: 'segmenting', current: 0, total: chapters.length });
  await segmentBook(book, {
    ...(options.density !== undefined ? { density: options.density } : {}),
    onProgress: (current, total) => report({ phase: 'segmenting', current, total }),
  });

  report({ phase: 'linking', current: 0, total: 1 });
  await putEdges(buildEdges(bookId, chapters, links));

  report({ phase: 'done', current: 1, total: 1 });

  return {
    bookId,
    title: book.title,
    chapterCount: chapters.length,
    alreadyPresent: false,
    blockedExternal,
  };
}

function tocTitles(
  toc: Awaited<ReturnType<typeof parseToc>>,
): Map<string, { title: string; depth: number; parentHref: string | undefined }> {
  const map = new Map<string, { title: string; depth: number; parentHref: string | undefined }>();
  for (const entry of flattenToc(toc)) {
    // First mention wins: a later, deeper entry pointing at the same file is a
    // sub-section of it, not a better name for it.
    if (!map.has(entry.href)) {
      map.set(entry.href, { title: entry.title, depth: entry.depth, parentHref: entry.parentHref });
    }
  }
  return map;
}

/** Resolves TOC parent references into chapter indexes for the `sibling` edges (#33). */
function linkParents(
  chapters: ParsedChapter[],
  _toc: unknown,
  titles: Map<string, { title: string; depth: number; parentHref: string | undefined }>,
): void {
  const byHref = new Map(chapters.map((chapter) => [chapter.href, chapter.index]));
  for (const chapter of chapters) {
    const parentHref = titles.get(chapter.href)?.parentHref;
    const parentIndex = parentHref === undefined ? undefined : byHref.get(parentHref);
    chapter.parentIndex = parentIndex === chapter.index ? undefined : parentIndex;
  }
}

/** A chapter absent from the TOC still needs a name: use its first heading. */
function fallbackTitle(html: string, index: number): string {
  const match = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i.exec(html);
  const heading = match?.[1]?.replace(/<[^>]+>/g, '').trim();
  return heading && heading.length <= 120 ? heading : `Chapter ${index + 1}`;
}

function textLength(html: string): number {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim().length;
}

async function storeResources(
  archive: ArchiveReader,
  bookId: string,
  pkg: EpubPackage,
  referenced: Set<string>,
  onProgress: (current: number, total: number) => void,
): Promise<Set<string>> {
  const byHref = new Map(pkg.manifest.map((item) => [item.href, item]));
  const wanted = new Set(referenced);
  if (pkg.coverHref) wanted.add(pkg.coverHref);

  const stored = new Set<string>();
  const paths = [...wanted];
  let current = 0;

  for (const path of paths) {
    current += 1;
    onProgress(current, paths.length);

    const mediaType = byHref.get(path)?.mediaType ?? 'application/octet-stream';
    // Only media is worth keeping. Publisher CSS is deliberately not applied, so
    // storing it would cost space for something we never use.
    if (!mediaType.startsWith('image/')) continue;

    try {
      const bytes = await archive.read(path);
      const blob = new Blob([bytes as BlobPart], { type: mediaType });
      await putResources([{ bookId, path, mediaType, blob, size: blob.size }]);
      stored.add(path);
    } catch {
      // A missing image is a cosmetic loss; the book still reads.
    }
  }

  return stored;
}

/**
 * Derives the deterministic part of the chapter graph (#33).
 *
 * `sequential` from spine adjacency, `sibling` from a shared TOC parent, and
 * `mentions` from links between chapter files — with `mutualMention` where a
 * pair points at each other.
 */
export function buildEdges(
  bookId: string,
  chapters: ParsedChapter[],
  links: { from: number; to: string }[],
): EdgeRecord[] {
  const edges = new Map<string, EdgeRecord>();
  const add = (from: number, to: number, type: EdgeRecord['type'], weight = 1) => {
    if (from === to) return;
    edges.set(`${from}:${to}:${type}`, { bookId, from, to, type, weight });
  };

  for (let index = 0; index < chapters.length - 1; index += 1) {
    add(index, index + 1, 'sequential');
    add(index + 1, index, 'sequential');
  }

  const byParent = new Map<number, number[]>();
  for (const chapter of chapters) {
    if (chapter.parentIndex === undefined) continue;
    const siblings = byParent.get(chapter.parentIndex) ?? [];
    siblings.push(chapter.index);
    byParent.set(chapter.parentIndex, siblings);
  }
  for (const siblings of byParent.values()) {
    for (const a of siblings) for (const b of siblings) add(a, b, 'sibling');
  }

  const byHref = new Map(chapters.map((chapter) => [chapter.href, chapter.index]));
  const mentions = new Set<string>();
  for (const link of links) {
    const target = byHref.get(link.to);
    if (target === undefined || target === link.from) continue;
    add(link.from, target, 'mentions');
    mentions.add(`${link.from}:${target}`);
  }
  for (const key of mentions) {
    const [from, to] = key.split(':').map(Number) as [number, number];
    if (mentions.has(`${to}:${from}`)) add(from, to, 'mutualMention', 2);
  }

  return [...edges.values()];
}
