import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });

  if (req.method === "GET") {
    const versions = await db.listDraftVersions(id);
    return res.status(200).json(versions);
  }

  return res.status(405).end();
}
