import { unzipSync } from 'fflate';
import { pathCandidates } from './path';

export interface ArchiveEntry {
  name: string;
  originalSize: number;
  compressedSize: number;
}

/**
 * Read access to an EPUB's zip entries.
 *
 * Everything that parses a book takes this rather than a concrete zip, so the
 * pipeline can run against an in-memory archive in tests and against the
 * off-thread inflater in the app (#16) without changing a line of logic.
 */
export interface ArchiveReader {
  list(): Promise<ArchiveEntry[]>;
  has(path: string): Promise<boolean>;
  read(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
  close(): void;
}

export type ArchiveErrorCode = 'not-a-zip' | 'missing-entry' | 'corrupt-entry';

export class ArchiveError extends Error {
  constructor(
    message: string,
    readonly code: ArchiveErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ArchiveError';
  }
}

const decoder = new TextDecoder('utf-8');

/**
 * Reads entries straight out of an in-memory zip.
 *
 * Entries are inflated one at a time, on demand: fflate's `filter` hook decides
 * per entry, so a 50 MB illustrated book never has all of its contents
 * decompressed at once (ARCHITECTURE.md §13.4).
 */
export class MemoryArchive implements ArchiveReader {
  #data: Uint8Array | undefined;
  #entries: ArchiveEntry[] | undefined;

  constructor(data: Uint8Array) {
    this.#data = data;
  }

  #raw(): Uint8Array {
    if (!this.#data) throw new ArchiveError('Archive already closed', 'not-a-zip');
    return this.#data;
  }

  /**
   * Lists entries without inflating any of them — the filter returns false for
   * everything, so we get the central directory and nothing else.
   */
  /**
   * Async on purpose even though nothing is awaited: a bad archive must reject
   * rather than throw synchronously past a caller's `.catch()`.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async list(): Promise<ArchiveEntry[]> {
    if (!this.#entries) {
      const entries: ArchiveEntry[] = [];
      try {
        unzipSync(this.#raw(), {
          filter: (file) => {
            entries.push({
              name: file.name,
              originalSize: file.originalSize,
              compressedSize: file.size,
            });
            return false;
          },
        });
      } catch (cause) {
        throw new ArchiveError('This file is not a readable zip archive', 'not-a-zip', { cause });
      }
      this.#entries = entries;
    }
    return this.#entries;
  }

  async has(path: string): Promise<boolean> {
    const entries = await this.list();
    const names = new Set(entries.map((entry) => entry.name));
    return pathCandidates(path).some((candidate) => names.has(candidate));
  }

  async read(path: string): Promise<Uint8Array> {
    const entries = await this.list();
    const names = new Set(entries.map((entry) => entry.name));
    const name = pathCandidates(path).find((candidate) => names.has(candidate));
    if (name === undefined) {
      throw new ArchiveError(`Missing from the archive: ${path}`, 'missing-entry');
    }

    let unzipped;
    try {
      unzipped = unzipSync(this.#raw(), { filter: (file) => file.name === name });
    } catch (cause) {
      throw new ArchiveError(`Could not decompress ${path}`, 'corrupt-entry', { cause });
    }

    const bytes = unzipped[name];
    if (!bytes) throw new ArchiveError(`Could not decompress ${path}`, 'corrupt-entry');
    return bytes;
  }

  async readText(path: string): Promise<string> {
    return stripBom(decoder.decode(await this.read(path)));
  }

  close(): void {
    this.#data = undefined;
    this.#entries = undefined;
  }
}

/** A UTF-8 BOM confuses DOMParser into failing on the XML declaration. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}
