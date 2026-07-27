/**
 * XML/XHTML parsing helpers.
 *
 * Uses the platform `DOMParser`, which is why parsing runs on the main thread —
 * `DOMParser` is not exposed to workers. The expensive part of an import
 * (inflating the archive) is what actually goes off-thread; see
 * `src/workers/unzip.worker.ts`.
 */

export class XmlParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XmlParseError';
  }
}

/**
 * Parses XML, turning the browser's in-band error reporting into an exception.
 *
 * `DOMParser` reports XML failures by returning a document whose content is a
 * `<parsererror>` element rather than by throwing, so a caller that does not
 * check ends up quietly treating a broken file as an empty one.
 */
export function parseXml(text: string, mimeType: DOMParserSupportedType = 'text/xml'): Document {
  const doc = new DOMParser().parseFromString(text, mimeType);
  const error = doc.querySelector('parsererror');
  if (error) {
    throw new XmlParseError(error.textContent?.trim().split('\n')[0] ?? 'Malformed XML');
  }
  return doc;
}

/**
 * Parses XHTML, falling back to the HTML parser.
 *
 * Plenty of shipped EPUBs contain XHTML that is not well-formed. A reader that
 * refuses those books is useless, so we retry with the forgiving parser rather
 * than reject the file.
 */
export function parseMarkup(text: string): Document {
  try {
    return parseXml(text, 'application/xhtml+xml');
  } catch {
    return new DOMParser().parseFromString(text, 'text/html');
  }
}

/**
 * Finds elements by local name, ignoring namespace prefixes.
 *
 * EPUB producers vary in how they declare and prefix namespaces, and
 * `getElementsByTagNameNS` needs the exact URI. Matching on local name is what
 * actually survives contact with real books.
 */
export function byLocalName(root: ParentNode, localName: string): Element[] {
  const wanted = localName.toLowerCase();
  return [...root.querySelectorAll('*')].filter(
    (element) => element.localName.toLowerCase() === wanted,
  );
}

export function firstByLocalName(root: ParentNode, localName: string): Element | undefined {
  return byLocalName(root, localName)[0];
}

/** Attribute lookup that ignores namespace prefixes (`opf:role`, `epub:type`, …). */
export function attr(element: Element, name: string): string | undefined {
  const direct = element.getAttribute(name);
  if (direct !== null) return direct;

  const wanted = name.toLowerCase();
  for (const attribute of element.attributes) {
    const local = attribute.name.includes(':')
      ? attribute.name.slice(attribute.name.indexOf(':') + 1)
      : attribute.name;
    if (local.toLowerCase() === wanted) return attribute.value;
  }
  return undefined;
}

export function text(element: Element | undefined): string | undefined {
  const value = element?.textContent?.trim();
  return value ? value : undefined;
}
