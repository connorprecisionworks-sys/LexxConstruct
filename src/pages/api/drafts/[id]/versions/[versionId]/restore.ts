import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, versionId } = req.query;
  if (typeof id !== "string" || typeof versionId !== "string") {
    return res.status(400).json({ error: "Invalid params" });
  }

  if (req.method !== "POST") return res.status(405).end();

  const version = await db.getDraftVersion(versionId);
  if (!version) return res.status(404).json({ error: "Version not found" });

  const result = await db.updateDraft(id, version.content, "before restore");
  return res.status(200).json({ ...result.draft, versionCount: result.versionCount });
}
