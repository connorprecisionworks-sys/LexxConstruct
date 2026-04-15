import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import OpenAI from "openai";
import { getChecklist } from "@/lib/caseChecklists";
import { matchChecklist } from "@/lib/matchChecklist";
import type { CaseIntelligenceResult } from "@/types";
import { MODELS } from "@/lib/ai/models";

const client = new OpenAI();
const MODEL = MODELS.premium;
const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const matterId = req.query.id as string;
  if (!matterId) return res.status(400).json({ error: "Matter ID is required" });

  const matter = await db.getMatter(matterId);
  if (!matter) return res.status(404).json({ error: "Matter not found" });

  const documents = await db.listDocuments(matterId);
  const readyDocs = documents.filter((d) => d.status === "ready");
  if (readyDocs.length < 2) return res.status(400).json({ error: "At least 2 ready documents are needed" });

  const results = await Promise.all(
    readyDocs.map(async (doc) => {
      const result = await db.getProcessingResult(doc.id);
      return { doc, result };
    })
  );

  const withResults = results.filter((r) => r.result);

  const context = withResults
    .map((r) => {
      const pr = r.result!;
      let docContext = `DOCUMENT: "${r.doc.fileName}"
Summary: ${pr.summary}
Key Issues: ${pr.keyIssues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n")}
Facts: ${pr.extractedFacts.map((f) => `- [${f.category.toUpperCase()}] ${f.fact}`).join("\n")}
Timeline: ${pr.timeline.map((t) => `- ${t.date}: ${t.description}`).join("\n")}`;

      // Augment with deposition testimony if available
      if (pr.depositionAnalysis) {
        const d = pr.depositionAnalysis;
        const admissions = d.keyAdmissions
          .slice(0, 10)
          .map((a) => `  - [${a.significance.toUpperCase()}] ${a.topic}: ${a.admission}${a.pageReference ? ` (${a.pageReference})` : ""}`)
          .join("\n");
        docContext += `
Deposition testimony: ${d.witnessName} (${d.witnessRole}):
Key admissions:
${admissions || "  None recorded"}`;
      }

      return docContext;
    })
    .join("\n\n---\n\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a construction litigation analyst. You review multiple documents from a single construction project dispute and identify patterns across them. You always respond with valid JSON only. Never include markdown, code fences, or explanatory text.

For caseOverview, write a 3-5 sentence summary of the matter based on all documents provided. Identify the project, the parties, the nature of the dispute, and the current posture if evident.

For unifiedTimeline, merge all dated events from all documents into a single chronological sequence. Attribute each event to its source document by filename. Focus on events that matter to a construction dispute: contract execution, notice-to-proceed, schedule milestones, change orders, RFIs, claim notices, defect discoveries, payment events, substantial completion, termination.

For factConsistency, your job is to find genuine contradictions. A contradiction is not just a logical impossibility — it is also when one document represents an event as occurring at one time and another document represents the same event as occurring at a meaningfully different time, or when one party's account of a fact materially differs from another party's account of the same fact. Be willing to flag these even when both parties might technically be telling their own version of the truth.

Example of a contradiction you SHOULD detect: Document A is a deposition where a witness says they were aware of an issue by Date X. Document B is a change order or formal document that characterizes the same issue as having been "identified" on Date Y, where Y is significantly later than X. This is a meaningful inconsistency about when the issue was discovered or acknowledged, even though both documents may be technically accurate from their own perspective.

Analyze the documents for contradictions and inconsistencies. Focus specifically on:
1. Dollar amounts — do damages claimed match the sum of itemized costs? Do contract amounts match between documents?
2. Dates — do dates in correspondence match dates referenced in reports? Do notice dates match the events they describe?
3. Factual disputes — where does one party's account directly contradict another party's account of the same event?
4. Specification compliance — where does a party claim compliance but another document shows non-compliance?
5. Notice and deadline compliance — were contractual notice periods actually met based on the dates in the documents?

For each contradiction found:
- Quote the specific conflicting language from each document
- Identify which document supports which position
- Rate severity: HIGH (dispositive to the case), MEDIUM (significant but not case-determinative), LOW (minor inconsistency)
- Do NOT flag items as contradictions where both documents say the same thing, or where one document simply does not address a topic

Do not flag stylistic differences, different levels of detail, or omissions where one document simply doesn't mention something. A contradiction exists only when two documents cannot both be true about the same underlying fact.
If there are no genuine contradictions after actively searching for all five patterns above, return an empty array.

Before returning any contradiction, use these rules as a sanity check — if a candidate clearly fits one of these patterns, exclude it. If you're unsure, include it and let the user decide:
1. If the two statements are semantically equivalent, even if worded differently, it is not a contradiction. Statements that express the same fact are agreements.
2. If your explanation contains any of the phrases "both documents agree," "both state," "consistent with," "check for consistency," "verify consistency," or "confirms," the items are not contradicting — do not include them.
3. If both statements reference the same specific value (same date, same amount, same party, same event) and neither denies or disputes the other, they are agreements, not contradictions.
4. A contradiction requires mutual exclusivity. Ask yourself: "Can both of these statements be true at the same time?" If yes, it is not a contradiction — unless they concern when the same event was first known or characterized, in which case the temporal discrepancy is itself the contradiction.
5. Absence of information is not a contradiction. If Document A describes an event and Document B does not mention it, that is an omission, not a conflict.

Never provide legal advice. Use construction industry terminology accurately.`,
      },
      {
        role: "user",
        content: `Analyze all documents from this construction matter and return JSON with exactly these three fields:
{
  "caseOverview": "3-5 sentence summary identifying the project, parties, nature of dispute, and current posture",
  "unifiedTimeline": [{ "date": "string", "description": "string", "source": "document filename", "significance": "critical|important|contextual" }],
  "factConsistency": [{ "topic": "short label for the contradiction", "documentA": { "id": "filename", "statement": "the specific statement from this document" }, "documentB": { "id": "filename", "statement": "the specific statement from this document" }, "severity": "high|medium|low", "explanation": "one sentence describing why these statements conflict" }]
}

Documents to analyze:
${context}`,
      },
    ],
  });

  const usage = response.usage;
  console.log(`[Lexx:case-intelligence] tokens — prompt: ${usage?.prompt_tokens}, completion: ${usage?.completion_tokens}, total: ${usage?.total_tokens} (matter: ${matterId})`);

  const raw = response.choices[0].message.content || "";
  const parsed = JSON.parse(raw);

  // Post-parse validator: discard false-positive contradictions that survived the prompt
  const FP_BLOCKLIST = [
    "both documents agree",
    "both state",
    "consistent with",
    "check for consistency",
    "verify consistency",
    "both confirm",
    "agree on",
  ];

  const rawContradictions: typeof parsed.factConsistency = parsed.factConsistency ?? [];
  const filteredContradictions = rawContradictions.filter((item: { topic: string; explanation?: string }) => {
    const explanation = (item.explanation ?? "").toLowerCase();
    for (const phrase of FP_BLOCKLIST) {
      if (explanation.includes(phrase)) {
        console.log(`[Lexx:CI] discarded false-positive contradiction: "${item.topic}" — matched phrase: "${phrase}"`);
        return false;
      }
    }
    return true;
  });
  parsed.factConsistency = filteredContradictions;

  // Deterministic checklist matching — no GPT calls
  const caseType = matter.caseType ?? "construction_general";
  const checklist = getChecklist(caseType);
  const checklistResults = matchChecklist(
    checklist,
    withResults.map((r) => ({ id: r.doc.id, fileName: r.doc.fileName, result: r.result ?? undefined }))
  );

  const caseIntelligence: CaseIntelligenceResult = {
    caseOverview: parsed.caseOverview ?? "",
    unifiedTimeline: parsed.unifiedTimeline ?? [],
    factConsistency: parsed.factConsistency ?? [],
    checklist: checklistResults,
    disclaimer: DISCLAIMER,
    builtAt: new Date().toISOString(),
  };

  // Persist to matter record so it survives page refresh
  console.log(`[Lexx:case-intelligence] saving — overview length: ${caseIntelligence.caseOverview.length}, timeline: ${caseIntelligence.unifiedTimeline.length}, contradictions: ${caseIntelligence.factConsistency.length}, checklist: ${caseIntelligence.checklist.length}`);
  await db.saveMatter({ ...matter, caseIntelligence, updatedAt: new Date().toISOString() });

  // Log the activity
  await db.saveActivity({
    id: crypto.randomUUID(),
    action: "case_intelligence_built",
    entityName: matter.name,
    matterId: matter.id,
    timestamp: new Date().toISOString(),
  });

  return res.status(200).json(caseIntelligence);
}
