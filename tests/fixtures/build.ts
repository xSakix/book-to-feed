import { zipSync, strToU8 } from 'fflate';

/**
 * Synthetic EPUB builder.
 *
 * Real books cannot be committed here (licensing) and cannot be downloaded in
 * the sandbox, so the suite builds its own. That turns out to be an advantage
 * for most of what we need to prove: a hand-built archive can contain exactly
 * the hostile markup, malformed XML and DRM markers we want to assert about,
 * which no real book conveniently does.
 *
 * Real public-domain books should still be added for the segmentation golden
 * files in M2 — prose shape is the one thing synthetic fixtures cannot fake.
 */

export interface ChapterSpec {
  filename: string;
  title: string;
  body: string;
}

export interface EpubSpec {
  title?: string;
  authors?: string[];
  language?: string;
  identifier?: string;
  publisher?: string;
  description?: string;
  chapters: ChapterSpec[];
  /** EPUB 3 nav document (default) or EPUB 2 NCX. */
  tocFormat?: 'nav' | 'ncx' | 'none';
  cover?: { filename: string; bytes: Uint8Array } | undefined;
  images?: { filename: string; bytes: Uint8Array }[];
  fixedLayout?: boolean;
  pageProgression?: 'ltr' | 'rtl';
  /** Extra files, e.g. META-INF/encryption.xml for the DRM cases. */
  extraFiles?: Record<string, string | Uint8Array>;
  /** Omit META-INF/container.xml to test the "not an EPUB" path. */
  omitContainer?: boolean;
}

const CONTAINER = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;

export function buildEpub(spec: EpubSpec): Uint8Array {
  const {
    title = 'A Test Book',
    authors = ['A. Writer'],
    language = 'en',
    identifier = 'urn:uuid:test-book',
    chapters,
    tocFormat = 'nav',
    images = [],
    fixedLayout = false,
    pageProgression = 'ltr',
    extraFiles = {},
    omitContainer = false,
  } = spec;

  const files: Record<string, Uint8Array> = {};

  // The mimetype entry must be first and stored uncompressed in a real EPUB;
  // readers do not enforce it, and neither do we.
  files['mimetype'] = strToU8('application/epub+zip');
  if (!omitContainer) files['META-INF/container.xml'] = strToU8(CONTAINER);

  for (const chapter of chapters) {
    files[`OEBPS/${chapter.filename}`] = strToU8(chapterDocument(chapter));
  }

  for (const image of images) files[`OEBPS/${image.filename}`] = image.bytes;
  if (spec.cover) files[`OEBPS/${spec.cover.filename}`] = spec.cover.bytes;

  const manifestItems: string[] = chapters.map(
    (chapter, index) =>
      `<item id="ch${index}" href="${chapter.filename}" media-type="application/xhtml+xml"/>`,
  );
  for (const [index, image] of images.entries()) {
    manifestItems.push(
      `<item id="img${index}" href="${image.filename}" media-type="${mimeOf(image.filename)}"/>`,
    );
  }
  if (spec.cover) {
    manifestItems.push(
      `<item id="cover-image" href="${spec.cover.filename}" media-type="${mimeOf(spec.cover.filename)}" properties="cover-image"/>`,
    );
  }

  if (tocFormat === 'nav') {
    files['OEBPS/nav.xhtml'] = strToU8(navDocument(chapters));
    manifestItems.push(
      '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    );
  } else if (tocFormat === 'ncx') {
    files['OEBPS/toc.ncx'] = strToU8(ncxDocument(chapters, identifier, title));
    manifestItems.push('<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>');
  }

  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    ${authors.map((author) => `<dc:creator>${escapeXml(author)}</dc:creator>`).join('\n    ')}
    <dc:language>${language}</dc:language>
    <dc:identifier id="pub-id">${escapeXml(identifier)}</dc:identifier>
    ${spec.publisher ? `<dc:publisher>${escapeXml(spec.publisher)}</dc:publisher>` : ''}
    ${spec.description ? `<dc:description>${escapeXml(spec.description)}</dc:description>` : ''}
    ${fixedLayout ? '<meta property="rendition:layout">pre-paginated</meta>' : ''}
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine${tocFormat === 'ncx' ? ' toc="ncx"' : ''} page-progression-direction="${pageProgression}">
    ${chapters.map((_, index) => `<itemref idref="ch${index}"/>`).join('\n    ')}
  </spine>
</package>`;
  files['OEBPS/content.opf'] = strToU8(opf);

  for (const [path, content] of Object.entries(extraFiles)) {
    files[path] = typeof content === 'string' ? strToU8(content) : content;
  }

  return zipSync(files);
}

function chapterDocument(chapter: ChapterSpec): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>${escapeXml(chapter.title)}</title></head>
  <body>
${chapter.body}
  </body>
</html>`;
}

function navDocument(chapters: ChapterSpec[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
        ${chapters
          .map(
            (chapter) =>
              `<li><a href="${chapter.filename}">${escapeXml(chapter.title)}</a></li>`,
          )
          .join('\n        ')}
      </ol>
    </nav>
  </body>
</html>`;
}

function ncxDocument(chapters: ChapterSpec[], identifier: string, title: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="${escapeXml(identifier)}"/></head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
    ${chapters
      .map(
        (chapter, index) => `<navPoint id="np${index}" playOrder="${index + 1}">
      <navLabel><text>${escapeXml(chapter.title)}</text></navLabel>
      <content src="${chapter.filename}"/>
    </navPoint>`,
      )
      .join('\n    ')}
  </navMap>
</ncx>`;
}

function mimeOf(filename: string): string {
  if (filename.endsWith('.png')) return 'image/png';
  if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) return 'image/jpeg';
  if (filename.endsWith('.svg')) return 'image/svg+xml';
  if (filename.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Smallest valid PNG, for cover and image fixtures. */
export const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
]);

/** A small, ordinary novel-shaped book — the baseline for most tests. */
export function simpleBook(): Uint8Array {
  return buildEpub({
    title: 'The Quiet House',
    authors: ['Marta Kovac'],
    publisher: 'Test Press',
    description: 'A short book for tests.',
    chapters: [
      {
        filename: 'ch1.xhtml',
        title: 'An Arrival',
        body: `<h1>An Arrival</h1>
<p>The house had been empty for a long time, and it showed.</p>
<p>She set down her case and listened. Somewhere above, a door moved.</p>
<p>"Hello?" she called. Nothing answered.</p>`,
      },
      {
        filename: 'ch2.xhtml',
        title: 'The Second Night',
        body: `<h1>The Second Night</h1>
<p>By the second night she had stopped pretending not to hear it.</p>
<p>See also <a href="ch1.xhtml">the arrival</a>.</p>`,
      },
      {
        filename: 'ch3.xhtml',
        title: 'What the Neighbour Said',
        body: `<h1>What the Neighbour Said</h1>
<p>The neighbour spoke about <a href="ch2.xhtml">that second night</a> as though everyone knew.</p>
<hr/>
<p>Afterwards, the street was very quiet.</p>`,
      },
    ],
  });
}
