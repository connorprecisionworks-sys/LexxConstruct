import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const documentId = req.query.documentId as string;
    if (documentId) {
      const drafts = await db.listDrafts(documentId);
      return res.status(200).json(drafts);
    }
    const all = await db.listAllDrafts();
    return res.status(200).json(all);
  }
  return res.status(405).end();
}
