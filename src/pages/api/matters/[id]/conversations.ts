/**
 * GET  /api/matters/[id]/conversations — list all conversations for a matter, newest first
 * POST /api/matters/[id]/conversations — create a new conversation
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid matter id" });

  // Verify matter exists
  const matter = await db.getMatter(id);
  if (!matter) return res.status(404).json({ error: "Matter not found" });

  if (req.method === "GET") {
    const conversations = await db.listConversationsForMatter(id);
    // Return without messages for list view (lighter payload)
    return res.status(200).json(
      conversations.map((c) => ({
        id: c.id,
        matterId: c.matterId,
        name: c.name,
        messageCount: c.messages.length,
        preview: c.messages.find((m) => m.role === "user")?.content?.slice(0, 100) ?? "",
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
    );
  }

  if (req.method === "POST") {
    const { name } = req.body ?? {};
    const conversation = await db.createConversation({
      matterId: id,
      name: (typeof name === "string" && name.trim()) ? name.trim() : "New conversation",
      messages: [],
    });
    return res.status(201).json(conversation);
  }

  return res.status(405).end();
}
