import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import { generateDraft } from "@/lib/ai/workspace";
import type { WorkspaceActionType } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { documentId, actionType, additionalContext } = req.body;
  if (!documentId || !actionType) {
    return res.status(400).json({ error: "documentId and actionType are required" });
  }

  const result = await db.getProcessingResult(documentId);
  if (!result) return res.status(404).json({ error: "No processing result found" });

  const content = await generateDraft(actionType as WorkspaceActionType, result, additionalContext);

  const draft = {
    id: crypto.randomUUID(),
    documentId,
    title: actionType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    content,
    contentFormat: "html" as const,
    draftType: actionType as WorkspaceActionType,
    disclaimer: "This output is not legal advice and requires attorney review before any action is taken.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await db.saveDraft(draft);

  const doc = await db.getDocument(documentId);
  await db.saveActivity({
    id: crypto.randomUUID(),
    action: "draft_generated",
    entityName: `${draft.title} — ${doc?.fileName || "Document"}`,
    matterId: doc?.matterId || "",
    timestamp: new Date().toISOString(),
  });

  return res.status(200).json(draft);
}
