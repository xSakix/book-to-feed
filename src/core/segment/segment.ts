import type { PostDensity } from '~/app/store/settings';
import type { Anchor } from '~/core/db/schema';
import type { Block } from './blocks';
import { endsMidClause, endsOnCliffhanger, endsSentence, splitSentences } from './sentences';

/**
 * Stage 2: block stream → posts.
 *
 * The whole point of the scoring below is that **a post should end on a beat**.
 * The difference between "…she opened the door." and "…she opened the" is the
 * difference between a product and a toy, and no amount of UI polish rescues
 * the second one.
 */

export type PostType =
  'text' | 'heading' | 'image' | 'quote' | 'verse' | 'list' | 'table' | 'code' | 'separator';

export interface Post {
  index: number;
  type: PostType;
  html: string;
  plainText: string;
  anchor: Anchor;
  anchorEnd: Anchor;
  charCount: number;
  readingSeconds: number;
  /** A continuation of the previous post; the UI hides its header and welds them. */
  isContinuation: boolean;
  pullQuote: string | undefined;
}

export interface Budget {
  min: number;
  target: number;
  softMax: number;
  hardMax: number;
}

/**
 * Character budgets per density (ARCHITECTURE.md §6.2).
 *
 * Latin-calibrated. A CJK character carries far more content than a Latin one,
 * so applying these unchanged to a Japanese book produces posts roughly three
 * times too long — handled by the script-aware budgets in #45.
 */
export const BUDGETS: Record<PostDensity, Budget> = {
  compact: { min: 120, target: 400, softMax: 700, hardMax: 1000 },
  normal: { min: 180, target: 650, softMax: 1100, hardMax: 1600 },
  roomy: { min: 240, target: 900, softMax: 1500, hardMax: 2200 },
};

const CHARS_PER_MINUTE = 900;

/** Blocks that are always a post of their own. */
const STANDALONE: Partial<Record<Block['type'], PostType>> = {
  heading: 'heading',
  image: 'image',
  table: 'table',
  code: 'code',
  sceneBreak: 'separator',
};

export interface SegmentOptions {
  density?: PostDensity;
  locale?: string;
}

/** A post before it becomes one: the blocks it holds, plus how it was formed. */
interface Group {
  blocks: Block[];
  isContinuation: boolean;
  /** Standalone groups are governed by hard rules and never merge with a neighbour. */
  standalone: boolean;
}

export function segmentChapter(blocks: Block[], options: SegmentOptions = {}): Post[] {
  const budget = BUDGETS[options.density ?? 'normal'];
  const groups = groupBlocks(blocks, budget, options.locale);

  return rebalance(groups, budget).map((group, index) =>
    makePost(index, group.blocks, group.isContinuation, options.locale),
  );
}

function groupBlocks(blocks: Block[], budget: Budget, locale?: string): Group[] {
  const groups: Group[] = [];
  let pending: Block[] = [];

  const flush = () => {
    if (pending.length === 0) return;
    groups.push({ blocks: pending, isContinuation: false, standalone: false });
    pending = [];
  };

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;

    // Hard rules first: these are not negotiable and are applied before scoring.
    if (STANDALONE[block.type]) {
      flush();
      groups.push({ blocks: [block], isContinuation: false, standalone: true });
      continue;
    }

    // A paragraph longer than the hard budget is split at sentence boundaries;
    // everything before it has to close first so the pieces stay adjacent.
    if (block.text.length > budget.hardMax) {
      flush();
      for (const [part, piece] of splitLongBlock(block, budget, locale).entries()) {
        groups.push({ blocks: [piece], isContinuation: part > 0, standalone: false });
      }
      continue;
    }

    pending.push(block);

    const length = pendingLength(pending);
    if (length < budget.target) continue;

    const next = blocks[index + 1];
    if (length >= budget.hardMax || breakScore(block, next, length, budget) > 0) flush();
  }

  flush();
  return groups;
}

/**
 * Folds runt posts back into a neighbour.
 *
 * A break scored well on its own merits can still strand the two paragraphs
 * behind it — most often just before a scene break or a heading, where the hard
 * rules force a boundary the scorer never got to weigh in on. The §6.5 rule is
 * that no post falls below the minimum except the last of a chapter, so this
 * pass enforces it after the fact rather than complicating the scorer.
 */
function rebalance(groups: Group[], budget: Budget): Group[] {
  const out = [...groups];

  for (let index = 0; index < out.length; index += 1) {
    const group = out[index]!;
    if (group.standalone) continue;
    if (index === out.length - 1) continue; // A short final post is allowed.
    if (groupLength(group) >= budget.min) continue;

    const previous = out[index - 1];
    if (
      previous &&
      !previous.standalone &&
      groupLength(previous) + groupLength(group) <= budget.hardMax
    ) {
      previous.blocks = [...previous.blocks, ...group.blocks];
      out.splice(index, 1);
      index -= 1;
      continue;
    }

    const next = out[index + 1];
    if (next && !next.standalone && groupLength(next) + groupLength(group) <= budget.hardMax) {
      next.blocks = [...group.blocks, ...next.blocks];
      next.isContinuation = group.isContinuation;
      out.splice(index, 1);
      index -= 1;
    }
    // Otherwise it stays: both neighbours are standalone or already full, and a
    // short post beats breaking a hard rule.
  }

  return out;
}

function groupLength(group: Group): number {
  return pendingLength(group.blocks);
}

function pendingLength(blocks: Block[]): number {
  return blocks.reduce((total, block) => total + block.text.length, 0);
}

/**
 * Should the post end after `block`?
 *
 * Positive means break. The weights are an informed starting point rather than
 * truth — the golden-file harness (#24) exists so they can be tuned against real
 * books without silently wrecking anything.
 */
export function breakScore(
  block: Block,
  next: Block | undefined,
  length: number,
  budget: Budget,
): number {
  let score = 0;

  if (endsSentence(block.text)) score += 3;
  if (endsOnCliffhanger(block.text)) score += 2;

  if (next && (next.type === 'heading' || next.type === 'image' || next.type === 'sceneBreak')) {
    score += 1.5;
  }

  // Never cut an exchange in half: a reply belongs with what it answers.
  if (block.type === 'dialogue' && next?.type === 'dialogue') score -= 4;

  // A one-line beat followed by more dialogue is mid-exchange too.
  if (block.text.length < 80 && next?.type === 'dialogue') score -= 3;

  if (endsMidClause(block.text)) score -= 2;

  // "…and then she said:" belongs with the quotation that follows it.
  if (next && (next.type === 'blockquote' || next.type === 'verse') && block.text.endsWith(':')) {
    score -= 1.5;
  }

  if (length < budget.min) score -= 5;

  // Pressure grows the further past target we run.
  score += 0.02 * (length - budget.target);

  return score;
}

/**
 * Splits an over-long paragraph at sentence boundaries.
 *
 * Rebalances so no piece is left below the minimum — a two-word orphan reads
 * worse than a slightly long post.
 */
function splitLongBlock(block: Block, budget: Budget, locale?: string): Block[] {
  const sentences = splitSentences(block.text, locale);
  if (sentences.length <= 1) return [block];

  const pieces: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > budget.softMax && current) {
      pieces.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) pieces.push(current);

  // Fold a runt tail back into its predecessor.
  if (pieces.length > 1) {
    const last = pieces[pieces.length - 1]!;
    if (last.length < budget.min) {
      pieces[pieces.length - 2] = `${pieces[pieces.length - 2]!} ${last}`;
      pieces.pop();
    }
  }

  // Every piece keeps the source block's index; the offset is what
  // distinguishes them, which is what keeps anchors meaningful.
  return pieces.map((text, part) => ({
    ...block,
    text,
    html: `<p>${escapeText(text)}</p>`,
    index: block.index,
    charOffset: part === 0 ? 0 : Math.max(0, block.text.indexOf(text)),
  }));
}

function makePost(index: number, blocks: Block[], isContinuation: boolean, locale?: string): Post {
  const first = blocks[0]!;
  const last = blocks[blocks.length - 1]!;
  const plainText = blocks
    .map((block) => block.text)
    .filter(Boolean)
    .join('\n');
  const charCount = plainText.length;

  return {
    index,
    type: postType(blocks),
    html: blocks.map((block) => block.html).join('\n'),
    plainText,
    anchor: { blockIndex: first.index, charOffset: charOffsetOf(first) },
    anchorEnd: { blockIndex: last.index, charOffset: charOffsetOf(last) + last.text.length },
    charCount,
    readingSeconds: Math.max(3, Math.round((charCount / CHARS_PER_MINUTE) * 60)),
    isContinuation,
    pullQuote: pickPullQuote(plainText, locale),
  };
}

function charOffsetOf(block: Block): number {
  return block.charOffset ?? 0;
}

function postType(blocks: Block[]): PostType {
  const first = blocks[0]!;
  const standalone = STANDALONE[first.type];
  if (standalone && blocks.length === 1) return standalone;

  // A run of consecutive stanzas is still a poem, and a run of quotations is
  // still a quotation — the type follows the content, not the block count.
  const every = (type: Block['type']) => blocks.every((block) => block.type === type);
  if (every('blockquote')) return 'quote';
  if (every('verse')) return 'verse';
  if (every('list')) return 'list';

  return 'text';
}

/**
 * The strongest sentence in a post, for share cards (#37).
 *
 * Prefers a complete sentence of moderate length that is not dialogue
 * attribution — "he said" makes a poor quote card.
 */
export function pickPullQuote(plainText: string, locale?: string): string | undefined {
  const candidates = splitSentences(plainText, locale).filter(
    (sentence) => sentence.length >= 40 && sentence.length <= 180 && endsSentence(sentence),
  );
  if (candidates.length === 0) return undefined;

  const scored = candidates.map((sentence) => {
    let score = 0;
    // Nearer the middle of the comfortable range is better.
    score -= Math.abs(sentence.length - 100) / 100;
    if (/\b(said|asked|replied|answered|muttered)\b/i.test(sentence)) score -= 0.5;
    if (endsOnCliffhanger(sentence)) score += 0.3;
    return { sentence, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.sentence;
}

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
