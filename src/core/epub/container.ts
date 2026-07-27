import type { ArchiveReader } from './archive';
import { normalizePath } from './path';
import { attr, byLocalName, parseXml } from './xml';

export const CONTAINER_PATH = 'META-INF/container.xml';

export class EpubFormatError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'no-container'
      | 'no-rootfile'
      | 'no-package'
      | 'no-spine'
      | 'malformed-opf'
      | 'drm-protected',
  ) {
    super(message);
    this.name = 'EpubFormatError';
  }
}

/**
 * Locates the OPF package document via `META-INF/container.xml`.
 *
 * A container may declare several rootfiles; the first with the OPF media type
 * is the package document, and we fall back to the first of any type rather
 * than give up on a book with a sloppy media type.
 */
export async function findPackagePath(archive: ArchiveReader): Promise<string> {
  if (!(await archive.has(CONTAINER_PATH))) {
    throw new EpubFormatError(
      'This does not look like an EPUB — META-INF/container.xml is missing.',
      'no-container',
    );
  }

  const doc = parseXml(await archive.readText(CONTAINER_PATH));
  const rootfiles = byLocalName(doc, 'rootfile');

  const preferred =
    rootfiles.find((node) => attr(node, 'media-type') === 'application/oebps-package+xml') ??
    rootfiles[0];

  const path = preferred ? attr(preferred, 'full-path') : undefined;
  if (!path) {
    throw new EpubFormatError(
      'The EPUB container does not point at a package file.',
      'no-rootfile',
    );
  }

  return normalizePath(path);
}
