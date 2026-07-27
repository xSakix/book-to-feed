import type { ArchiveReader } from './archive';
import { byLocalName, parseXml } from './xml';

const ENCRYPTION_PATH = 'META-INF/encryption.xml';
const RIGHTS_PATH = 'META-INF/rights.xml';
const LCP_PATH = 'META-INF/license.lcpl';

/**
 * Algorithms EPUB uses for *font obfuscation*, which is not DRM.
 *
 * Obfuscated fonts are a legitimate part of the spec: the text is perfectly
 * readable, only the embedded font file is scrambled. Rejecting those books
 * would turn away titles we can read fine, so we distinguish them from real
 * encryption rather than treating any `encryption.xml` as DRM (#18).
 */
const OBFUSCATION_ALGORITHMS = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC4SHA1',
]);

export interface DrmStatus {
  protected: boolean;
  /** Present when `protected` is true. */
  scheme?: 'adobe-adept' | 'readium-lcp' | 'unknown';
  /** True when the only encryption found is font obfuscation, which we support. */
  obfuscatedFontsOnly: boolean;
}

/**
 * Detects DRM. We do not strip it — protected books are rejected with an
 * explanation (ARCHITECTURE.md §9, §15).
 */
export async function detectDrm(archive: ArchiveReader): Promise<DrmStatus> {
  if (await archive.has(LCP_PATH)) {
    return { protected: true, scheme: 'readium-lcp', obfuscatedFontsOnly: false };
  }

  if (await archive.has(RIGHTS_PATH)) {
    return { protected: true, scheme: 'adobe-adept', obfuscatedFontsOnly: false };
  }

  if (!(await archive.has(ENCRYPTION_PATH))) {
    return { protected: false, obfuscatedFontsOnly: false };
  }

  let algorithms: string[];
  try {
    const doc = parseXml(await archive.readText(ENCRYPTION_PATH));
    algorithms = byLocalName(doc, 'EncryptionMethod')
      .map((node) => node.getAttribute('Algorithm') ?? '')
      .filter(Boolean);
  } catch {
    // An encryption manifest we cannot read is not one we can safely ignore.
    return { protected: true, scheme: 'unknown', obfuscatedFontsOnly: false };
  }

  if (algorithms.length > 0 && algorithms.every((name) => OBFUSCATION_ALGORITHMS.has(name))) {
    return { protected: false, obfuscatedFontsOnly: true };
  }

  return { protected: true, scheme: 'unknown', obfuscatedFontsOnly: false };
}
