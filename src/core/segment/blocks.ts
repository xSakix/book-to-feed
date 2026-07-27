import { parseMarkup } from '~/core/epub/xml';

/**
 * Stage 1 of segmentation: chapter XHTML → a flat, typed block stream.
 *
 * Blocks are the unit everything downstream reasons about. Their indexes and
 * character offsets are the anchors reader data is pinned to, so this extraction
 * has to be deterministic: the stored chapter HTML never changes, therefore the
 * block stream never changes, therefore a highlight still lands on the same
 * words after the segmenter is retuned (#25).
 */

export type BlockType =
  | 'heading'
  | 'paragraph'
  | 'dialogue'
  | 'blockquote'
  | 'verse'
  | 'list'
  | 'image'
  | 'table'
  | 'code'
  | 'sceneBreak'
  | 'footnoteRef';

export interface Block {
  index: number;
  type: BlockType;
  /** Sanitised markup for this block, including its own element. */
  html: string;
  /** Plain text, whitespace-collapsed. Empty for images and scene breaks. */
  text: string;
  /** Heading level 1–6, only for `heading`. */
  level?: number;
  /**
   * Offset within the source block. Non-zero only for the pieces an over-long
   * paragraph was split into, which is what keeps their anchors distinct.
   */
  charOffset?: number;
}

/** Elements we descend into rather than treat as blocks of their own. */
const CONTAINERS = new Set([
  'body',
  'div',
  'section',
  'article',
  'main',
  'header',
  'footer',
  'aside',
  'nav',
  'figure',
  'picture',
]);

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

/**
 * Openers that mark a paragraph as dialogue.
 *
 * Typographic quotes matter as much as ASCII ones — most published books use
 * curly quotes, and a dialogue rule that only knows `"` would fire on almost
 * nothing. The em dash covers French and Spanish convention.
 */
const DIALOGUE_OPENERS = ['"', "'", '“', '‘', '„', '«', '—', '「'];

/** Centred ornaments used as scene breaks: `* * *`, `###`, `~ ~ ~`. */
const SCENE_BREAK = /^[\s*#~•·◆◇✳✦※_+=-]{1,12}$/;

export function extractBlocks(html: string): Block[] {
  const doc = parseMarkup(`<body>${html}</body>`);
  const root = doc.body ?? doc.documentElement;
  const blocks: Block[] = [];
  if (root) walk(root, blocks);
  return blocks.map((block, index) => ({ ...block, index }));
}

function walk(element: Element, blocks: Block[]): void {
  for (const child of element.children) {
    const name = child.localName.toLowerCase();

    if (name === 'hr') {
      push(blocks, { type: 'sceneBreak', html: '<hr>', text: '' });
      continue;
    }

    // A print artefact with no meaning in a feed.
    if (isPageBreak(child)) continue;

    if (HEADINGS.has(name)) {
      const text = plainText(child);
      if (text) {
        push(blocks, {
          type: 'heading',
          html: child.outerHTML,
          text,
          level: Number(name.slice(1)),
        });
      }
      continue;
    }

    if (name === 'img') {
      push(blocks, { type: 'image', html: child.outerHTML, text: alt(child) });
      continue;
    }

    if (name === 'table') {
      push(blocks, { type: 'table', html: child.outerHTML, text: plainText(child) });
      continue;
    }

    if (name === 'pre' || name === 'code') {
      const type = looksLikeVerse(child) ? 'verse' : 'code';
      push(blocks, { type, html: child.outerHTML, text: plainText(child) });
      continue;
    }

    if (name === 'blockquote') {
      push(blocks, { type: 'blockquote', html: child.outerHTML, text: plainText(child) });
      continue;
    }

    if (name === 'ul' || name === 'ol' || name === 'dl') {
      push(blocks, { type: 'list', html: child.outerHTML, text: plainText(child) });
      continue;
    }

    if (name === 'p') {
      pushParagraph(child, blocks);
      continue;
    }

    if (CONTAINERS.has(name)) {
      // A figure holding a single image is that image, not a container.
      const image = name === 'figure' ? child.querySelector('img') : null;
      if (image) {
        push(blocks, { type: 'image', html: child.outerHTML, text: figureText(child) });
        continue;
      }
      walk(child, blocks);
      continue;
    }

    // Anything else that carries text is treated as a paragraph so no prose is
    // silently dropped; anything else is ignored.
    const text = plainText(child);
    if (text) pushParagraph(child, blocks);
  }
}

function pushParagraph(element: Element, blocks: Block[]): void {
  const text = plainText(element);
  if (!text) return;

  if (SCENE_BREAK.test(text)) {
    push(blocks, { type: 'sceneBreak', html: element.outerHTML, text: '' });
    return;
  }

  if (isFootnoteRef(element)) {
    push(blocks, { type: 'footnoteRef', html: element.outerHTML, text });
    return;
  }

  if (looksLikeVerse(element)) {
    push(blocks, { type: 'verse', html: element.outerHTML, text });
    return;
  }

  const type = DIALOGUE_OPENERS.some((opener) => text.startsWith(opener))
    ? 'dialogue'
    : 'paragraph';
  push(blocks, { type, html: element.outerHTML, text });
}

function push(blocks: Block[], block: Omit<Block, 'index'>): void {
  blocks.push({ ...block, index: blocks.length });
}

function plainText(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function alt(element: Element): string {
  return element.getAttribute('alt')?.trim() ?? '';
}

function figureText(element: Element): string {
  const caption = element.querySelector('figcaption');
  if (caption) return plainText(caption);
  const image = element.querySelector('img');
  return image ? alt(image) : '';
}

function isPageBreak(element: Element): boolean {
  const type = element.getAttribute('epub:type') ?? element.getAttribute('type') ?? '';
  if (type.includes('pagebreak')) return true;
  const className = element.getAttribute('class') ?? '';
  return /page-?break|pagenum/i.test(className) && plainText(element).length <= 8;
}

function isFootnoteRef(element: Element): boolean {
  const type = element.getAttribute('epub:type') ?? '';
  return type.includes('noteref') || type.includes('footnote');
}

/**
 * Verse detection.
 *
 * Poetry is line-shaped: several `<br>`-separated lines that are individually
 * short. Prose that happens to contain one `<br>` is not a poem, so the test
 * needs both the line count and the line length.
 */
function looksLikeVerse(element: Element): boolean {
  const className = `${element.getAttribute('class') ?? ''} ${element.getAttribute('epub:type') ?? ''}`;
  if (/verse|poem|stanza|lyric|epigraph-line/i.test(className)) return true;
  if (element.localName.toLowerCase() === 'pre') {
    const lines = (element.textContent ?? '').split('\n').filter((line) => line.trim());
    return lines.length >= 2 && lines.every((line) => line.trim().length < 70);
  }

  const breaks = element.querySelectorAll('br').length;
  if (breaks < 2) return false;

  const lines = (element.innerHTML || '')
    .split(/<br\s*\/?>/i)
    .map((line) => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

  return lines.length >= 3 && lines.every((line) => line.length < 70);
}

/** Concatenated plain text of a block stream, used for reading estimates. */
export function blocksText(blocks: Block[]): string {
  return blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n');
}
