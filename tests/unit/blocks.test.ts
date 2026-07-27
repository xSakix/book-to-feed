import { describe, expect, it } from 'vitest';
import { extractBlocks } from '~/core/segment/blocks';
import {
  DIALOGUE_CHAPTER,
  NONFICTION_CHAPTER,
  NOVEL_CHAPTER,
  POETRY_CHAPTER,
} from '../fixtures/prose';

const types = (html: string) => extractBlocks(html).map((block) => block.type);

describe('block extraction', () => {
  it('types the ordinary shapes of a chapter', () => {
    const blocks = extractBlocks(NOVEL_CHAPTER);

    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(types(NOVEL_CHAPTER)).toContain('paragraph');
    expect(types(NOVEL_CHAPTER)).toContain('dialogue');
    expect(types(NOVEL_CHAPTER)).toContain('sceneBreak');
  });

  it('recognises dialogue by its opening mark, including typographic quotes', () => {
    expect(types('<p>"Hello?" she called.</p>')).toEqual(['dialogue']);
    expect(types('<p>“Hello?” she called.</p>')).toEqual(['dialogue']);
    expect(types('<p>— Bonjour, dit-elle.</p>')).toEqual(['dialogue']);
    expect(types('<p>She said hello.</p>')).toEqual(['paragraph']);
  });

  it('treats an ornament paragraph as a scene break', () => {
    expect(types('<p>* * *</p>')).toEqual(['sceneBreak']);
    expect(types('<p>###</p>')).toEqual(['sceneBreak']);
    expect(types('<hr/>')).toEqual(['sceneBreak']);
  });

  it('detects verse without mistaking prose for it', () => {
    expect(types(POETRY_CHAPTER).filter((type) => type === 'verse')).toHaveLength(3);
    // One line break in a prose paragraph is not a poem.
    expect(
      types('<p>A sentence.<br/>Another sentence that runs on for a while longer.</p>'),
    ).toEqual(['paragraph']);
  });

  it('keeps tables, lists and quotations as their own blocks', () => {
    const found = types(NONFICTION_CHAPTER);
    expect(found).toContain('table');
    expect(found).toContain('list');
    expect(found).toContain('blockquote');
  });

  it('descends into containers rather than treating them as blocks', () => {
    expect(types('<div><section><p>One.</p><p>Two.</p></section></div>')).toEqual([
      'paragraph',
      'paragraph',
    ]);
  });

  it('treats a figure holding an image as an image, with its caption as text', () => {
    const blocks = extractBlocks(
      '<figure><img alt="A plate"/><figcaption>Plate 4</figcaption></figure>',
    );
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ type: 'image', text: 'Plate 4' });
  });

  it('drops page breaks, which mean nothing in a feed', () => {
    expect(types('<p>Real text.</p><span epub:type="pagebreak">41</span>')).toEqual(['paragraph']);
  });

  it('indexes blocks contiguously from zero', () => {
    const blocks = extractBlocks(DIALOGUE_CHAPTER);
    expect(blocks.map((block) => block.index)).toEqual(blocks.map((_, index) => index));
  });

  it('is deterministic — the same markup always yields the same stream', () => {
    expect(extractBlocks(NOVEL_CHAPTER)).toEqual(extractBlocks(NOVEL_CHAPTER));
  });

  it('loses no prose', () => {
    const blocks = extractBlocks(NOVEL_CHAPTER);
    const joined = blocks.map((block) => block.text).join(' ');
    expect(joined).toContain('The house had been empty for eleven years');
    expect(joined).toContain('She went in.');
  });
});
