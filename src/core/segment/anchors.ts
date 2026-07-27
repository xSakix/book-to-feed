import type { Anchor } from '~/core/db/schema';
import type { Post } from './segment';

/**
 * Anchor arithmetic.
 *
 * Reader data is pinned to positions in the source text, never to post indexes.
 * That is the whole reason a segmenter change can ship without destroying
 * anyone's highlights or losing their place (#25).
 */

export function compareAnchors(a: Anchor, b: Anchor): number {
  if (a.blockIndex !== b.blockIndex) return a.blockIndex - b.blockIndex;
  return a.charOffset - b.charOffset;
}

export function anchorWithin(anchor: Anchor, start: Anchor, end: Anchor): boolean {
  return compareAnchors(anchor, start) >= 0 && compareAnchors(anchor, end) <= 0;
}

/**
 * Finds the post containing an anchor.
 *
 * Falls back to the nearest post that starts at or before it, so an anchor
 * landing in a gap — a block that a new segmenter version dropped, say — still
 * resolves to a sensible place rather than to nothing.
 */
export function findPostForAnchor(posts: Post[], anchor: Anchor): Post | undefined {
  if (posts.length === 0) return undefined;

  const exact = posts.find((post) => anchorWithin(anchor, post.anchor, post.anchorEnd));
  if (exact) return exact;

  let best: Post | undefined;
  for (const post of posts) {
    if (compareAnchors(post.anchor, anchor) <= 0) best = post;
  }
  return best ?? posts[0];
}

export interface RemapResult<T> {
  /** Items paired with the post index they now belong to. */
  remapped: { item: T; postIndex: number }[];
  /** Items whose anchor could not be placed at all. Reported, never dropped silently. */
  unmapped: T[];
}

/**
 * Moves anchored reader data onto a freshly segmented chapter.
 *
 * The anchors themselves do not change — only which post contains them — so
 * this is a lookup rather than a migration, and it cannot corrupt anything.
 */
export function remapToPosts<T extends { anchor: Anchor }>(
  items: T[],
  posts: Post[],
): RemapResult<T> {
  const remapped: { item: T; postIndex: number }[] = [];
  const unmapped: T[] = [];

  for (const item of items) {
    const post = findPostForAnchor(posts, item.anchor);
    if (post) remapped.push({ item, postIndex: post.index });
    else unmapped.push(item);
  }

  return { remapped, unmapped };
}
