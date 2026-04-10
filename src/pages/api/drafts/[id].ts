import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });

  if (req.method === "PATCH") {
    const { content, snapshotLabel } = req.body;
    if (content === undefined) return res.status(400).json({ error: "content is required" });
    const result = await db.updateDraft(id, content, snapshotLabel);
    return res.status(200).json({ ...result.draft, versionCount: result.versionCount });
  }

  if (req.method === "GET") {
    const draft = await db.getDraft(id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    return res.status(200).json(draft);
  }

  return res.status(405).end();
}
