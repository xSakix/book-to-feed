/** Reading direction, from the OPF `page-progression-direction`. */
export type PageProgression = 'ltr' | 'rtl';

export interface BookMetadata {
  title: string;
  authors: string[];
  language: string;
  /** The `dc:identifier` the publisher assigned — not our storage key. */
  identifier: string | undefined;
  publisher: string | undefined;
  description: string | undefined;
  published: string | undefined;
  pageProgression: PageProgression;
  /**
   * `rendition:layout="pre-paginated"`. Comics and heavily designed books fit
   * the feed metaphor badly and get routed to reader mode instead (#44).
   */
  fixedLayout: boolean;
}

export interface ManifestItem {
  id: string;
  /** Archive path, already resolved against the OPF directory. */
  href: string;
  mediaType: string;
  properties: string[];
}

export interface SpineItem {
  idref: string;
  href: string;
  mediaType: string;
  /** `linear="no"` marks content outside the main reading order. */
  linear: boolean;
}

export interface TocEntry {
  title: string;
  /** Archive path with any fragment stripped. */
  href: string;
  fragment: string | undefined;
  depth: number;
  children: TocEntry[];
}

export interface EpubPackage {
  opfPath: string;
  metadata: BookMetadata;
  manifest: ManifestItem[];
  spine: SpineItem[];
  coverHref: string | undefined;
}

/** A chapter as it exists after parsing, before segmentation (M2). */
export interface ParsedChapter {
  index: number;
  title: string;
  href: string;
  order: number;
  tocDepth: number;
  parentIndex: number | undefined;
  /** Sanitised XHTML. Nothing unsanitised is ever stored or rendered. */
  html: string;
  charCount: number;
}

export const XHTML_MEDIA_TYPES = new Set([
  'application/xhtml+xml',
  'text/html',
  'application/x-dtbook+xml',
]);
