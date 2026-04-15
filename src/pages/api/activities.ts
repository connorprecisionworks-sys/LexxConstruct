import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import type { Activity } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, entityName, matterId } = req.body as {
    action?: string;
    entityName?: string;
    matterId?: string;
  };

  if (!action || !matterId) return res.status(400).json({ error: "action and matterId required" });

  const activity: Activity = {
    id: crypto.randomUUID(),
    action: action as Activity["action"],
    entityName: entityName ?? action,
    matterId,
    timestamp: new Date().toISOString(),
  };

  await db.saveActivity(activity);
  return res.status(200).json(activity);
}
