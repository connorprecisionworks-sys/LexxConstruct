import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import type { FlagType } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { docId } = req.query;
  if (typeof docId !== "string") return res.status(400).json({ error: "Invalid docId" });

  if (req.method !== "POST") return res.status(405).end();

  const { type, text, location } = req.body as { type: FlagType; text: string; location?: string };
  if (!type || !text?.trim()) return res.status(400).json({ error: "type and text are required" });

  const doc = await db.getDocument(docId);
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const flag = await db.addFlag(docId, {
    documentId: docId,
    type,
    source: "manual",
    text: text.trim(),
    location,
    resolved: false,
  });

  await db.saveActivity({
    id: crypto.randomUUID(),
    action: "flag_added",
    entityName: doc.fileName,
    matterId: doc.matterId,
    timestamp: new Date().toISOString(),
  });

  return res.status(201).json(flag);
}
