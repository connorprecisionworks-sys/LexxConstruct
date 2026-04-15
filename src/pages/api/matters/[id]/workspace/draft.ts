/**
 * POST /api/matters/[id]/workspace/draft
 * Body: { draftType: string, additionalInstructions?: string }
 *
 * Generates a draft using all documents in the matter as context.
 * Saves the draft with documentId: null (matter-scoped) and matterId set.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import { generateMatterDraft } from "@/lib/ai/workspace";
import type { WorkspaceActionType } from "@/types";

const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const matterId = req.query.id as string;
  if (!matterId) return res.status(400).json({ error: "Matter ID is required" });

  const { draftType, additionalInstructions } = req.body as {
    draftType?: string;
    additionalInstructions?: string;
  };
  if (!draftType) return res.status(400).json({ error: "draftType is required" });

  const matter = await db.getMatter(matterId);
  if (!matter) return res.status(404).json({ error: "Matter not found" });

  const documents = await db.listDocuments(matterId);
  const readyDocs = documents.filter((d) => d.status === "ready");

  if (readyDocs.length === 0) {
    return res.status(400).json({ error: "No ready documents in this matter. Upload and process at least one document before generating a draft." });
  }

  // Load processing results for all ready documents
  const docsWithResults = await Promise.all(
    readyDocs.map(async (doc) => ({
      doc,
      result: await db.getProcessingResult(doc.id),
    }))
  );

  const content = await generateMatterDraft(
    draftType as WorkspaceActionType,
    matter,
    docsWithResults,
    matter.caseIntelligence ?? null,
    additionalInstructions
  );

  const title = draftType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c: string) => c.toUpperCase());

  const draft = {
    id: crypto.randomUUID(),
    documentId: null,
    matterId,
    title,
    content,
    contentFormat: "html" as const,
    draftType: draftType as WorkspaceActionType,
    disclaimer: DISCLAIMER,
    status: "draft" as const,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await db.saveDraft(draft);

  await db.saveActivity({
    id: crypto.randomUUID(),
    action: "draft_generated",
    entityName: `${title} — ${matter.name}`,
    matterId,
    timestamp: new Date().toISOString(),
  });

  console.log(`[Lexx:matter-draft] ${draftType} for "${matter.name}" — ${readyDocs.length} docs in context`);

  return res.status(200).json(draft);
}
