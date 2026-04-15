/**
 * LEXX — Deposition Processing Pipeline
 *
 * Chunks a deposition transcript, extracts structured data from each chunk,
 * reduces/deduplicates, then produces a final synthesis with summary and
 * follow-up questions.
 */

import OpenAI from "openai";
import type { DepositionAnalysis } from "@/types";
import { MODELS } from "@/lib/ai/models";

const client = new OpenAI();
const MODEL = MODELS.fast;

// ~6000 chars ≈ 8k tokens; 500-char overlap
const CHUNK_SIZE = 6000;
const OVERLAP = 500;

const CHUNK_SYSTEM_PROMPT =
  "You are analyzing a portion of a construction litigation deposition transcript. Extract structured data for this portion only. Focus on admissions, denials, exhibits, and inconsistencies. Respond with valid JSON matching the provided schema. Leave arrays empty if nothing found in this chunk. For admissions, cite page numbers from the transcript if visible (e.g., \"Page 45\" or \"45:12\" format). Do not invent content.\n\nWhen extracting attorneysPresent, only include attorneys listed in the APPEARANCES section at the start of the transcript. Do not create separate entries for attorneys referenced by short form (e.g., \"Mr. Halpern\", \"Ms. Ruiz\") later in the Q&A body — those are the same people already listed in appearances.\n\nFor inconsistencies, identify places where the witness's own testimony conflicts with itself within the transcript. For each inconsistency, you must provide:\n- topic: short label of what the inconsistency is about\n- description: a complete explanation that includes (a) what the witness said in the first location, (b) what the witness said in the second location, and (c) why these statements conflict. Use direct language. Example: \"On page 4, the witness testified he first became aware of the balcony waterproofing issue in August 2022. On pages 7-8, when confronted with RFI No. 47 dated June 3, 2022 that he himself authored about the same waterproofing detail, he acknowledged earlier awareness. These statements conflict about when he first knew of the issue.\"\n- pages: array of page references where the conflicting statements appear\nDo not return an inconsistency with only a topic label. Every inconsistency must include a full description that an attorney can read and immediately understand without going back to the transcript.";

const SYNTHESIS_SYSTEM_PROMPT =
  "You are a construction litigation analyst. Given extracted data from a full deposition transcript, produce: (1) a 4-6 sentence executive summary of the testimony, and (2) 3-8 follow-up questions for future depositions or discovery. Be direct and specific. Cite the witness by name. Respond with valid JSON: {\"summary\": \"...\", \"followUpQuestions\": [\"...\", ...]}.";

const CHUNK_PROMPT = `Extract structured deposition data from this transcript portion and return JSON with this exact structure:
{
  "witnessName": "string or empty",
  "witnessRole": "string or empty",
  "depositionDate": "string or empty",
  "location": "string or null",
  "attorneysPresent": [{ "name": "string", "representing": "string" }],
  "courtReporter": "string or null",
  "duration": "string or null",
  "topics": ["string"],
  "keyAdmissions": [{ "topic": "string", "admission": "string", "pageReference": "string or null", "significance": "high|medium|low" }],
  "keyDenials": [{ "topic": "string", "denial": "string", "pageReference": "string or null" }],
  "exhibitsReferenced": [{ "exhibitNumber": "string", "description": "string", "pageReference": "string or null" }],
  "inconsistencies": [{ "topic": "string", "description": "string", "pages": ["string"] }],
  "objectionsSummary": { "total": 0, "sustainedCount": null, "commonGrounds": [] }
}`;

function cleanJson(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
}

function chunkWithOverlap(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end === text.length) break;
    start = end - OVERLAP;
  }
  return chunks;
}

type PartialAnalysis = Omit<DepositionAnalysis, "summary" | "followUpQuestions">;

async function extractChunk(text: string, chunkIndex: number): Promise<PartialAnalysis> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 2048,
    messages: [
      { role: "system", content: CHUNK_SYSTEM_PROMPT },
      { role: "user", content: `${CHUNK_PROMPT}\n\nTranscript portion ${chunkIndex + 1}:\n${text}` },
    ],
  });
  const usage = response.usage;
  console.log(`[Lexx:deposition] chunk ${chunkIndex + 1} tokens:`, usage);
  const raw = response.choices[0].message.content || "";
  const parsed = JSON.parse(cleanJson(raw));
  return {
    witnessName: parsed.witnessName || "",
    witnessRole: parsed.witnessRole || "",
    depositionDate: parsed.depositionDate || "",
    location: parsed.location ?? undefined,
    attorneysPresent: parsed.attorneysPresent || [],
    courtReporter: parsed.courtReporter ?? undefined,
    duration: parsed.duration ?? undefined,
    topics: parsed.topics || [],
    keyAdmissions: parsed.keyAdmissions || [],
    keyDenials: parsed.keyDenials || [],
    exhibitsReferenced: parsed.exhibitsReferenced || [],
    inconsistencies: parsed.inconsistencies || [],
    objectionsSummary: parsed.objectionsSummary || { total: 0, commonGrounds: [] },
  };
}

const LEADING_HONORIFICS = /^(mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i;
const TRAILING_HONORIFICS = /,?\s*(esq\.?|esquire|jr\.?|sr\.?|ii|iii)$/i;

function normalizeAttorneyName(name: string): string {
  return name
    .replace(LEADING_HONORIFICS, "")
    .replace(TRAILING_HONORIFICS, "")
    .trim()
    .toLowerCase();
}

function lastToken(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1].toLowerCase();
}

function deduplicateAttorneys(
  attorneys: DepositionAnalysis["attorneysPresent"]
): DepositionAnalysis["attorneysPresent"] {
  // Group by last name
  const groups = new Map<string, typeof attorneys>();
  for (const atty of attorneys) {
    const key = lastToken(normalizeAttorneyName(atty.name));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(atty);
  }

  const result: typeof attorneys = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Separate entries with real representing values from vague ones
    const VAGUE_PLACEHOLDERS = new Set(["not provided", "string", "unknown", "n/a", "na", ""]);
    // Generic legal role words are less specific than actual party names
    const ROLE_WORDS = new Set(["plaintiff", "defendant", "claimant", "respondent", "petitioner", "counsel", "intervenor"]);
    const isVague = (r: string) => !r || VAGUE_PLACEHOLDERS.has(r.trim().toLowerCase()) || ROLE_WORDS.has(r.trim().toLowerCase());
    // Returns true if a is a substring of b (case-insensitive)
    const isSubstringOf = (a: string, b: string) => b.toLowerCase().includes(a.toLowerCase());
    const specific = group.filter((a) => !isVague(a.representing));
    const vague = group.filter((a) => isVague(a.representing));

    if (specific.length === 0) {
      // All vague — keep the one with the longest name
      result.push(group.reduce((best, a) => (a.name.length > best.name.length ? a : best)));
    } else if (specific.length === 1) {
      // One specific entry wins over all vague ones
      result.push(specific[0]);
    } else {
      // Multiple specific entries — try to collapse by substring containment before
      // concluding they're genuinely different people.
      // e.g. "Meridian Construction" ⊂ "Meridian Construction Group, LLC" → keep longer.
      let remaining = [...specific];
      const collapsed: typeof specific = [];
      while (remaining.length > 0) {
        const candidate = remaining.shift()!;
        const superIdx = remaining.findIndex(
          (other) =>
            isSubstringOf(candidate.representing, other.representing) ||
            isSubstringOf(other.representing, candidate.representing)
        );
        if (superIdx >= 0) {
          const other = remaining.splice(superIdx, 1)[0];
          // Keep the entry with the longer (more specific) representing value
          collapsed.push(
            candidate.representing.length >= other.representing.length ? candidate : other
          );
        } else {
          collapsed.push(candidate);
        }
      }
      result.push(...collapsed);
    }
  }

  return result;
}

function deduplicateAdmissions(
  admissions: DepositionAnalysis["keyAdmissions"]
): DepositionAnalysis["keyAdmissions"] {
  const seen = new Set<string>();
  return admissions.filter((a) => {
    const key = a.topic.toLowerCase().trim().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function deduplicateByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item).toLowerCase().trim().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickFirstNonEmpty(values: string[]): string {
  return values.find((v) => v && v.trim().length > 0) || "";
}

function reduceChunks(chunks: PartialAnalysis[]): PartialAnalysis {
  const witnessName = pickFirstNonEmpty(chunks.map((c) => c.witnessName));
  const witnessRole = pickFirstNonEmpty(chunks.map((c) => c.witnessRole));
  const depositionDate = pickFirstNonEmpty(chunks.map((c) => c.depositionDate));
  const location = chunks.find((c) => c.location)?.location;
  const courtReporter = chunks.find((c) => c.courtReporter)?.courtReporter;
  const duration = chunks.find((c) => c.duration)?.duration;

  // Attorneys: deduplicate by last name with richness preference
  const allAttorneys = chunks.flatMap((c) => c.attorneysPresent);
  const attorneys = deduplicateAttorneys(allAttorneys);

  // Topics: deduplicate
  const allTopics = chunks.flatMap((c) => c.topics);
  const topics = deduplicateByKey(allTopics, (t) => t);

  // Admissions: deduplicate by topic
  const allAdmissions = chunks.flatMap((c) => c.keyAdmissions);
  const keyAdmissions = deduplicateAdmissions(allAdmissions);

  // Denials: deduplicate by topic
  const allDenials = chunks.flatMap((c) => c.keyDenials);
  const keyDenials = deduplicateByKey(allDenials, (d) => d.topic);

  // Exhibits: deduplicate by exhibit number
  const allExhibits = chunks.flatMap((c) => c.exhibitsReferenced);
  const exhibitsReferenced = deduplicateByKey(allExhibits, (e) => e.exhibitNumber);

  // Inconsistencies: collect all
  const inconsistencies = chunks.flatMap((c) => c.inconsistencies);

  // Objections: sum totals, merge grounds
  const totalObjections = chunks.reduce((sum, c) => sum + (c.objectionsSummary?.total || 0), 0);
  const allGrounds = chunks.flatMap((c) => c.objectionsSummary?.commonGrounds || []);
  const commonGrounds = deduplicateByKey(allGrounds, (g) => g);

  return {
    witnessName,
    witnessRole,
    depositionDate,
    location,
    attorneysPresent: attorneys,
    courtReporter,
    duration,
    topics,
    keyAdmissions,
    keyDenials,
    exhibitsReferenced,
    inconsistencies,
    objectionsSummary: { total: totalObjections, commonGrounds },
  };
}

async function synthesize(
  reduced: PartialAnalysis
): Promise<{ summary: string; followUpQuestions: string[] }> {
  const contextData = JSON.stringify({
    witnessName: reduced.witnessName,
    witnessRole: reduced.witnessRole,
    depositionDate: reduced.depositionDate,
    topics: reduced.topics.slice(0, 10),
    keyAdmissions: reduced.keyAdmissions.slice(0, 20),
    keyDenials: reduced.keyDenials.slice(0, 10),
    inconsistencies: reduced.inconsistencies.slice(0, 10),
  });

  const response = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
      { role: "user", content: `Deposition data:\n${contextData}` },
    ],
  });
  const usage = response.usage;
  console.log("[Lexx:deposition] synthesis tokens:", usage);
  const raw = response.choices[0].message.content || "";
  const parsed = JSON.parse(cleanJson(raw));
  return {
    summary: parsed.summary || "",
    followUpQuestions: parsed.followUpQuestions || [],
  };
}

export async function processDeposition(
  text: string,
  fileName: string
): Promise<DepositionAnalysis> {
  console.log(`[Lexx:deposition] starting processing for: ${fileName}`);
  const chunks = chunkWithOverlap(text);
  console.log(`[Lexx:deposition] split into ${chunks.length} chunks`);

  const chunkResults = await Promise.all(chunks.map((chunk, i) => extractChunk(chunk, i)));

  const reduced = chunks.length === 1 ? chunkResults[0] : reduceChunks(chunkResults);

  const { summary, followUpQuestions } = await synthesize(reduced);

  return {
    ...reduced,
    attorneysPresent: deduplicateAttorneys(reduced.attorneysPresent),
    summary,
    followUpQuestions,
  };
}
