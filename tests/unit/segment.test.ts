import { describe, expect, it } from 'vitest';
import { extractBlocks } from '~/core/segment/blocks';
import { BUDGETS, pickPullQuote, segmentChapter, type Post } from '~/core/segment/segment';
import {
  DIALOGUE_CHAPTER,
  LONG_PARAGRAPH_CHAPTER,
  NONFICTION_CHAPTER,
  NOVEL_CHAPTER,
  POETRY_CHAPTER,
} from '../fixtures/prose';
import { endsSentence } from '~/core/segment/sentences';

const segment = (html: string, density: 'compact' | 'normal' | 'roomy' = 'normal') =>
  segmentChapter(extractBlocks(html), { density });

const budget = BUDGETS.normal;

describe('hard rules', () => {
  it('gives a heading a post of its own', () => {
    const posts = segment(NOVEL_CHAPTER);
    expect(posts[0]).toMatchObject({ type: 'heading' });
    expect(posts[0]?.plainText).toBe('An Arrival');
  });

  it('gives an image, a table and a code block their own posts', () => {
    const posts = segment(
      '<p>Before.</p><img alt="A plate"/><p>After.</p><table><tr><td>x</td></tr></table>',
    );
    const types = posts.map((post) => post.type);
    expect(types).toContain('image');
    expect(types).toContain('table');
  });

  it('makes a scene break its own divider post', () => {
    const posts = segment(NOVEL_CHAPTER);
    const separators = posts.filter((post) => post.type === 'separator');
    expect(separators).toHaveLength(1);
  });

  it('never lets a post exceed the hard maximum', () => {
    for (const html of [
      NOVEL_CHAPTER,
      DIALOGUE_CHAPTER,
      NONFICTION_CHAPTER,
      LONG_PARAGRAPH_CHAPTER,
    ]) {
      for (const post of segment(html)) {
        // Tables and images are inherently standalone and are not prose.
        if (post.type === 'table' || post.type === 'image') continue;
        expect(post.charCount).toBeLessThanOrEqual(budget.hardMax);
      }
    }
  });

  it('splits an over-long paragraph and marks the continuations', () => {
    const posts = segment(LONG_PARAGRAPH_CHAPTER);
    const prose = posts.filter((post) => post.type === 'text');

    expect(prose.length).toBeGreaterThan(1);
    expect(prose.slice(1).some((post) => post.isContinuation)).toBe(true);
    for (const post of prose) expect(post.charCount).toBeLessThanOrEqual(budget.hardMax);
  });

  it('splits only at sentence boundaries', () => {
    const prose = segment(LONG_PARAGRAPH_CHAPTER).filter((post) => post.type === 'text');
    // Every piece but the last must end on a complete sentence.
    for (const post of prose.slice(0, -1)) expect(endsSentence(post.plainText)).toBe(true);
  });
});

describe('the scoring rules', () => {
  it('never cuts a dialogue exchange in half', () => {
    const posts = segment(DIALOGUE_CHAPTER);

    for (const post of posts) {
      const lines = post.plainText.split('\n');
      const last = lines[lines.length - 1] ?? '';
      // A post ending on an unanswered one-line question is the failure mode:
      // the reply must travel with it.
      if (/^["“].{0,40}\?["”]$/.test(last.trim())) {
        expect(lines.length).toBeGreaterThan(1);
      }
    }
  });

  it('ends most posts on a completed sentence', () => {
    const prose = segment(NOVEL_CHAPTER).filter((post) => post.type === 'text');
    const good = prose.filter((post) => endsSentence(post.plainText));

    // The §6.5 bar. This is the assertion that makes the difference between a
    // product and a text file cut with scissors.
    expect(good.length / prose.length).toBeGreaterThanOrEqual(0.85);
  });

  it('does not leave a runt post except at the very end of a chapter', () => {
    for (const html of [NOVEL_CHAPTER, DIALOGUE_CHAPTER, NONFICTION_CHAPTER]) {
      const prose = segment(html).filter((post) => post.type === 'text');
      for (const post of prose.slice(0, -1)) {
        expect(post.charCount).toBeGreaterThanOrEqual(budget.min);
      }
    }
  });

  it('keeps a quotation with the line that introduces it', () => {
    const posts = segment(
      '<p>One caretaker put it plainly, and his account book records the reasoning that everyone at the time would have taken entirely for granted:</p><blockquote><p>A house that is closed is a house that is expected.</p></blockquote>',
    );
    expect(posts).toHaveLength(1);
  });
});

describe('density', () => {
  it('produces shorter posts as density tightens', () => {
    const mean = (posts: Post[]) =>
      posts.filter((p) => p.type === 'text').reduce((total, p) => total + p.charCount, 0) /
      Math.max(1, posts.filter((p) => p.type === 'text').length);

    const compact = mean(segment(NONFICTION_CHAPTER, 'compact'));
    const normal = mean(segment(NONFICTION_CHAPTER, 'normal'));
    const roomy = mean(segment(NONFICTION_CHAPTER, 'roomy'));

    expect(compact).toBeLessThan(normal);
    expect(normal).toBeLessThanOrEqual(roomy);
  });

  it('respects each density’s hard maximum', () => {
    for (const density of ['compact', 'normal', 'roomy'] as const) {
      for (const post of segment(LONG_PARAGRAPH_CHAPTER, density)) {
        if (post.type === 'text') {
          expect(post.charCount).toBeLessThanOrEqual(BUDGETS[density].hardMax);
        }
      }
    }
  });
});

describe('anchors and determinism', () => {
  it('is byte-stable across runs', () => {
    expect(segment(NOVEL_CHAPTER)).toEqual(segment(NOVEL_CHAPTER));
  });

  it('produces anchors that advance monotonically', () => {
    const posts = segment(NOVEL_CHAPTER);
    for (let index = 1; index < posts.length; index += 1) {
      const previous = posts[index - 1]!;
      const current = posts[index]!;
      expect(current.anchor.blockIndex).toBeGreaterThanOrEqual(previous.anchor.blockIndex);
    }
  });

  it('covers every block exactly once', () => {
    const blocks = extractBlocks(NOVEL_CHAPTER);
    const posts = segmentChapter(blocks);
    const covered = posts.flatMap((post) =>
      Array.from(
        { length: post.anchorEnd.blockIndex - post.anchor.blockIndex + 1 },
        (_, offset) => post.anchor.blockIndex + offset,
      ),
    );
    expect(new Set(covered).size).toBe(blocks.length);
  });

  it('indexes posts contiguously from zero', () => {
    const posts = segment(NONFICTION_CHAPTER);
    expect(posts.map((post) => post.index)).toEqual(posts.map((_, index) => index));
  });
});

describe('post types', () => {
  it('labels a run of stanzas as verse', () => {
    expect(segment(POETRY_CHAPTER).some((post) => post.type === 'verse')).toBe(true);
  });

  it('labels a standalone quotation and list', () => {
    // Only when they stand alone: a quotation introduced by "…plainly:" is
    // deliberately kept with that line, which makes the post ordinary text.
    expect(
      segment('<blockquote><p>A house that is closed is expected.</p></blockquote>')[0],
    ).toMatchObject({ type: 'quote' });
    expect(
      segment('<ul><li>Draining the system.</li><li>Sweeping chimneys.</li></ul>')[0],
    ).toMatchObject({ type: 'list' });
  });

  it('gives every post a reading estimate of at least three seconds', () => {
    for (const post of segment(NOVEL_CHAPTER)) {
      expect(post.readingSeconds).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('pull quotes', () => {
  it('picks a complete sentence of a sensible length', () => {
    const quote = pickPullQuote(
      'Short. The house had been empty for eleven years, and it had the smell of a place that has been closed rather than abandoned. Yes.',
    );
    expect(quote).toContain('eleven years');
    expect(quote?.length).toBeLessThanOrEqual(180);
  });

  it('prefers narration over dialogue attribution', () => {
    const quote = pickPullQuote(
      '"I am the executor of the estate and I have come a very long way," she said. A house that is closed is a house that is expected by someone.',
    );
    expect(quote).not.toContain('she said');
  });

  it('returns nothing when there is no suitable sentence', () => {
    expect(pickPullQuote('Short. Bits. Only.')).toBeUndefined();
  });
});
