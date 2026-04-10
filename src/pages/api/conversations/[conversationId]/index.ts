/**
 * GET    /api/conversations/[conversationId] — fetch conversation with all messages
 * PATCH  /api/conversations/[conversationId] — rename, body: { name: string }
 * DELETE /api/conversations/[conversationId] — delete
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { conversationId } = req.query;
  if (typeof conversationId !== "string") {
    return res.status(400).json({ error: "Invalid conversationId" });
  }

  const conversation = await db.getConversation(conversationId);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  // Verify the matter still exists
  const matter = await db.getMatter(conversation.matterId);
  if (!matter) return res.status(404).json({ error: "Matter not found" });

  if (req.method === "GET") {
    return res.status(200).json(conversation);
  }

  if (req.method === "PATCH") {
    const { name } = req.body ?? {};
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    const updated = await db.renameConversation(conversationId, name.trim());
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    await db.deleteConversation(conversationId);
    return res.status(204).end();
  }

  return res.status(405).end();
}
