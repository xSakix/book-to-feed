/**
 * Content-addressed book IDs.
 *
 * `bookId = SHA-256(file bytes)`. This is what makes re-importing the same file
 * idempotent, and what lets an exported progress file re-attach to a book on
 * another device (#17, #42) without any account or server.
 */
export async function sha256(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes: BufferSource = data instanceof Uint8Array ? (data as BufferSource) : data;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Deterministic small hash for non-security uses — avatar seeds, cache keys.
 * FNV-1a: fast, no dependencies, and stable across sessions and devices.
 */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
