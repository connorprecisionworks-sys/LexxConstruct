/**
 * POST /api/conversations/[conversationId]/messages
 * Body: { content: string }
 * Returns: the assistant's ChatMessage with citations and suggested actions
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import { sendChatMessage } from "@/lib/ai/chat";
import type { ProcessingResult, Flag } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { conversationId } = req.query;
  if (typeof conversationId !== "string") {
    return res.status(400).json({ error: "Invalid conversationId" });
  }

  const { content } = req.body ?? {};
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content is required" });
  }

  // Load conversation and verify matter
  const conversation = await db.getConversation(conversationId);
  if (!conversation) return res.status(404).json({ error: "Conversation not found" });

  const matter = await db.getMatter(conversation.matterId);
  if (!matter) return res.status(404).json({ error: "Matter not found" });

  // Load all ready documents in this matter
  const allDocs = await db.listDocuments(conversation.matterId);
  const readyDocs = allDocs.filter((d) => d.status === "ready");

  // Load processing results
  const resultEntries = await Promise.all(
    readyDocs.map(async (doc) => {
      const r = await db.getProcessingResult(doc.id);
      return r ? ([doc.id, r] as [string, ProcessingResult]) : null;
    })
  );
  const resultsMap = new Map<string, ProcessingResult>(
    resultEntries.filter((e): e is [string, ProcessingResult] => e !== null)
  );

  // Load matter flags
  const flags = await db.listFlagsForMatter(conversation.matterId);

  // Load drafts for this matter (fresh per request, no cache)
  let matterDrafts: import("@/types").Draft[] = [];
  try {
    matterDrafts = await db.listDraftsForMatter(conversation.matterId);
  } catch {
    // Non-fatal — chat works without draft context
  }

  // Build docId → fileName map for draft source resolution
  const docNameMap = new Map(allDocs.map((d) => [d.id, d.fileName]));

  // Save user message first (so it appears immediately if UI polls)
  const userMessage = await db.appendChatMessage(conversationId, {
    role: "user",
    content: content.trim(),
  });

  // Call AI
  let result;
  try {
    result = await sendChatMessage(
      { ...conversation, messages: [...conversation.messages, userMessage] },
      content.trim(),
      matter,
      readyDocs,
      resultsMap,
      flags as Array<Flag & { documentFileName: string }>,
      matterDrafts,
      docNameMap
    );
  } catch (aiErr) {
    console.error("[Lexx Chat] AI error:", aiErr);
    // Save a fallback assistant message
    const fallback = await db.appendChatMessage(conversationId, {
      role: "assistant",
      content:
        "I encountered an error processing your request. Please try again.",
      citations: [],
      suggestedActions: [],
    });
    return res.status(200).json(fallback);
  }

  // Save assistant message
  const assistantMessage = await db.appendChatMessage(conversationId, {
    role: result.assistantMessage.role,
    content: result.assistantMessage.content,
    citations: result.assistantMessage.citations,
    suggestedActions: result.assistantMessage.suggestedActions,
    tokenUsage: result.assistantMessage.tokenUsage,
  });

  // Auto-rename conversation if we got a new name
  if (result.newConversationName) {
    await db.renameConversation(conversationId, result.newConversationName);
  }

  // Log activity
  await db.saveActivity({
    id: crypto.randomUUID(),
    action: "chat_message_sent",
    entityName: conversation.name,
    matterId: conversation.matterId,
    timestamp: new Date().toISOString(),
    meta: { conversationId },
  });

  return res.status(200).json(assistantMessage);
}
