import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import type { FlagType } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id, type, resolved } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });
  if (req.method !== "GET") return res.status(405).end();

  const filters: { type?: FlagType; resolved?: boolean } = {};
  if (type && typeof type === "string") filters.type = type as FlagType;
  if (resolved !== undefined) filters.resolved = resolved === "true";

  const flags = await db.listFlagsForMatter(id, filters);
  return res.status(200).json(flags);
}
