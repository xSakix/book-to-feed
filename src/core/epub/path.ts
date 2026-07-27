/**
 * Path handling for entries inside an EPUB archive.
 *
 * Every href in an EPUB is relative to the file that contains it, so a wrong
 * resolution here shows up much later as a mysteriously missing image. Zip
 * entry names are also percent-encoded in some producers and not in others,
 * which is why lookups normalise both spellings.
 */

/** Splits `chapter.xhtml#section-2` into its path and fragment. */
export function splitFragment(href: string): { path: string; fragment: string | undefined } {
  const hash = href.indexOf('#');
  if (hash === -1) return { path: href, fragment: undefined };
  return { path: href.slice(0, hash), fragment: href.slice(hash + 1) || undefined };
}

/** Collapses `.` and `..` segments. Leading `..` are dropped — an archive has no parent. */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return out.join('/');
}

/** The directory part of an archive path, without a trailing slash. */
export function dirname(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

/**
 * Resolves `href` against the file it appeared in.
 *
 * Absolute URLs (http:, data:, mailto:) are returned untouched — the caller
 * decides what to do with them, which for us means refusing to load them.
 */
export function resolveHref(baseFile: string, href: string): string {
  if (isExternal(href)) return href;
  const { path } = splitFragment(href);
  if (path === '') return normalizePath(baseFile);
  if (path.startsWith('/')) return normalizePath(path);
  const base = dirname(baseFile);
  return normalizePath(base ? `${base}/${path}` : path);
}

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** True for anything that points outside the archive, including protocol-relative URLs. */
export function isExternal(href: string): boolean {
  return href.startsWith('//') || SCHEME.test(href);
}

/**
 * Candidate spellings of an archive path, most likely first.
 *
 * Producers disagree about percent-encoding entry names, so a book with a space
 * in a filename can store `a b.xhtml` while its OPF says `a%20b.xhtml`.
 */
export function pathCandidates(path: string): string[] {
  const candidates = new Set<string>([path]);
  try {
    candidates.add(decodeURIComponent(path));
  } catch {
    // Malformed escapes: the raw spelling is all we have.
  }
  candidates.add(encodeURI(path));
  return [...candidates];
}
