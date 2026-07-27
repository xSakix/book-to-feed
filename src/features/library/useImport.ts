import { useCallback, useRef, useState } from 'react';
import { WorkerArchive } from '~/core/epub/workerArchive';
import { MemoryArchive } from '~/core/epub/archive';
import { DrmProtectedError, importBook, type ImportProgress } from '~/core/epub/import';
import { EpubFormatError } from '~/core/epub/container';
import { ArchiveError } from '~/core/epub/archive';
import { requestPersistence } from '~/core/db';
import { sha256 } from '~/core/hash';

export type ImportState =
  | { status: 'idle' }
  | { status: 'working'; progress: ImportProgress; fileName: string }
  | { status: 'done'; bookId: string; title: string; alreadyPresent: boolean }
  | { status: 'error'; message: string; detail?: string | undefined };

const PHASE_LABEL: Record<ImportProgress['phase'], string> = {
  hashing: 'Reading the file',
  opening: 'Opening the book',
  'reading-metadata': 'Reading the title page',
  'reading-chapters': 'Building your feed',
  'storing-resources': 'Saving illustrations',
  linking: 'Introducing the chapters',
  done: 'Ready',
};

export function phaseLabel(progress: ImportProgress): string {
  const base = PHASE_LABEL[progress.phase];
  if (progress.total > 1 && progress.phase === 'reading-chapters') {
    return `${base} — chapter ${progress.current} of ${progress.total}`;
  }
  return base;
}

/**
 * Drives one import.
 *
 * The file is hashed, handed to the unzip worker, and turned into chapters
 * without a single byte leaving the device.
 */
export function useImport() {
  const [state, setState] = useState<ImportState>({ status: 'idle' });
  const running = useRef(false);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  const start = useCallback(async (file: File) => {
    if (running.current) return;
    running.current = true;

    setState({
      status: 'working',
      fileName: file.name,
      progress: { phase: 'hashing', current: 0, total: 1 },
    });

    let archive: WorkerArchive | MemoryArchive | undefined;
    try {
      const buffer = await file.arrayBuffer();
      const bookId = await sha256(buffer);

      // Asked for on first import so the browser does not silently evict a
      // reader's library under storage pressure.
      void requestPersistence();

      archive = await openArchive(buffer);

      const result = await importBook({
        bookId,
        fileSize: file.size,
        archive,
        onProgress: (progress) =>
          setState((current) =>
            current.status === 'working' ? { ...current, progress } : current,
          ),
      });

      setState({
        status: 'done',
        bookId: result.bookId,
        title: result.title,
        alreadyPresent: result.alreadyPresent,
      });
    } catch (error) {
      setState({ status: 'error', ...describeFailure(error, file) });
    } finally {
      archive?.close();
      running.current = false;
    }
  }, []);

  return { state, start, reset };
}

/**
 * Workers are unavailable in a few environments (older embedded webviews, some
 * privacy modes). Falling back to an in-thread archive is slower but still
 * works, which beats refusing to open the book at all.
 */
async function openArchive(buffer: ArrayBuffer): Promise<WorkerArchive | MemoryArchive> {
  try {
    return await WorkerArchive.open(buffer);
  } catch {
    return new MemoryArchive(new Uint8Array(buffer));
  }
}

function describeFailure(
  error: unknown,
  file: File,
): { message: string; detail?: string | undefined } {
  if (error instanceof DrmProtectedError) {
    return {
      message: 'This book is protected by DRM',
      detail:
        'Protected books cannot be opened here, and this app does not remove DRM. A DRM-free copy will work.',
    };
  }

  if (error instanceof EpubFormatError) {
    return { message: 'This book could not be read', detail: error.message };
  }

  if (error instanceof ArchiveError) {
    return {
      message: `${file.name} is not a readable EPUB`,
      detail: 'The file may be damaged, incomplete, or not actually an EPUB.',
    };
  }

  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return {
      message: 'There is not enough storage space left',
      detail: 'Remove a book from your library and try again. Your reading progress is kept.',
    };
  }

  return {
    message: 'Something went wrong importing this book',
    detail: error instanceof Error ? error.message : undefined,
  };
}
