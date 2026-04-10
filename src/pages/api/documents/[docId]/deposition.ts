/**
 * GET /api/documents/[docId]/deposition
 * Returns the DepositionAnalysis for a document if it exists.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const docId = req.query.docId as string;
  if (!docId) return res.status(400).json({ error: "docId is required" });

  const result = await db.getProcessingResult(docId);
  if (!result) return res.status(404).json({ error: "Processing result not found" });
  if (!result.depositionAnalysis) return res.status(404).json({ error: "No deposition analysis found for this document" });

  return res.status(200).json(result.depositionAnalysis);
}
