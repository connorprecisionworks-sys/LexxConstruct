import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const documentId = req.query.documentId as string;
  if (!documentId) return res.status(400).json({ error: "documentId is required" });

  const result = await db.getProcessingResult(documentId);
  if (!result) return res.status(404).json({ error: "No processing result found" });

  return res.status(200).json(result);
}
