/**
 * One-time migration: converts flaggedIssues: string[] → flags: Flag[]
 * Run: npx tsx scripts/migrate-flags.ts
 * Idempotent: skips any ProcessingResult that already has a flags array.
 */

import fs from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");

interface KeyIssue { id: string; title: string; }
interface LegacyResult {
  id: string;
  documentId: string;
  keyIssues: KeyIssue[];
  missingInformation?: { id: string; description: string }[];
  flaggedIssues?: string[];
  flags?: unknown[];
  createdAt?: string;
  processedAt?: string;
}
interface Document { id: string; createdAt?: string; uploadedAt?: string; }
interface Flag {
  id: string; documentId: string; type: string; source: string; text: string;
  location?: string; createdAt: string; resolved: boolean;
}

function read<T>(name: string): T[] {
  const p = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T[]; } catch { return []; }
}
function write<T>(name: string, data: T[]): void {
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2), "utf-8");
}

function uuid(): string { return crypto.randomUUID(); }

async function main() {
  const results = read<LegacyResult>("processing_results");
  const docs = read<Document>("documents");
  const docMap = new Map(docs.map((d) => [d.id, d]));

  let migrated = 0;
  let skipped = 0;

  for (const result of results) {
    if (Array.isArray(result.flags)) { skipped++; continue; }

    const doc = docMap.get(result.documentId);
    const fallbackDate = doc?.uploadedAt ?? doc?.createdAt ?? new Date().toISOString();
    const flags: Flag[] = [];

    // Convert flaggedIssues (manually flagged issue IDs) → follow_up flags
    for (const issueId of result.flaggedIssues ?? []) {
      const issue = result.keyIssues?.find((ki) => ki.id === issueId);
      flags.push({
        id: uuid(),
        documentId: result.documentId,
        type: "follow_up",
        source: "manual",
        text: issue?.title ?? issueId,
        location: issueId,
        createdAt: fallbackDate,
        resolved: false,
      });
    }

    // Auto-promote missingInformation → missing_info flags
    for (const m of result.missingInformation ?? []) {
      flags.push({
        id: uuid(),
        documentId: result.documentId,
        type: "missing_info",
        source: "auto",
        text: m.description,
        location: m.id,
        createdAt: fallbackDate,
        resolved: false,
      });
    }

    (result as unknown as Record<string, unknown>).flags = flags;
    delete (result as unknown as Record<string, unknown>).flaggedIssues;
    migrated++;

    console.log(`  Migrated [${result.documentId.slice(0, 8)}]: ${flags.length} flag(s) (${flags.filter(f => f.source === "manual").length} manual, ${flags.filter(f => f.source === "auto").length} auto)`);
  }

  write("processing_results", results);
  console.log(`\nDone. ${migrated} migrated, ${skipped} already had flags array.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
