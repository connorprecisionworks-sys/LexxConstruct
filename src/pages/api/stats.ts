import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const [matters, documents, drafts] = await Promise.all([
    db.listMatters(),
    db.listAllDocuments(),
    db.listAllDrafts(),
  ]);

  const processedDocs = documents.filter((d) => d.status === "ready").length;

  return res.status(200).json({
    totalMatters: matters.length,
    documentsProcessed: processedDocs,
    draftsGenerated: drafts.length,
    timeSavedMinutes: processedDocs * 45,
  });
}
