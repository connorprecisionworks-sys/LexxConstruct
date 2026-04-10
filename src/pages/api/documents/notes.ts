import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") return res.status(405).end();
  const { documentId, notes } = req.body;
  if (!documentId) return res.status(400).json({ error: "documentId is required" });
  await db.updateDocumentNotes(documentId, notes || "");
  await db.saveActivity({
    id: crypto.randomUUID(),
    action: "note_added",
    entityName: "Document note",
    matterId: "",
    timestamp: new Date().toISOString(),
  });
  return res.status(200).json({ success: true });
}
