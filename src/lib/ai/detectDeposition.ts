/**
 * LEXX — Deposition Detection
 *
 * Deterministic heuristics to detect whether a document is a deposition
 * transcript. No AI calls — pure string matching on filename and text prefix.
 */

const FILENAME_PATTERNS = [
  /deposition/i,
  /\bdepo\b/i,
  /transcript/i,
  /examination[_\s-]*under[_\s-]*oath/i,
  /\beuo\b/i,
];

const TEXT_PATTERNS = [
  /deposition of/i,
  /taken on behalf of/i,
  /appearances:/i,
  /examination by/i,
  /being first duly sworn/i,
  /certified court reporter/i,
];

/**
 * Returns true if any heuristic matches, indicating this is likely a
 * deposition transcript.
 */
export function detectDeposition(fileName: string, textPrefix: string): boolean {
  // 1. Filename heuristics
  for (const pattern of FILENAME_PATTERNS) {
    if (pattern.test(fileName)) return true;
  }

  // 2. Text prefix heuristics
  for (const pattern of TEXT_PATTERNS) {
    if (pattern.test(textPrefix)) return true;
  }

  // 3. Q&A line density: first 50 lines with >10 starting "Q." or "A."
  const lines = textPrefix.split(/\r?\n/).slice(0, 50);
  const qaCount = lines.filter((l) => /^[QA]\.\s/.test(l.trim())).length;
  if (qaCount > 10) return true;

  return false;
}
