/**
 * Diagnostic export endpoint.
 *
 * Purpose: Dump the full state of Lexx into a single JSON file for
 * architect/developer review of AI extraction quality.
 *
 * This is not a user-facing feature. It exists so the architect can
 * evaluate whether the processing pipelines (document analysis, deposition
 * analysis, case intelligence, flag auto-promotion) are producing correct
 * output without having to manually inspect every page in the UI.
 *
 * The output is intended to be pasted into a conversation with the
 * architect for review. Do not expose from the main app nav.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(name: string): T[] {
  const filePath = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return [];
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T[];
  } catch {
    return [];
  }
}

function truncateContent(content: string, max: number): string {
  if (content.length <= max) return content;
  const extra = content.length - max;
  return content.slice(0, max) + `...[truncated ${extra} additional characters]`;
}

// Strip any directory components from a path — keep only the filename.
// storageKey values like "abc123.pdf" are already basenames, but guard anyway.
function safeBasename(value: string | undefined): string | undefined {
  if (!value) return value;
  return path.basename(value);
}

// Remove credential-like keys from an object (defensive, belt-and-suspenders).
const SENSITIVE_KEYS = new Set(["apiKey", "api_key", "secret", "password", "token", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
function sanitize<T>(obj: T): T {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(sanitize) as unknown as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = "[redacted]";
    } else {
      out[k] = sanitize(v);
    }
  }
  return out as T;
}

type AnyRecord = Record<string, unknown>;

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();

  const full = req.query.full === "true";
  const DRAFT_MAX = 2000;

  // ── Read raw collections ───────────────────────────────────────────
  const matters = readJson<AnyRecord>("matters");
  const documents = readJson<AnyRecord>("documents");
  const processingResults = readJson<AnyRecord>("processing_results");
  const drafts = readJson<AnyRecord>("drafts");
  const draftVersions = readJson<AnyRecord>("draft_versions");
  const activities = readJson<AnyRecord>("activities");

  // ── Index maps ────────────────────────────────────────────────────
  const matterIds = new Set(matters.map((m) => m.id as string));
  const docIds = new Set(documents.map((d) => d.id as string));

  const resultByDocId = new Map<string, AnyRecord>(
    processingResults.map((r) => [r.documentId as string, r])
  );

  const draftsByDocId = new Map<string, AnyRecord[]>();
  for (const draft of drafts) {
    const key = draft.documentId as string;
    if (!draftsByDocId.has(key)) draftsByDocId.set(key, []);
    draftsByDocId.get(key)!.push(draft);
  }

  const versionsByDraftId = new Map<string, AnyRecord[]>();
  for (const v of draftVersions) {
    const key = v.draftId as string;
    if (!versionsByDraftId.has(key)) versionsByDraftId.set(key, []);
    versionsByDraftId.get(key)!.push(v);
  }

  // ── FlagType enum values ──────────────────────────────────────────
  const FLAG_TYPES = ["contradiction", "missing_info", "follow_up", "key_evidence", "deadline"];

  // ── Build matters with nested documents ───────────────────────────
  const mattersOutput = matters.map((matter) => {
    const matterDocs = documents.filter((d) => d.matterId === matter.id);

    const docsOutput = matterDocs.map((doc) => {
      const result = resultByDocId.get(doc.id as string) ?? null;

      // Flags live inside the processing result
      const flags: AnyRecord[] = (result?.flags as AnyRecord[]) ?? [];

      // Drafts with version metadata
      const docDrafts = (draftsByDocId.get(doc.id as string) ?? []).map((draft) => {
        const versions = (versionsByDraftId.get(draft.id as string) ?? []).sort(
          (a, b) => ((b.createdAt as string) > (a.createdAt as string) ? 1 : -1)
        );
        const content = typeof draft.content === "string" ? draft.content : "";
        return {
          ...draft,
          storageKey: safeBasename(draft.storageKey as string),
          content: full ? content : truncateContent(content, DRAFT_MAX),
          versionCount: versions.length,
          latestVersionAt: (versions[0]?.createdAt as string) ?? null,
        };
      });

      // Sanitize the doc: strip directory from storageKey
      const sanitizedDoc = {
        ...doc,
        storageKey: safeBasename(doc.storageKey as string),
      };

      // Extract depositionAnalysis separately for top-level visibility
      const depositionAnalysis =
        doc.documentKind === "deposition" && result?.depositionAnalysis
          ? (result.depositionAnalysis as AnyRecord)
          : null;

      // ProcessingResult with flagCount summary alongside full flags
      const processedResult = result
        ? {
            ...result,
            // flags already surfaced at doc level; keep them here too for completeness
          }
        : null;

      return {
        ...sanitizedDoc,
        processingResult: processedResult,
        depositionAnalysis,
        flags,
        drafts: docDrafts,
      };
    });

    // ── Flags rollup for this matter ────────────────────────────────
    const allMatterFlags = docsOutput.flatMap((d) => d.flags);
    const byType: Record<string, number> = {};
    for (const t of FLAG_TYPES) byType[t] = 0;
    for (const f of allMatterFlags) {
      const t = f.type as string;
      if (t in byType) byType[t]++;
    }
    const resolved = allMatterFlags.filter((f) => f.resolved).length;

    return {
      ...matter,
      documents: docsOutput,
      flagsRollup: {
        total: allMatterFlags.length,
        byType,
        byResolved: { resolved, open: allMatterFlags.length - resolved },
      },
    };
  });

  // ── Orphans ───────────────────────────────────────────────────────
  const allFlags = processingResults.flatMap((r) =>
    ((r.flags as AnyRecord[]) ?? []).map((f) => ({ _fromResultId: r.id, ...f }))
  );

  const orphans = {
    documentsWithoutMatter: documents
      .filter((d) => !matterIds.has(d.matterId as string))
      .map((d) => ({ ...d, storageKey: safeBasename(d.storageKey as string) })),

    draftsWithoutDocument: drafts
      .filter((d) => !docIds.has(d.documentId as string))
      .map((d) => ({
        ...d,
        content: full
          ? (d.content as string)
          : truncateContent(d.content as string, DRAFT_MAX),
      })),

    flagsWithoutDocument: allFlags.filter((f) => !docIds.has((f as AnyRecord).documentId as string)),

    processingResultsWithoutDocument: processingResults.filter(
      (r) => !docIds.has(r.documentId as string)
    ),
  };

  // ── Counts ────────────────────────────────────────────────────────
  const counts = {
    matters: matters.length,
    documents: documents.length,
    processingResults: processingResults.length,
    depositions: documents.filter((d) => d.documentKind === "deposition").length,
    drafts: drafts.length,
    draftVersions: draftVersions.length,
    flags: allFlags.length,
    activities: activities.length,
  };

  // ── Assemble output ───────────────────────────────────────────────
  let appVersion = "0.1.0";
  try {
    const pkgRaw = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8");
    appVersion = (JSON.parse(pkgRaw) as { version?: string }).version ?? appVersion;
  } catch { /* ignore */ }

  const output = sanitize({
    exportedAt: new Date().toISOString(),
    version: "1.0",
    truncated: !full,
    environment: {
      nodeEnv: process.env.NODE_ENV ?? "unknown",
      appVersion,
    },
    counts,
    matters: mattersOutput,
    orphans,
    recentActivity: [...activities]
      .sort((a, b) =>
        ((b.timestamp as string) > (a.timestamp as string) ? 1 : -1)
      )
      .slice(0, 50),
  });

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="lexx-diagnostic-${date}.json"`
  );
  res.status(200).send(JSON.stringify(output, null, 2));
}
