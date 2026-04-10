import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const limit = parseInt(req.query.limit as string) || 10;
  const activities = await db.listActivities(limit);
  return res.status(200).json(activities);
}
