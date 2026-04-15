import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const documentId = req.query.documentId as string | undefined;
    const matterId = req.query.matterId as string | undefined;

    if (documentId) {
      const drafts = await db.listDrafts(documentId);
      return res.status(200).json(drafts);
    }
    if (matterId) {
      const drafts = await db.listDraftsForMatter(matterId);
      const allDocs = await db.listDocuments(matterId);
      const docMap = new Map(allDocs.map((d) => [d.id, d.fileName]));
      const withSource = drafts.map((d) => ({
        ...d,
        sourceDocumentName: d.documentId ? (docMap.get(d.documentId) ?? null) : null,
      }));
      return res.status(200).json(withSource.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    }
    const all = await db.listAllDrafts();
    return res.status(200).json(all);
  }
  return res.status(405).end();
}
