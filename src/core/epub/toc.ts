import type { ArchiveReader } from './archive';
import { resolveHref, splitFragment } from './path';
import type { EpubPackage, TocEntry } from './types';
import { attr, byLocalName, firstByLocalName, parseMarkup, parseXml, text } from './xml';

/**
 * Reads the table of contents.
 *
 * EPUB 3 uses a nav document, EPUB 2 an NCX. Both are supported because both
 * are everywhere: a converted or older book is exactly as likely to land here
 * as a freshly produced one. A book with neither still reads — chapter titles
 * just fall back to the spine.
 */
export async function parseToc(archive: ArchiveReader, pkg: EpubPackage): Promise<TocEntry[]> {
  const nav = pkg.manifest.find((item) => item.properties.includes('nav'));
  if (nav && (await archive.has(nav.href))) {
    try {
      const entries = parseNavDocument(await archive.readText(nav.href), nav.href);
      if (entries.length > 0) return entries;
    } catch {
      // Fall through to the NCX.
    }
  }

  const ncx = pkg.manifest.find(
    (item) => item.mediaType === 'application/x-dtbncx+xml' || item.href.endsWith('.ncx'),
  );
  if (ncx && (await archive.has(ncx.href))) {
    try {
      return parseNcx(await archive.readText(ncx.href), ncx.href);
    } catch {
      return [];
    }
  }

  return [];
}

/** EPUB 3: the `<nav epub:type="toc">` list, which may be arbitrarily nested. */
export function parseNavDocument(markup: string, navPath: string): TocEntry[] {
  const doc = parseMarkup(markup);

  const navs = byLocalName(doc, 'nav');
  const toc =
    navs.find((node) => (attr(node, 'type') ?? '').split(/\s+/).includes('toc')) ?? navs[0];
  if (!toc) return [];

  const list = firstByLocalName(toc, 'ol') ?? firstByLocalName(toc, 'ul');
  return list ? readList(list, navPath, 0) : [];
}

function readList(list: Element, basePath: string, depth: number): TocEntry[] {
  const entries: TocEntry[] = [];

  for (const item of [...list.children].filter((child) => child.localName === 'li')) {
    const anchor = [...item.children].find(
      (child) => child.localName === 'a' || child.localName === 'span',
    );
    const nested = [...item.children].find(
      (child) => child.localName === 'ol' || child.localName === 'ul',
    );

    const href = anchor ? attr(anchor, 'href') : undefined;
    const title = text(anchor) ?? 'Untitled';
    const children = nested ? readList(nested, basePath, depth + 1) : [];

    if (href) {
      const { path, fragment } = splitFragment(href);
      entries.push({
        title,
        href: resolveHref(basePath, path),
        fragment,
        depth,
        children,
      });
    } else if (children.length > 0) {
      // A heading-only node (a Part with no page of its own): keep the grouping
      // by pointing it at its first child.
      const first = children[0]!;
      entries.push({ title, href: first.href, fragment: undefined, depth, children });
    }
  }

  return entries;
}

/** EPUB 2: `navMap` / `navPoint`, ordered by `playOrder` where present. */
export function parseNcx(markup: string, ncxPath: string): TocEntry[] {
  const doc = parseXml(markup);
  const navMap = firstByLocalName(doc, 'navMap');
  return navMap ? readNavPoints(navMap, ncxPath, 0) : [];
}

function readNavPoints(parent: Element, basePath: string, depth: number): TocEntry[] {
  const points = [...parent.children].filter(
    (child) => child.localName.toLowerCase() === 'navpoint',
  );

  const entries = points.flatMap((point) => {
    const label = firstByLocalName(point, 'navLabel');
    const content = [...point.children].find(
      (child) => child.localName.toLowerCase() === 'content',
    );
    const src = content ? attr(content, 'src') : undefined;
    if (!src) return [];

    const { path, fragment } = splitFragment(src);
    const order = Number(attr(point, 'playOrder') ?? Number.NaN);

    return [
      {
        entry: {
          title: text(label) ?? 'Untitled',
          href: resolveHref(basePath, path),
          fragment,
          depth,
          children: readNavPoints(point, basePath, depth + 1),
        } satisfies TocEntry,
        order,
      },
    ];
  });

  if (entries.every(({ order }) => Number.isFinite(order))) {
    entries.sort((a, b) => a.order - b.order);
  }

  return entries.map(({ entry }) => entry);
}

/** Flattens the TOC tree, keeping each entry's depth and its parent's href. */
export function flattenToc(
  entries: TocEntry[],
  parentHref?: string,
): { title: string; href: string; depth: number; parentHref: string | undefined }[] {
  return entries.flatMap((entry) => [
    { title: entry.title, href: entry.href, depth: entry.depth, parentHref },
    ...flattenToc(entry.children, entry.href),
  ]);
}
