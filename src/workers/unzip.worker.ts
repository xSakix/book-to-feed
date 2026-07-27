/// <reference lib="webworker" />
import { MemoryArchive } from '~/core/epub/archive';

/**
 * Off-thread inflate service.
 *
 * Decompressing a 50 MB illustrated EPUB is the one genuinely expensive part of
 * an import, and doing it on the main thread freezes the UI for seconds. Parsing
 * and sanitising stay on the main thread because both need a DOM, which workers
 * do not have — see the note in ARCHITECTURE.md §5.
 *
 * The worker holds the archive bytes and answers requests for individual
 * entries, so the caller drives the pipeline while the CPU cost lives here.
 */

export type UnzipRequest =
  | { id: number; type: 'open'; buffer: ArrayBuffer }
  | { id: number; type: 'list' }
  | { id: number; type: 'read'; path: string }
  | { id: number; type: 'has'; path: string }
  | { id: number; type: 'close' };

export type UnzipResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string; code?: string };

let archive: MemoryArchive | undefined;

self.onmessage = (event: MessageEvent<UnzipRequest>) => {
  const message = event.data;

  void (async () => {
    try {
      const result = await handle(message);
      // Entry bytes are transferred rather than copied — a large image would
      // otherwise be duplicated on every read.
      const transfer =
        result instanceof Uint8Array ? [result.buffer as ArrayBuffer] : ([] as Transferable[]);
      (self as unknown as Worker).postMessage(
        { id: message.id, ok: true, result } satisfies UnzipResponse,
        transfer,
      );
    } catch (error) {
      const response: UnzipResponse = {
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof Error && 'code' in error ? { code: String(error.code) } : {}),
      };
      (self as unknown as Worker).postMessage(response);
    }
  })();
};

function handle(message: UnzipRequest): Promise<unknown> {
  switch (message.type) {
    case 'open':
      archive?.close();
      archive = new MemoryArchive(new Uint8Array(message.buffer));
      return Promise.resolve(true);

    case 'list':
      return required().list();

    case 'read':
      return required().read(message.path);

    case 'has':
      return required().has(message.path);

    case 'close':
      archive?.close();
      archive = undefined;
      return Promise.resolve(true);
  }
}

function required(): MemoryArchive {
  if (!archive) throw new Error('No archive is open in the worker');
  return archive;
}
