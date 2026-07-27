import type { ArchiveReader } from './archive';
import { EpubFormatError } from './container';
import { resolveHref } from './path';
import type { BookMetadata, EpubPackage, ManifestItem, PageProgression, SpineItem } from './types';
import { attr, byLocalName, firstByLocalName, parseXml, text } from './xml';

/** Parses the OPF package document: metadata, manifest and spine. */
export async function parsePackage(archive: ArchiveReader, opfPath: string): Promise<EpubPackage> {
  let doc: Document;
  try {
    doc = parseXml(await archive.readText(opfPath));
  } catch {
    throw new EpubFormatError(
      `The package file (${opfPath}) could not be parsed.`,
      'malformed-opf',
    );
  }

  if (!firstByLocalName(doc, 'package') && !doc.documentElement) {
    throw new EpubFormatError('The package file has no <package> element.', 'no-package');
  }

  const manifest = parseManifest(doc, opfPath);
  const byId = new Map(manifest.map((item) => [item.id, item]));
  const spine = parseSpine(doc, byId);

  if (spine.length === 0) {
    throw new EpubFormatError(
      'This book has no readable spine — there is nothing to read.',
      'no-spine',
    );
  }

  return {
    opfPath,
    metadata: parseMetadata(doc),
    manifest,
    spine,
    coverHref: findCover(doc, manifest, byId),
  };
}

function parseMetadata(doc: Document): BookMetadata {
  const metadata = firstByLocalName(doc, 'metadata') ?? doc;

  const titles = byLocalName(metadata, 'title');
  const creators = byLocalName(metadata, 'creator')
    .map((node) => text(node))
    .filter((value): value is string => value !== undefined);

  const spine = firstByLocalName(doc, 'spine');
  const direction = spine ? attr(spine, 'page-progression-direction') : undefined;

  return {
    title: text(titles[0]) ?? 'Untitled',
    authors: creators,
    language: text(firstByLocalName(metadata, 'language')) ?? 'en',
    identifier: text(firstByLocalName(metadata, 'identifier')),
    publisher: text(firstByLocalName(metadata, 'publisher')),
    description: text(firstByLocalName(metadata, 'description')),
    published: text(firstByLocalName(metadata, 'date')),
    pageProgression: direction === 'rtl' ? 'rtl' : ('ltr' satisfies PageProgression),
    fixedLayout: isFixedLayout(metadata),
  };
}

/**
 * Fixed-layout books (comics, picture books) are detected here so the import
 * can route them to reader mode rather than produce a broken feed (#44).
 */
function isFixedLayout(metadata: ParentNode): boolean {
  return byLocalName(metadata, 'meta').some(
    (node) =>
      (attr(node, 'property') ?? '').toLowerCase().endsWith('rendition:layout') &&
      (node.textContent ?? '').trim() === 'pre-paginated',
  );
}

function parseManifest(doc: Document, opfPath: string): ManifestItem[] {
  const manifest = firstByLocalName(doc, 'manifest');
  if (!manifest) return [];

  return byLocalName(manifest, 'item').flatMap((node) => {
    const id = attr(node, 'id');
    const href = attr(node, 'href');
    if (!id || !href) return [];

    return [
      {
        id,
        href: resolveHref(opfPath, href),
        mediaType: attr(node, 'media-type') ?? 'application/octet-stream',
        properties: (attr(node, 'properties') ?? '').split(/\s+/).filter(Boolean),
      },
    ];
  });
}

function parseSpine(doc: Document, byId: Map<string, ManifestItem>): SpineItem[] {
  const spine = firstByLocalName(doc, 'spine');
  if (!spine) return [];

  return byLocalName(spine, 'itemref').flatMap((node) => {
    const idref = attr(node, 'idref');
    if (!idref) return [];
    const item = byId.get(idref);
    if (!item) return [];

    return [
      {
        idref,
        href: item.href,
        mediaType: item.mediaType,
        linear: attr(node, 'linear') !== 'no',
      },
    ];
  });
}

/**
 * Finds the cover image.
 *
 * EPUB 3 marks it with `properties="cover-image"`; EPUB 2 points at it with a
 * `<meta name="cover">` whose content is a manifest id. Both spellings are
 * common enough that supporting only one loses covers on half a library.
 */
function findCover(
  doc: Document,
  manifest: ManifestItem[],
  byId: Map<string, ManifestItem>,
): string | undefined {
  const marked = manifest.find((item) => item.properties.includes('cover-image'));
  if (marked) return marked.href;

  const meta = byLocalName(doc, 'meta').find(
    (node) => (attr(node, 'name') ?? '').toLowerCase() === 'cover',
  );
  const referenced = meta ? byId.get(attr(meta, 'content') ?? '') : undefined;
  if (referenced?.mediaType.startsWith('image/')) return referenced.href;

  // Last resort: an image whose id or filename says "cover".
  return manifest.find(
    (item) => item.mediaType.startsWith('image/') && /cover/i.test(`${item.id} ${item.href}`),
  )?.href;
}
