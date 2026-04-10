import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const matterId = req.query.matterId as string;
  if (!matterId) return res.status(400).json({ error: "matterId is required" });

  const documents = await db.listDocuments(matterId);
  return res.status(200).json(documents);
}
