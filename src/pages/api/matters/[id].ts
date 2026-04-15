import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid matter ID" });

  if (req.method === "PATCH") {
    const matter = await db.getMatter(id);
    if (!matter) return res.status(404).json({ error: "Matter not found" });
    const { pinned } = req.body as { pinned?: boolean };
    if (typeof pinned === "boolean") {
      await db.saveMatter({ ...matter, pinned, updatedAt: new Date().toISOString() });
    }
    const updated = await db.getMatter(id);
    return res.status(200).json(updated);
  }

  if (req.method === "DELETE") {
    const matter = await db.getMatter(id);
    if (!matter) return res.status(404).json({ error: "Matter not found" });

    // Cascade-delete everything under this matter
    await db.deleteMatter(id);

    // Log the deletion AFTER cascade so this activity entry survives
    await db.saveActivity({
      id: crypto.randomUUID(),
      action: "matter_deleted",
      entityName: matter.name,
      matterId: id,
      timestamp: new Date().toISOString(),
    });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
