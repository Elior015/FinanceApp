/**
 * Bidi control characters that browsers/terminals sometimes embed in
 * scraped Hebrew text (LRM/RLM, embedding/override marks, isolate
 * marks). Stripped before hashing/storage so they can't affect string
 * equality or, worse, get echoed into a UI context where they could
 * flip surrounding punctuation.
 *
 * Built from numeric code points (not a regex literal containing the
 * actual invisible characters) so the source stays plain ASCII and
 * can't be silently mangled by an editor or this text pipeline.
 */
const BIDI_CONTROL_CODEPOINTS = new Set<number>([
  0x200e, // LRM
  0x200f, // RLM
  0x202a, // LRE
  0x202b, // RLE
  0x202c, // PDF
  0x202d, // LRO
  0x202e, // RLO
  0x2066, // LRI
  0x2067, // RLI
  0x2068, // FSI
  0x2069, // PDI
]);

function stripBidiControlChars(input: string): string {
  let result = "";
  for (const ch of input) {
    if (!BIDI_CONTROL_CODEPOINTS.has(ch.codePointAt(0) ?? -1)) {
      result += ch;
    }
  }
  return result;
}

export function normalizeScrapedText(input: string): string {
  return stripBidiControlChars(input.normalize("NFC"))
    .replace(/\s+/g, " ")
    .trim();
}
