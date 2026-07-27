import DOMPurify from 'dompurify';
import { isExternal, resolveHref } from '~/core/epub/path';

/**
 * Sanitisation of book content.
 *
 * An EPUB is an untrusted archive of arbitrary XHTML, CSS and JavaScript. The
 * threat we are defending against is a crafted book executing script in our
 * origin and reading the reader's entire library out of IndexedDB.
 *
 * Content is sanitised on the way *in*, before it is ever stored, so nothing
 * dangerous can be sitting in the database waiting for a future rendering bug
 * to set it off.
 */

/** Inline styles worth keeping: they carry meaning the markup does not. */
const ALLOWED_STYLE_PROPERTIES = new Set([
  'font-style',
  'font-weight',
  'text-align',
  'text-indent',
  'text-decoration',
]);

const ALLOWED_TAGS = [
  'p',
  'div',
  'span',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'em',
  'i',
  'strong',
  'b',
  'u',
  's',
  'small',
  'sub',
  'sup',
  'mark',
  'blockquote',
  'q',
  'cite',
  'pre',
  'code',
  'kbd',
  'samp',
  'var',
  'ul',
  'ol',
  'li',
  'dl',
  'dt',
  'dd',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'colgroup',
  'col',
  'a',
  'img',
  'figure',
  'figcaption',
  'picture',
  'source',
  'section',
  'article',
  'aside',
  'header',
  'footer',
  'nav',
  'main',
  'ruby',
  'rt',
  'rp',
  'bdi',
  'bdo',
  'wbr',
  'abbr',
  'time',
  'address',
  'ins',
  'del',
];

const ALLOWED_ATTR = [
  'href',
  'src',
  'srcset',
  'alt',
  'title',
  'class',
  'id',
  'style',
  'colspan',
  'rowspan',
  'headers',
  'scope',
  'span',
  'dir',
  'lang',
  'xml:lang',
  'datetime',
  'cite',
  'type',
  'start',
  'value',
  'width',
  'height',
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-hidden',
];

export interface SanitizeOptions {
  /** Archive path of the file being sanitised, for resolving relative hrefs. */
  basePath: string;
  /**
   * Called for each in-archive resource reference (images, mostly). Return a
   * token the renderer can later swap for a Blob URL, or `undefined` to drop it.
   */
  resolveResource?: (archivePath: string) => string | undefined;
}

export interface SanitizeResult {
  html: string;
  /** In-archive paths this document references, for lazy Blob loading later. */
  resources: string[];
  /** Internal links, keyed by target archive path — the raw material for the chapter graph (#33). */
  links: { href: string; fragment: string | undefined }[];
  /** External URLs that were neutralised, surfaced so we can be honest about it. */
  blockedExternal: string[];
}

/**
 * Attribute used in stored HTML in place of `src`.
 *
 * Storing a real `src` would mean the browser tries to fetch it the instant the
 * HTML is parsed, before any of our code runs. A custom attribute makes that
 * impossible and forces every image through the Blob URL lifecycle (#31).
 */
export const RESOURCE_ATTR = 'data-btf-resource';
export const EXTERNAL_ATTR = 'data-btf-external';

/**
 * Sanitises one chapter of book markup.
 *
 * Must be called on the main thread: DOMPurify needs a DOM, which workers do
 * not have.
 */
export function sanitizeChapter(markup: string, options: SanitizeOptions): SanitizeResult {
  const resources = new Set<string>();
  const links: SanitizeResult['links'] = [];
  const blockedExternal: string[] = [];

  const purify = DOMPurify(window);

  const hooks = {
    afterSanitizeAttributes: (node: Element) => {
      pruneStyle(node);
      rewriteImage(node, options, resources, blockedExternal);
      rewriteAnchor(node, options, links, blockedExternal);
    },
  };

  purify.addHook('afterSanitizeAttributes', hooks.afterSanitizeAttributes);

  let clean: string;
  try {
    clean = purify.sanitize(markup, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      // Belt and braces: these are already excluded by the allow-list, but an
      // explicit refusal survives someone widening the list carelessly.
      FORBID_TAGS: [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'form',
        'input',
        'link',
        'meta',
      ],
      FORBID_ATTR: ['srcdoc', 'formaction', 'ping', 'target'],
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: true,
      KEEP_CONTENT: true,
      WHOLE_DOCUMENT: false,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
    });
  } finally {
    purify.removeHook('afterSanitizeAttributes');
  }

  return { html: clean, resources: [...resources], links, blockedExternal };
}

/** Drops every declaration except the handful that carry meaning. */
function pruneStyle(node: Element): void {
  const style = node.getAttribute('style');
  if (style === null) return;

  const kept = style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter((declaration) => {
      const property = declaration.slice(0, declaration.indexOf(':')).trim().toLowerCase();
      if (!ALLOWED_STYLE_PROPERTIES.has(property)) return false;
      // url() can smuggle a network request through a style attribute.
      return !/url\s*\(/i.test(declaration) && !/expression\s*\(/i.test(declaration);
    });

  if (kept.length > 0) node.setAttribute('style', kept.join('; '));
  else node.removeAttribute('style');
}

function rewriteImage(
  node: Element,
  options: SanitizeOptions,
  resources: Set<string>,
  blockedExternal: string[],
): void {
  if (node.localName !== 'img' && node.localName !== 'source') return;

  // srcset can carry a remote URL past a src-only check.
  node.removeAttribute('srcset');

  const src = node.getAttribute('src');
  node.removeAttribute('src');
  if (src === null) return;

  if (isExternal(src)) {
    // A remote image is a tracking pixel that tells a third party what someone
    // is reading, and when. It never loads.
    blockedExternal.push(src);
    node.setAttribute(EXTERNAL_ATTR, 'blocked');
    return;
  }

  const archivePath = resolveHref(options.basePath, src);
  const token = options.resolveResource ? options.resolveResource(archivePath) : archivePath;
  if (token === undefined) return;

  resources.add(archivePath);
  node.setAttribute(RESOURCE_ATTR, token);
}

function rewriteAnchor(
  node: Element,
  options: SanitizeOptions,
  links: SanitizeResult['links'],
  blockedExternal: string[],
): void {
  if (node.localName !== 'a') return;

  const href = node.getAttribute('href');
  if (href === null) return;

  if (isExternal(href)) {
    // Rendered as inert text rather than a live link. Nothing in a book should
    // be able to navigate the reader off-app without them choosing to.
    blockedExternal.push(href);
    node.removeAttribute('href');
    node.setAttribute(EXTERNAL_ATTR, href);
    return;
  }

  if (href.startsWith('#')) {
    node.setAttribute('href', href);
    return;
  }

  const hash = href.indexOf('#');
  const path = hash === -1 ? href : href.slice(0, hash);
  const fragment = hash === -1 ? undefined : href.slice(hash + 1) || undefined;
  const target = resolveHref(options.basePath, path);

  links.push({ href: target, fragment });
  node.removeAttribute('href');
  node.setAttribute('data-btf-link', target + (fragment ? `#${fragment}` : ''));
}
