import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });

  if (req.method === "DELETE") {
    const draft = await db.getDraft(id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    await db.deleteDraft(id);
    if (draft.matterId) {
      await db.saveActivity({
        id: crypto.randomUUID(),
        action: "draft_deleted",
        entityName: draft.title,
        matterId: draft.matterId,
        timestamp: new Date().toISOString(),
      });
    }
    return res.status(200).json({ ok: true });
  }

  if (req.method === "PATCH") {
    const { content, snapshotLabel, title, status } = req.body as {
      content?: string;
      snapshotLabel?: string;
      title?: string;
      status?: string;
    };

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        return res.status(400).json({ error: "title must be a non-empty string" });
      }
      if (title.trim().length > 120) {
        return res.status(400).json({ error: "title must be 120 characters or fewer" });
      }
    }
    if (status !== undefined && status !== "draft" && status !== "final") {
      return res.status(400).json({ error: "status must be 'draft' or 'final'" });
    }

    let draft = await db.getDraft(id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });

    const previousStatus = draft.status ?? "draft";
    let versionCount: number | undefined;

    if (content !== undefined) {
      const result = await db.updateDraft(id, content, snapshotLabel);
      draft = result.draft;
      versionCount = result.versionCount;
    }
    if (title !== undefined) {
      draft = await db.renameDraft(id, title.trim());
    }
    if (status !== undefined) {
      draft = await db.setDraftStatus(id, status as "draft" | "final");
      if (status === "final" && previousStatus !== "final" && draft.matterId) {
        await db.saveActivity({
          id: crypto.randomUUID(),
          action: "draft_finalized",
          entityName: draft.title,
          matterId: draft.matterId,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return res.status(200).json(
      versionCount !== undefined ? { ...draft, versionCount } : draft
    );
  }

  if (req.method === "GET") {
    const draft = await db.getDraft(id);
    if (!draft) return res.status(404).json({ error: "Draft not found" });
    return res.status(200).json(draft);
  }

  return res.status(405).end();
}
