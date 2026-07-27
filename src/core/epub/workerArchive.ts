import { ArchiveError, stripBom, type ArchiveEntry, type ArchiveReader } from './archive';
import type { UnzipRequest, UnzipResponse } from '~/workers/unzip.worker';

const decoder = new TextDecoder('utf-8');

/**
 * `Omit` over a union collapses it to the keys every member shares, which would
 * lose `path` and `buffer`. Distributing keeps each variant intact.
 */
type UnzipRequestBody = UnzipRequest extends infer Request
  ? Request extends { id: number }
    ? Omit<Request, 'id'>
    : never
  : never;

/**
 * An `ArchiveReader` backed by the unzip worker.
 *
 * Same interface as `MemoryArchive`, so every parser above it is unaware of
 * which one it is talking to — and unit tests can run the whole pipeline
 * synchronously in-process.
 */
export class WorkerArchive implements ArchiveReader {
  #worker: Worker;
  #nextId = 1;
  #pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  #entries: ArchiveEntry[] | undefined;

  private constructor(worker: Worker) {
    this.#worker = worker;
    this.#worker.onmessage = (event: MessageEvent<UnzipResponse>) => {
      const message = event.data;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);

      if (message.ok) pending.resolve(message.result);
      else pending.reject(new ArchiveError(message.error, asCode(message.code)));
    };
    this.#worker.onerror = (event) => {
      const error = new Error(event.message || 'The import worker failed');
      for (const pending of this.#pending.values()) pending.reject(error);
      this.#pending.clear();
    };
  }

  /** Takes ownership of `buffer` — it is transferred and unusable afterwards. */
  static async open(buffer: ArrayBuffer): Promise<WorkerArchive> {
    const worker = new Worker(new URL('~/workers/unzip.worker.ts', import.meta.url), {
      type: 'module',
      name: 'book-to-feed-unzip',
    });
    const archive = new WorkerArchive(worker);
    await archive.#send({ type: 'open', buffer }, [buffer]);
    return archive;
  }

  #send(request: UnzipRequestBody, transfer: Transferable[] = []): Promise<unknown> {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.#worker.postMessage({ ...request, id }, transfer);
    });
  }

  async list(): Promise<ArchiveEntry[]> {
    this.#entries ??= (await this.#send({ type: 'list' })) as ArchiveEntry[];
    return this.#entries;
  }

  async has(path: string): Promise<boolean> {
    return (await this.#send({ type: 'has', path })) === true;
  }

  async read(path: string): Promise<Uint8Array> {
    return (await this.#send({ type: 'read', path })) as Uint8Array;
  }

  async readText(path: string): Promise<string> {
    return stripBom(decoder.decode(await this.read(path)));
  }

  close(): void {
    this.#worker.terminate();
    this.#pending.clear();
  }
}

function asCode(code: string | undefined) {
  return code === 'not-a-zip' || code === 'missing-entry' || code === 'corrupt-entry'
    ? code
    : 'corrupt-entry';
}
