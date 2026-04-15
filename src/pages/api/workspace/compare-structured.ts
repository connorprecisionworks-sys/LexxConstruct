/**
 * POST /api/workspace/compare-structured
 * Body: { documentIdA: string, documentIdB: string }
 *
 * Runs an automatic structural comparison between two documents and returns
 * a structured analysis. No free-text question needed — the AI performs a
 * full comparison across four categories.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import OpenAI from "openai";
import { MODELS } from "@/lib/ai/models";

const client = new OpenAI();
const MODEL = MODELS.premium;
const DISCLAIMER =
  "This output is not legal advice and requires attorney review before any action is taken.";

export interface ComparisonAgreement {
  topic: string;
  descriptionA: string;
  descriptionB: string;
}

export interface ComparisonContradiction {
  topic: string;
  documentA: string; // document name + statement
  documentB: string;
  severity: "high" | "medium" | "low";
}

export interface ComparisonGap {
  topic: string;
  presentIn: string; // document name where it appears
}

export interface ComparisonRiskFlag {
  document: string; // document name
  flag: string;
  severity: "high" | "medium" | "low";
}

export interface StructuredComparison {
  agreements: ComparisonAgreement[];
  contradictions: ComparisonContradiction[];
  gapsInA: ComparisonGap[];
  gapsInB: ComparisonGap[];
  riskFlags: ComparisonRiskFlag[];
  disclaimer: string;
}

const SYSTEM_PROMPT = `You are a construction litigation analyst comparing two legal documents. You always respond with valid JSON only. Never include markdown, code fences, or explanatory text.

You have been given the full text and extracted intelligence from both documents. Your job is to identify:
1. Factual agreements — where both documents agree on the same facts
2. Direct contradictions — where the documents conflict on facts, amounts, dates, or obligations
3. Gaps — information present in one document but absent in the other
4. Risk flags — anything in either document that creates legal exposure

When analyzing:
- Always cite which document supports each statement using the document filename
- Never blend facts from both documents without attribution
- If a fact appears in both documents, say so explicitly
- If the documents contradict each other, present both positions clearly
- For contradictions: quote the specific language from each document, not a paraphrase`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { documentIdA, documentIdB } = req.body as {
    documentIdA?: string;
    documentIdB?: string;
  };

  if (!documentIdA || !documentIdB) {
    return res.status(400).json({ error: "documentIdA and documentIdB are required" });
  }
  if (documentIdA === documentIdB) {
    return res.status(400).json({ error: "Cannot compare a document with itself" });
  }

  const [docA, docB, resultA, resultB] = await Promise.all([
    db.getDocument(documentIdA),
    db.getDocument(documentIdB),
    db.getProcessingResult(documentIdA),
    db.getProcessingResult(documentIdB),
  ]);

  if (!docA || !docB) return res.status(404).json({ error: "One or both documents not found" });
  if (!resultA || !resultB) {
    return res.status(400).json({
      error: "Both documents must be fully processed before comparing",
    });
  }

  function buildContext(name: string, r: typeof resultA): string {
    return `DOCUMENT: "${name}"
Summary: ${r!.summary}
Key Issues:
${r!.keyIssues.map((i) => `  - [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n")}
Extracted Facts:
${r!.extractedFacts.map((f) => `  - [${f.category.toUpperCase()}] ${f.fact}`).join("\n")}
Timeline:
${r!.timeline.map((t) => `  - ${t.date}: ${t.description}`).join("\n")}
Missing Information:
${r!.missingInformation.map((m) => `  - [${m.importance.toUpperCase()}] ${m.description}`).join("\n")}`;
  }

  const context = [
    buildContext(docA.fileName, resultA),
    buildContext(docB.fileName, resultB),
  ].join("\n\n---\n\n");

  const response = await client.chat.completions.create({
    model: MODEL,
    max_completion_tokens: 4096,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Compare these two construction litigation documents and return JSON with exactly this structure:
{
  "agreements": [{ "topic": "short label", "descriptionA": "what document A says", "descriptionB": "what document B says" }],
  "contradictions": [{ "topic": "short label", "documentA": "document A filename: specific statement", "documentB": "document B filename: specific statement", "severity": "high|medium|low" }],
  "gapsInA": [{ "topic": "short label", "presentIn": "document B filename" }],
  "gapsInB": [{ "topic": "short label", "presentIn": "document A filename" }],
  "riskFlags": [{ "document": "document filename", "flag": "description of the risk", "severity": "high|medium|low" }]
}

Documents to compare:
${context}`,
      },
    ],
  });

  const raw = response.choices[0].message.content || "";
  const parsed = JSON.parse(raw) as Omit<StructuredComparison, "disclaimer">;

  const comparison: StructuredComparison = {
    agreements: parsed.agreements ?? [],
    contradictions: parsed.contradictions ?? [],
    gapsInA: parsed.gapsInA ?? [],
    gapsInB: parsed.gapsInB ?? [],
    riskFlags: parsed.riskFlags ?? [],
    disclaimer: DISCLAIMER,
  };

  console.log(
    `[Lexx:compare-structured] ${docA.fileName} vs ${docB.fileName} — ` +
      `agreements: ${comparison.agreements.length}, contradictions: ${comparison.contradictions.length}, ` +
      `riskFlags: ${comparison.riskFlags.length}`
  );

  return res.status(200).json(comparison);
}
