import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import type { Flag } from "@/types";

interface SearchResult {
  id: string;
  primary: string;
  secondary: string;
  url: string;
}

interface SearchResponse {
  matters: SearchResult[];
  documents: SearchResult[];
  drafts: SearchResult[];
  flags: SearchResult[];
}

function matches(text: string | undefined | null, q: string): boolean {
  if (!text) return false;
  return text.toLowerCase().includes(q.toLowerCase());
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SearchResponse>) {
  if (req.method !== "GET") return res.status(405).end();

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    return res.status(200).json({ matters: [], documents: [], drafts: [], flags: [] });
  }

  const [allMatters, allDocuments, allDrafts] = await Promise.all([
    db.listMatters(),
    db.listAllDocuments(),
    db.listAllDrafts(),
  ]);

  const matterById = new Map(allMatters.map((m) => [m.id, m]));
  const docById = new Map(allDocuments.map((d) => [d.id, d]));

  // ── Matters ──────────────────────────────────────────────────────────────
  const matters: SearchResult[] = allMatters
    .filter((m) => matches(m.name, q) || matches(m.clientName, q) || matches(m.representedParty, q))
    .slice(0, 5)
    .map((m) => ({
      id: m.id,
      primary: m.name,
      secondary: m.clientName,
      url: `/matters/${m.id}`,
    }));

  // ── Documents ────────────────────────────────────────────────────────────
  const documents: SearchResult[] = allDocuments
    .filter((d) => matches(d.fileName, q))
    .slice(0, 5)
    .map((d) => {
      const matter = matterById.get(d.matterId);
      return {
        id: d.id,
        primary: d.fileName,
        secondary: matter?.name ?? "Unknown matter",
        url: `/matters/${d.matterId}/documents/${d.id}`,
      };
    });

  // ── Drafts ───────────────────────────────────────────────────────────────
  const drafts: SearchResult[] = allDrafts
    .filter((d) => matches(d.title, q))
    .slice(0, 5)
    .map((d) => {
      const matterId =
        d.matterId ??
        (d.documentId ? docById.get(d.documentId)?.matterId : undefined);
      const matter = matterId ? matterById.get(matterId) : undefined;
      const url =
        !d.documentId
          ? `/matters/${matterId}/workspace`
          : `/matters/${matterId}/documents/${d.documentId}`;
      return {
        id: d.id,
        primary: d.title,
        secondary: matter?.name ?? "Unknown matter",
        url,
      };
    });

  // ── Flags ────────────────────────────────────────────────────────────────
  // Collect matching flags across all matters, capped at 5 total
  const flags: SearchResult[] = [];
  for (const matter of allMatters) {
    if (flags.length >= 5) break;
    const matterFlags: Flag[] = await db.listFlagsForMatter(matter.id);
    for (const flag of matterFlags) {
      if (flags.length >= 5) break;
      if (!matches(flag.text, q)) continue;
      const doc = docById.get(flag.documentId);
      flags.push({
        id: flag.id,
        primary: flag.text.length > 100 ? flag.text.slice(0, 100) + "\u2026" : flag.text,
        secondary: `${doc?.fileName ?? "Document"} \u00b7 ${matter.name}`,
        url: `/matters/${matter.id}/documents/${flag.documentId}?highlight=${flag.id}`,
      });
    }
  }

  return res.status(200).json({ matters, documents, drafts, flags });
}
