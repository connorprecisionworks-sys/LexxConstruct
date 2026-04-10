import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import { askQuestion } from "@/lib/ai/workspace";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { documentId, question, threadId } = req.body;
  if (!documentId || !question) {
    return res.status(400).json({ error: "documentId and question are required" });
  }

  const result = await db.getProcessingResult(documentId);
  if (!result) return res.status(404).json({ error: "No processing result found" });

  let thread = threadId ? await db.getThread(threadId) : null;
  if (!thread) {
    thread = {
      id: crypto.randomUUID(),
      documentId,
      title: question.slice(0, 80),
      messages: [],
      createdAt: new Date().toISOString(),
    };
    await db.saveThread(thread);
  }

  const answer = await askQuestion(question, result, thread.messages);

  const userMsg = { id: crypto.randomUUID(), role: "user" as const, content: question, actionType: "ask" as const, createdAt: new Date().toISOString() };
  const assistantMsg = { id: crypto.randomUUID(), role: "assistant" as const, content: answer, createdAt: new Date().toISOString() };

  await db.appendMessage(thread.id, userMsg);
  await db.appendMessage(thread.id, assistantMsg);

  return res.status(200).json({ answer, threadId: thread.id });
}
