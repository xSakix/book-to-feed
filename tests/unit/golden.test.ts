import { describe, expect, it } from 'vitest';
import { extractBlocks } from '~/core/segment/blocks';
import { BUDGETS, segmentChapter, type Post } from '~/core/segment/segment';
import { endsSentence } from '~/core/segment/sentences';
import {
  DIALOGUE_CHAPTER,
  LONG_PARAGRAPH_CHAPTER,
  NONFICTION_CHAPTER,
  NOVEL_CHAPTER,
  POETRY_CHAPTER,
} from '../fixtures/prose';

/**
 * Golden-file harness (#24).
 *
 * The weights in `segment.ts` are an informed starting point, not truth. This
 * file is what makes tuning them safe: the snapshot shows exactly which posts
 * moved, and the metrics show whether the move was an improvement.
 *
 * A snapshot diff here is the point, not a failure. Read it, decide whether the
 * new cuts read better, then update it deliberately with `vitest -u`.
 *
 * Genres are kept apart on purpose: non-fiction, poetry and plays behave very
 * differently from novels and must not be held to a novel's numbers.
 */

const GENRES = {
  novel: NOVEL_CHAPTER,
  dialogue: DIALOGUE_CHAPTER,
  nonfiction: NONFICTION_CHAPTER,
  poetry: POETRY_CHAPTER,
  'long-paragraph': LONG_PARAGRAPH_CHAPTER,
} as const;

interface Metrics {
  posts: number;
  proseposts: number;
  meanLength: number;
  medianLength: number;
  sentenceEndRate: number;
  longest: number;
  shortest: number;
}

function metricsFor(posts: Post[]): Metrics {
  const prose = posts.filter((post) => post.type === 'text');
  const lengths = prose.map((post) => post.charCount).sort((a, b) => a - b);
  const endings = prose.filter((post) => endsSentence(post.plainText)).length;

  return {
    posts: posts.length,
    proseposts: prose.length,
    meanLength: Math.round(
      lengths.reduce((total, value) => total + value, 0) / (lengths.length || 1),
    ),
    medianLength: lengths[Math.floor(lengths.length / 2)] ?? 0,
    sentenceEndRate: Number((endings / (prose.length || 1)).toFixed(2)),
    longest: lengths[lengths.length - 1] ?? 0,
    shortest: lengths[0] ?? 0,
  };
}

/** A compact, readable projection — the snapshot has to be reviewable by eye. */
function shapeOf(posts: Post[]) {
  return posts.map((post) => ({
    type: post.type,
    chars: post.charCount,
    continuation: post.isContinuation || undefined,
    starts: post.plainText.slice(0, 45),
    ends: post.plainText.slice(-35),
  }));
}

describe('golden segmentation', () => {
  // Printed so a weight change shows up as a metrics delta in the CI log, not
  // just as a snapshot diff to squint at.
  it('reports quality metrics per genre', () => {
    const report = Object.fromEntries(
      Object.entries(GENRES).map(([genre, html]) => [
        genre,
        metricsFor(segmentChapter(extractBlocks(html))),
      ]),
    );
    console.table(report);
    expect(Object.keys(report)).toHaveLength(Object.keys(GENRES).length);
  });

  for (const [genre, html] of Object.entries(GENRES)) {
    it(`${genre} — post shape is stable`, () => {
      expect(shapeOf(segmentChapter(extractBlocks(html)))).toMatchSnapshot();
    });

    it(`${genre} — quality metrics are stable`, () => {
      expect(metricsFor(segmentChapter(extractBlocks(html)))).toMatchSnapshot();
    });
  }
});

describe('quality bars that must hold for every genre', () => {
  const budget = BUDGETS.normal;

  for (const [genre, html] of Object.entries(GENRES)) {
    it(`${genre} — no prose post exceeds the hard maximum`, () => {
      for (const post of segmentChapter(extractBlocks(html))) {
        if (post.type === 'table' || post.type === 'image') continue;
        expect(post.charCount).toBeLessThanOrEqual(budget.hardMax);
      }
    });

    it(`${genre} — segmentation is byte-stable`, () => {
      const once = segmentChapter(extractBlocks(html));
      const twice = segmentChapter(extractBlocks(html));
      expect(once).toEqual(twice);
    });
  }

  it('prose genres end at least 85% of posts on a sentence', () => {
    // Poetry is excluded: verse legitimately ends without terminal punctuation,
    // and holding it to prose numbers would only produce a wrong incentive.
    for (const genre of ['novel', 'dialogue', 'nonfiction'] as const) {
      const { sentenceEndRate } = metricsFor(segmentChapter(extractBlocks(GENRES[genre])));
      expect(sentenceEndRate, `${genre} sentence-end rate`).toBeGreaterThanOrEqual(0.85);
    }
  });
});
