import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import OpenAI from "openai";
import { getChecklist } from "@/lib/caseChecklists";
import { matchChecklist } from "@/lib/matchChecklist";
import type { CaseIntelligenceResult } from "@/types";

const client = new OpenAI();
const MODEL = "gpt-4o";
const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

function cleanJson(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
}

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
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content: `You are a construction litigation analyst. You review multiple documents from a single construction project dispute and identify patterns across them.

For caseOverview, write a 3-5 sentence summary of the matter based on all documents provided. Identify the project, the parties, the nature of the dispute, and the current posture if evident.

For unifiedTimeline, merge all dated events from all documents into a single chronological sequence. Attribute each event to its source document by filename. Focus on events that matter to a construction dispute: contract execution, notice-to-proceed, schedule milestones, change orders, RFIs, claim notices, defect discoveries, payment events, substantial completion, termination.

For factConsistency, actively search for contradictions between documents. Look for any of the following patterns:
1. Date contradictions — two documents state different dates for the same event (when something was discovered, when work was performed, when a notice was given, when a decision was made).
2. Amount contradictions — two documents state different numeric values for the same item (cost, quantity, duration, percentage).
3. Responsibility contradictions — two documents attribute the same action or decision to different parties or individuals.
4. Sequence contradictions — two documents imply a different order of events.
5. Characterization contradictions — two documents describe the same fact in mutually exclusive ways (e.g., one says work was defective, the other says it was compliant; one says notice was given, the other says no notice was received).
Before concluding there are no contradictions, cross-reference every dated event, every named action, and every attributed statement across all documents. A contradiction exists whenever two documents cannot both be true about the same underlying fact.
Do not flag stylistic differences, different levels of detail, or omissions where one document simply doesn't mention something. Do not invent contradictions.
If there are no contradictions after actively searching for all five patterns above, return an empty array.

Never provide legal advice. Use construction industry terminology accurately. Respond with valid JSON only.`,
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
  const parsed = JSON.parse(cleanJson(raw));

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
