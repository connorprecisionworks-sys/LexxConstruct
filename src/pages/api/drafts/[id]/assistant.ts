import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import { sendDraftAssistantMessage } from "@/lib/ai/draftAssistant";
import type { DraftAssistantMessage } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const draftId = req.query.id as string;
  if (!draftId) return res.status(400).json({ error: "Draft ID is required" });

  if (req.method === "GET") {
    const conv = await db.getDraftAssistantConversation(draftId);
    return res.status(200).json(conv ?? { messages: [] });
  }

  if (req.method === "DELETE") {
    await db.clearDraftAssistantConversation(draftId);
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST") {
    const { message, paragraphContext, selectionContext, mode } = req.body as {
      message?: string;
      paragraphContext?: string;
      selectionContext?: string;
      mode?: "suggest" | "chat";
    };

    const isAutoSuggest = mode === "suggest";
    const messageText = message?.trim() || (isAutoSuggest ? "Suggest improvements." : "");
    if (!isAutoSuggest && !messageText) return res.status(400).json({ error: "message is required" });

    const draft = await db.getDraft(draftId);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    const matterId = draft.matterId ?? "";
    const matter = await db.getMatter(matterId);
    if (!matter) return res.status(404).json({ error: "Matter not found" });

    // Load documents + results
    const documents = await db.listDocuments(matterId);
    const docsWithResults = await Promise.all(
      documents
        .filter((d) => d.status === "ready")
        .map(async (doc) => ({
          doc,
          result: await db.getProcessingResult(doc.id),
        }))
    );

    // Load other drafts (not the current one)
    const allDrafts = await db.listDraftsForMatter(matterId);
    const otherDrafts = allDrafts.filter((d) => d.id !== draftId);

    // Load existing conversation history
    const conv = await db.getDraftAssistantConversation(draftId);
    const history = conv?.messages ?? [];

    // Save user message (not for auto-suggest — ephemeral)
    const userMsg: DraftAssistantMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: messageText,
      createdAt: new Date().toISOString(),
    };
    if (!isAutoSuggest) {
      await db.saveDraftAssistantMessage(draftId, matterId, userMsg);
    }

    // Get AI response
    let assistantMsg: DraftAssistantMessage;
    try {
      assistantMsg = await sendDraftAssistantMessage(
        messageText,
        draft,
        matter,
        docsWithResults,
        otherDrafts,
        isAutoSuggest ? [] : [...history, userMsg],
        mode ?? "chat",
        { paragraphContext, selectionContext }
      );
    } catch (e) {
      console.error("[Lexx:draft-assistant] AI call failed:", e);
      assistantMsg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "The assistant encountered an error. Please try again.",
        suggestedEdits: [],
        createdAt: new Date().toISOString(),
      };
    }

    // Save assistant message (not for auto-suggest)
    if (!isAutoSuggest) {
      await db.saveDraftAssistantMessage(draftId, matterId, assistantMsg);
    }

    return res.status(200).json({ assistantMessage: assistantMsg });
  }

  return res.status(405).end();
}
