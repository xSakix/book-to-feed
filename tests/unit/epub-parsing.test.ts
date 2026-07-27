import { describe, expect, it } from 'vitest';
import { MemoryArchive } from '~/core/epub/archive';
import { findPackagePath, EpubFormatError } from '~/core/epub/container';
import { parsePackage } from '~/core/epub/opf';
import { parseToc, flattenToc, parseNcx, parseNavDocument } from '~/core/epub/toc';
import { detectDrm } from '~/core/epub/drm';
import { normalizePath, resolveHref, splitFragment, isExternal } from '~/core/epub/path';
import { buildEpub, simpleBook, TINY_PNG } from '../fixtures/build';

const open = (bytes: Uint8Array) => new MemoryArchive(bytes);

describe('path resolution', () => {
  it('resolves hrefs against the file they appeared in', () => {
    expect(resolveHref('OEBPS/text/ch1.xhtml', '../images/cover.png')).toBe(
      'OEBPS/images/cover.png',
    );
    expect(resolveHref('OEBPS/content.opf', 'ch1.xhtml')).toBe('OEBPS/ch1.xhtml');
    expect(resolveHref('OEBPS/a/b/c.xhtml', './d.xhtml')).toBe('OEBPS/a/b/d.xhtml');
  });

  it('drops fragments and refuses to escape the archive root', () => {
    expect(resolveHref('OEBPS/ch1.xhtml', 'ch2.xhtml#part-3')).toBe('OEBPS/ch2.xhtml');
    expect(normalizePath('../../etc/passwd')).toBe('etc/passwd');
  });

  it('leaves external URLs alone', () => {
    expect(isExternal('https://example.com/x.png')).toBe(true);
    expect(isExternal('//example.com/x.png')).toBe(true);
    expect(isExternal('javascript:alert(1)')).toBe(true);
    expect(isExternal('images/x.png')).toBe(false);
    expect(resolveHref('OEBPS/ch1.xhtml', 'https://example.com/x.png')).toBe(
      'https://example.com/x.png',
    );
  });

  it('splits fragments', () => {
    expect(splitFragment('a.xhtml#b')).toEqual({ path: 'a.xhtml', fragment: 'b' });
    expect(splitFragment('a.xhtml')).toEqual({ path: 'a.xhtml', fragment: undefined });
  });
});

describe('container', () => {
  it('finds the package document', async () => {
    expect(await findPackagePath(open(simpleBook()))).toBe('OEBPS/content.opf');
  });

  it('rejects a zip that is not an EPUB', async () => {
    const notAnEpub = buildEpub({
      chapters: [{ filename: 'a.xhtml', title: 'A', body: '<p>x</p>' }],
      omitContainer: true,
    });
    await expect(findPackagePath(open(notAnEpub))).rejects.toThrow(EpubFormatError);
  });
});

describe('OPF parsing', () => {
  it('reads metadata, manifest and spine', async () => {
    const pkg = await parsePackage(open(simpleBook()), 'OEBPS/content.opf');

    expect(pkg.metadata.title).toBe('The Quiet House');
    expect(pkg.metadata.authors).toEqual(['Marta Kovac']);
    expect(pkg.metadata.publisher).toBe('Test Press');
    expect(pkg.metadata.language).toBe('en');
    expect(pkg.spine.map((item) => item.href)).toEqual([
      'OEBPS/ch1.xhtml',
      'OEBPS/ch2.xhtml',
      'OEBPS/ch3.xhtml',
    ]);
  });

  it('resolves manifest hrefs relative to the OPF directory', async () => {
    const pkg = await parsePackage(open(simpleBook()), 'OEBPS/content.opf');
    expect(pkg.manifest.every((item) => item.href.startsWith('OEBPS/'))).toBe(true);
  });

  it('finds an EPUB 3 cover', async () => {
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>Hello</p>' }],
      cover: { filename: 'cover.png', bytes: TINY_PNG },
    });
    const pkg = await parsePackage(open(bytes), 'OEBPS/content.opf');
    expect(pkg.coverHref).toBe('OEBPS/cover.png');
  });

  it('detects a fixed-layout book', async () => {
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>Hello</p>' }],
      fixedLayout: true,
    });
    const pkg = await parsePackage(open(bytes), 'OEBPS/content.opf');
    expect(pkg.metadata.fixedLayout).toBe(true);
  });

  it('reads right-to-left page progression', async () => {
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>Hello</p>' }],
      pageProgression: 'rtl',
    });
    const pkg = await parsePackage(open(bytes), 'OEBPS/content.opf');
    expect(pkg.metadata.pageProgression).toBe('rtl');
  });

  it('refuses a book with nothing readable in its spine', async () => {
    const bytes = buildEpub({ chapters: [] });
    await expect(parsePackage(open(bytes), 'OEBPS/content.opf')).rejects.toThrow(EpubFormatError);
  });
});

describe('table of contents', () => {
  it('reads an EPUB 3 nav document', async () => {
    const archive = open(simpleBook());
    const pkg = await parsePackage(archive, 'OEBPS/content.opf');
    const toc = await parseToc(archive, pkg);

    expect(flattenToc(toc).map((entry) => entry.title)).toEqual([
      'An Arrival',
      'The Second Night',
      'What the Neighbour Said',
    ]);
  });

  it('reads an EPUB 2 NCX and produces the same shape', async () => {
    const bytes = buildEpub({
      tocFormat: 'ncx',
      chapters: [
        { filename: 'ch1.xhtml', title: 'An Arrival', body: '<p>a</p>' },
        { filename: 'ch2.xhtml', title: 'The Second Night', body: '<p>b</p>' },
      ],
    });
    const archive = open(bytes);
    const pkg = await parsePackage(archive, 'OEBPS/content.opf');
    const toc = await parseToc(archive, pkg);

    expect(flattenToc(toc).map((entry) => entry.title)).toEqual(['An Arrival', 'The Second Night']);
    expect(toc[0]?.href).toBe('OEBPS/ch1.xhtml');
  });

  it('honours playOrder rather than document order in an NCX', () => {
    const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="b" playOrder="2"><navLabel><text>Second</text></navLabel><content src="b.xhtml"/></navPoint>
    <navPoint id="a" playOrder="1"><navLabel><text>First</text></navLabel><content src="a.xhtml"/></navPoint>
  </navMap>
</ncx>`;
    expect(parseNcx(ncx, 'OEBPS/toc.ncx').map((entry) => entry.title)).toEqual(['First', 'Second']);
  });

  it('keeps nesting from a nav document', () => {
    const nav = `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <body><nav epub:type="toc"><ol>
    <li><a href="part1.xhtml">Part One</a>
      <ol><li><a href="ch1.xhtml">Chapter One</a></li></ol>
    </li>
  </ol></nav></body></html>`;

    const toc = parseNavDocument(nav, 'OEBPS/nav.xhtml');
    expect(toc[0]?.title).toBe('Part One');
    expect(toc[0]?.children[0]?.title).toBe('Chapter One');
    expect(toc[0]?.children[0]?.depth).toBe(1);
    expect(flattenToc(toc)[1]?.parentHref).toBe('OEBPS/part1.xhtml');
  });

  it('survives a book with no table of contents at all', async () => {
    const bytes = buildEpub({
      tocFormat: 'none',
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
    });
    const archive = open(bytes);
    const pkg = await parsePackage(archive, 'OEBPS/content.opf');
    expect(await parseToc(archive, pkg)).toEqual([]);
  });
});

describe('DRM detection', () => {
  it('passes an ordinary book', async () => {
    expect(await detectDrm(open(simpleBook()))).toMatchObject({ protected: false });
  });

  it('rejects Adobe ADEPT', async () => {
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
      extraFiles: { 'META-INF/rights.xml': '<rights/>' },
    });
    expect(await detectDrm(open(bytes))).toMatchObject({
      protected: true,
      scheme: 'adobe-adept',
    });
  });

  it('rejects Readium LCP', async () => {
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
      extraFiles: { 'META-INF/license.lcpl': '{}' },
    });
    expect(await detectDrm(open(bytes))).toMatchObject({
      protected: true,
      scheme: 'readium-lcp',
    });
  });

  it('accepts font obfuscation, which is not DRM', async () => {
    const encryption = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#">
    <EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
  </EncryptedData>
</encryption>`;
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
      extraFiles: { 'META-INF/encryption.xml': encryption },
    });

    expect(await detectDrm(open(bytes))).toEqual({
      protected: false,
      obfuscatedFontsOnly: true,
    });
  });

  it('rejects real content encryption', async () => {
    const encryption = `<?xml version="1.0"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#">
    <EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes256-cbc"/>
  </EncryptedData>
</encryption>`;
    const bytes = buildEpub({
      chapters: [{ filename: 'ch1.xhtml', title: 'One', body: '<p>a</p>' }],
      extraFiles: { 'META-INF/encryption.xml': encryption },
    });

    expect(await detectDrm(open(bytes))).toMatchObject({ protected: true });
  });
});

describe('archive', () => {
  it('lists entries without inflating them', async () => {
    const entries = await open(simpleBook()).list();
    expect(entries.map((entry) => entry.name)).toContain('OEBPS/content.opf');
    expect(entries.map((entry) => entry.name)).toContain('mimetype');
  });

  it('reports a missing entry rather than returning empty content', async () => {
    await expect(open(simpleBook()).read('OEBPS/nope.xhtml')).rejects.toThrow(/Missing/);
  });

  it('refuses a file that is not a zip', async () => {
    const notAZip = new TextEncoder().encode('this is just some text, not an archive at all');
    await expect(open(notAZip).list()).rejects.toThrow(/not a readable zip/);
  });
});
