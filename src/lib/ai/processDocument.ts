import OpenAI from "openai";
import type { ProcessingResult, KeyIssue, ExtractedFact, TimelineEvent, MissingInfo, Flag } from "@/types";
import { chunkText } from "@/lib/parsers/extractText";

const client = new OpenAI();
const MODEL = "gpt-4o";
const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";
const SYSTEM_PROMPT = `You are a legal analyst for a construction litigation firm. You analyze documents from construction project disputes — contracts, schedules, RFIs, change orders, daily logs, correspondence, expert reports, and meeting minutes. Your job is to extract structured information that will help attorneys build their case.

When analyzing a document, identify:
- A concise summary of what the document is and what it says, focused on the facts relevant to a construction dispute.
- Key issues — significant legal or factual issues raised by the document, such as notice of a claim, reservation of rights, delay events, scope disputes, payment disputes, defect allegations, differing site conditions, or contract breaches.
- Extracted facts — specific, verifiable facts: dates, parties, dollar amounts, contract references, scope descriptions, named individuals, project locations, schedule milestones. Each fact should be standalone and attributable.
- Timeline events — dated events mentioned in the document, each with a date and a short description. Include both events the document describes and the document's own date.
- Missing information — important information that a construction litigator would expect in a document like this but that is absent. Examples: a change order without a cost impact, an RFI without a response date, a daily log without weather conditions, a pay application without backup, a notice letter without a specific contract provision cited.

Never provide legal advice. Never speculate beyond what the document says. Use construction industry terminology accurately: change order, RFI, pay application, substantial completion, notice to proceed, critical path, liquidated damages, retainage, differing site conditions, force majeure. Respond only with valid JSON, no markdown, no explanation.`;

const ANALYSIS_PROMPT = `Analyze this construction project document and return JSON with this exact structure:
{
  "summary": "2-3 sentence summary of what the document is and its key content relevant to a construction dispute",
  "keyIssues": [{ "id": "issue_1", "title": "string", "description": "string", "severity": "high|medium|low", "pageRef": "optional" }],
  "extractedFacts": [{ "id": "fact_1", "fact": "string", "category": "party|date|amount|event|obligation|other", "pageRef": "optional", "confidence": "high|medium|low" }],
  "timeline": [{ "id": "event_1", "date": "string", "description": "string", "significance": "critical|important|contextual" }],
  "missingInformation": [{ "id": "missing_1", "description": "string", "importance": "required|helpful|optional" }]
}`;

function cleanJson(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
}

interface ChunkResult {
  summary: string;
  keyIssues: KeyIssue[];
  extractedFacts: ExtractedFact[];
  timeline: TimelineEvent[];
  missingInformation: MissingInfo[];
}

async function processChunk(text: string, documentName: string, chunkIndex: number): Promise<ChunkResult> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `${ANALYSIS_PROMPT}\nDocument name: ${documentName} (section ${chunkIndex + 1})\nDocument content:\n${text}` },
    ],
  });

  const raw = response.choices[0].message.content || "";
  const parsed = JSON.parse(cleanJson(raw));

  return {
    summary: parsed.summary || "",
    keyIssues: parsed.keyIssues || [],
    extractedFacts: parsed.extractedFacts || [],
    timeline: parsed.timeline || [],
    missingInformation: parsed.missingInformation || [],
  };
}

function deduplicateByField<T>(items: T[], field: keyof T): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const val = String(item[field]).toLowerCase().trim();
    if (seen.has(val)) return false;
    seen.add(val);
    return true;
  });
}

async function unifiedSummary(chunkSummaries: string[], documentName: string): Promise<string> {
  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 512,
    messages: [
      { role: "system", content: "You are a construction litigation analyst. Combine the following section summaries into one unified 2-3 sentence summary of the entire document, focused on facts relevant to a construction dispute. Respond with only the summary text, no JSON." },
      { role: "user", content: `Document: ${documentName}\n\nSection summaries:\n${chunkSummaries.map((s, i) => `${i + 1}. ${s}`).join("\n")}` },
    ],
  });
  return response.choices[0].message.content || chunkSummaries[0];
}

function buildAutoFlags(missingInformation: MissingInfo[]): Flag[] {
  const now = new Date().toISOString();
  return missingInformation.map((m) => ({
    id: crypto.randomUUID(),
    documentId: "", // filled in by process.ts after documentId is assigned
    type: "missing_info" as const,
    source: "auto" as const,
    text: m.description,
    location: m.id,
    createdAt: now,
    resolved: false,
  }));
}

export async function processDocument(documentText: string, documentName: string): Promise<ProcessingResult> {
  const chunks = chunkText(documentText);

  if (chunks.length === 1) {
    const result = await processChunk(chunks[0], documentName, 0);
    return {
      id: crypto.randomUUID(),
      documentId: "",
      summary: result.summary,
      keyIssues: result.keyIssues,
      extractedFacts: result.extractedFacts,
      timeline: result.timeline.sort((a, b) => a.date.localeCompare(b.date)),
      missingInformation: result.missingInformation,
      flags: buildAutoFlags(result.missingInformation),
      disclaimer: DISCLAIMER,
      processedAt: new Date().toISOString(),
    };
  }

  // Process all chunks in parallel
  const chunkResults = await Promise.all(
    chunks.map((chunk, i) => processChunk(chunk, documentName, i))
  );

  // Merge results
  const allKeyIssues = chunkResults.flatMap((r) => r.keyIssues);
  const allFacts = chunkResults.flatMap((r) => r.extractedFacts);
  const allTimeline = chunkResults.flatMap((r) => r.timeline);
  const allMissing = deduplicateByField(chunkResults.flatMap((r) => r.missingInformation), "description");

  // Unified summary from all chunk summaries
  const summary = await unifiedSummary(
    chunkResults.map((r) => r.summary),
    documentName
  );

  return {
    id: crypto.randomUUID(),
    documentId: "",
    summary,
    keyIssues: deduplicateByField(allKeyIssues, "title"),
    extractedFacts: deduplicateByField(allFacts, "fact"),
    timeline: deduplicateByField(allTimeline, "description").sort((a, b) => a.date.localeCompare(b.date)),
    missingInformation: allMissing,
    flags: buildAutoFlags(allMissing),
    disclaimer: DISCLAIMER,
    processedAt: new Date().toISOString(),
  };
}
