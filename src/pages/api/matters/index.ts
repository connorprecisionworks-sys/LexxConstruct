import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import type { Matter } from "@/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    const matters = await db.listMatters();
    return res.status(200).json(matters);
  }

  if (req.method === "POST") {
    const { name, clientName, matterType, caseType } = req.body;
    if (!name || !clientName) {
      return res.status(400).json({ error: "name and clientName are required" });
    }
    const matter: Matter = {
      id: crypto.randomUUID(),
      name,
      clientName,
      matterType: matterType || "construction",
      caseType: caseType || "construction_general",
      firmId: "default",
      status: "active",
      notes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.saveMatter(matter);
    await db.saveActivity({
      id: crypto.randomUUID(),
      action: "matter_created",
      entityName: matter.name,
      matterId: matter.id,
      timestamp: new Date().toISOString(),
    });
    return res.status(201).json(matter);
  }

  if (req.method === "PATCH") {
    const { id, status, notes, representedParty } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    if (status) await db.updateMatterStatus(id, status);
    if (notes !== undefined) await db.updateMatterNotes(id, notes);
    if (representedParty !== undefined) {
      const m = await db.getMatter(id);
      if (m) await db.saveMatter({ ...m, representedParty: representedParty || undefined, updatedAt: new Date().toISOString() });
    }
    const matter = await db.getMatter(id);
    return res.status(200).json(matter);
  }

  return res.status(405).end();
}
