import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import type { FlagType } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { flagId } = req.query;
  if (typeof flagId !== "string") return res.status(400).json({ error: "Invalid flagId" });

  if (req.method === "PATCH") {
    const { resolved, text, type } = req.body as { resolved?: boolean; text?: string; type?: FlagType };
    const flag = await db.updateFlag(flagId, {
      ...(resolved !== undefined && { resolved }),
      ...(text !== undefined && { text }),
      ...(type !== undefined && { type }),
    });
    return res.status(200).json(flag);
  }

  if (req.method === "DELETE") {
    await db.deleteFlag(flagId);
    return res.status(204).end();
  }

  return res.status(405).end();
}
