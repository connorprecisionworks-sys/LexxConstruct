/**
 * One-time migration: converts plain-text drafts to semantic HTML via GPT-4o.
 * Run with: npx ts-node --project tsconfig.json scripts/migrate-drafts-to-html.ts
 *
 * Safe to re-run — skips any draft where contentFormat === "html".
 * Snapshots original content as DraftVersion labeled "pre-html-migration".
 */

import fs from "fs";
import path from "path";
import OpenAI from "openai";

const DATA_DIR = path.join(process.cwd(), "data");
const client = new OpenAI();

interface Draft {
  id: string;
  documentId: string;
  title: string;
  content: string;
  contentFormat?: "html";
  draftType: string;
  disclaimer: string;
  createdAt: string;
  updatedAt: string;
}

interface DraftVersion {
  id: string;
  draftId: string;
  content: string;
  label?: string;
  createdAt: string;
}

function read<T>(name: string): T[] {
  const p = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, "utf-8")) as T[]; } catch { return []; }
}

function write<T>(name: string, data: T[]): void {
  fs.writeFileSync(path.join(DATA_DIR, `${name}.json`), JSON.stringify(data, null, 2), "utf-8");
}

function uuid(): string {
  return crypto.randomUUID();
}

async function convertToHtml(plainText: string): Promise<string> {
  const res = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 4096,
    messages: [
      {
        role: "system",
        content:
          "Convert this legal document from plain text to clean semantic HTML. Use <p> for paragraphs. Preserve line breaks within address blocks, signature blocks, and letterheads using <br>. Do not add, remove, or rewrite any words. Do not add styling. Return only the HTML, no commentary.",
      },
      { role: "user", content: plainText },
    ],
  });
  return (res.choices[0].message.content ?? "").replace(/^```html\s*/i, "").replace(/```\s*$/i, "").trim();
}

async function main() {
  const drafts = read<Draft>("drafts");
  const toMigrate = drafts.filter((d) => d.contentFormat !== "html");

  if (toMigrate.length === 0) {
    console.log("No drafts need migration.");
    return;
  }

  console.log(`Found ${toMigrate.length} draft(s) to migrate:\n`);
  toMigrate.forEach((d) => console.log(`  • [${d.id.slice(0, 8)}] ${d.title} (${d.draftType})`));
  console.log();

  const versions = read<DraftVersion>("draft_versions");

  for (const draft of toMigrate) {
    process.stdout.write(`Migrating "${draft.title}" (${draft.id.slice(0, 8)})... `);

    // Snapshot original plain text
    versions.push({
      id: uuid(),
      draftId: draft.id,
      content: draft.content,
      label: "pre-html-migration",
      createdAt: new Date().toISOString(),
    });

    // Convert via GPT-4o
    const html = await convertToHtml(draft.content);

    // Update draft in-place
    const idx = drafts.findIndex((d) => d.id === draft.id);
    drafts[idx].content = html;
    drafts[idx].contentFormat = "html";
    drafts[idx].updatedAt = new Date().toISOString();

    console.log("done.");
    console.log(`\n--- HTML output ---\n${html.slice(0, 400)}...\n---\n`);
  }

  write("drafts", drafts);
  write("draft_versions", versions);

  console.log(`\nMigration complete. ${toMigrate.length} draft(s) updated.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
