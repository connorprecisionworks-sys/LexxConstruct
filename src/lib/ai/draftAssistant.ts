/**
 * LEXX — Draft Writing Assistant AI
 * Scoped to a specific draft. Knows the draft content, case documents, and other drafts.
 */

import OpenAI from "openai";
import type { Matter, Document, ProcessingResult, Draft, DraftAssistantMessage, SuggestedEdit } from "@/types";
import { buildMatterDraftContext } from "@/lib/ai/workspace";
import { MODELS } from "@/lib/ai/models";

const client = new OpenAI();
const TOKEN_BUDGET = 12000;

function est(s: string): number { return Math.ceil(s.length / 4); }

function stripCodeFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json|html|javascript|js)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .replace(/^'''(?:json|html|javascript|js)?\s*\n?/i, "")
    .replace(/\n?'''\s*$/i, "")
    .trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildSystemPrompt(
  draft: Draft,
  matter: Matter,
  docsWithResults: Array<{ doc: Document; result: ProcessingResult | null }>,
  otherDrafts: Draft[],
  mode: "suggest" | "chat" = "chat",
  context?: { paragraphContext?: string; selectionContext?: string }
): string {
  let used = 0;

  const draftTypeLabel = draft.draftType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const caseTypeLabel = (matter.caseType ?? "construction_general").replace(/_/g, " ");

  const header = `You are a writing assistant helping an attorney refine a ${draftTypeLabel} for the "${matter.name}" case (${caseTypeLabel}).

CRITICAL: Return raw JSON only. Do NOT wrap your response in markdown code fences (no triple backticks, no triple quotes, no language tags). Your response must start with { and end with } and parse as valid JSON directly.

Your role:
- Read the current draft and the case documents carefully
- When the user asks for improvements, be CONCRETE and SPECIFIC — reference real facts, witnesses, dates, and document names from the case file
- When you suggest adding or changing text, provide the EXACT text to use in the proposedText field of your suggestedEdits
- Never invent facts. Every factual claim in your suggestions must come from the case documents
- The attorney retains full authorship — your suggestions are proposals for their review
- Do NOT say "I can't help with this" — if asked for something beyond the documents, say what's available and suggest what you can

`;
  used += est(header);

  // Current draft content (NEVER cut, but truncate middle if > 8k tokens)
  const rawDraftContent = stripHtml(draft.content);
  const draftTokens = est(rawDraftContent);
  let draftSection: string;
  if (draftTokens > 8000) {
    const chars = rawDraftContent.length;
    const keepChars = Math.floor(chars * 0.6);
    const startChars = Math.floor(keepChars * 0.55);
    const endChars = keepChars - startChars;
    const start = rawDraftContent.slice(0, startChars);
    const end = rawDraftContent.slice(chars - endChars);
    draftSection = `CURRENT DRAFT (${draftTypeLabel}):\n${start}\n\n[...content omitted from middle for length...]\n\n${end}\n\n`;
  } else {
    draftSection = `CURRENT DRAFT (${draftTypeLabel}):\n${rawDraftContent}\n\n`;
  }
  used += est(draftSection);

  // Matter context from documents
  const matterContext = buildMatterDraftContext(matter, docsWithResults, matter.caseIntelligence ?? null);
  const matterTokens = est(matterContext);
  let matterSection = "";
  if (used + matterTokens < TOKEN_BUDGET * 0.85) {
    matterSection = `CASE DOCUMENTS:\n${matterContext}\n\n`;
    used += est(matterSection);
  }

  // Other drafts (cut first under budget pressure)
  let otherDraftsSection = "";
  if (otherDrafts.length > 0 && used < TOKEN_BUDGET * 0.9) {
    const lines: string[] = [`OTHER DRAFTS IN THIS MATTER (${otherDrafts.length} total):\n`];
    for (const d of otherDrafts) {
      const statusLine = d.status === "final"
        ? `final (finalized ${d.finalizedAt?.slice(0, 10) ?? "unknown"})`
        : `draft (last edited ${d.updatedAt.slice(0, 10)})`;
      const typeLabel = d.draftType.replace(/_/g, " ");
      let entry = `- "${d.title}" [${typeLabel}] — ${statusLine}`;

      // Try to include a short excerpt
      if (used + est(entry) < TOKEN_BUDGET * 0.88) {
        const excerpt = stripHtml(d.content).slice(0, 200);
        if (excerpt && used + est(entry) + est(excerpt) < TOKEN_BUDGET * 0.9) {
          entry += `\n  Excerpt: "${excerpt}${excerpt.length >= 200 ? "…" : ""}"`;
        }
      }
      lines.push(entry + "\n");
      used += est(entry);
      if (used >= TOKEN_BUDGET * 0.9) break;
    }
    otherDraftsSection = lines.join("") + "\n";
  }

  const outputFormat = `OUTPUT FORMAT — REQUIRED JSON:
Return a single JSON object with:
{
  "content": "Your prose response to the user. Be concrete and reference specific case facts. Markdown is supported.",
  "suggestedEdits": [
    {
      "type": "add_paragraph" | "rewrite_paragraph" | "add_citation",
      "description": "Short user-facing label, e.g. 'Add a paragraph about the August 12 waterproofing failure'",
      "proposedText": "The exact text to insert or replace — write it as if it's going directly into the draft"
    }
  ]
}

RULES:
- "content" is your conversational response. Always write it.
- "suggestedEdits" has 0–3 items. Only include edits when you have a concrete, grounded suggestion.
- Every proposedText must reference real facts from the case documents — never invent.
- "add_paragraph" = new paragraph to append to the draft
- "rewrite_paragraph" = replacement for text the user has selected in the editor
- "add_citation" = a parenthetical or footnote to add at the end of the most recent paragraph
- Do not output markdown fences or any text outside the JSON object.`;

  // For suggest mode: add paragraph context and override instructions
  if (mode === "suggest") {
    const ctx = context?.selectionContext || context?.paragraphContext;
    const ctxLabel = context?.selectionContext ? "SELECTED TEXT" : "CURRENT PARAGRAPH BEING EDITED";
    const paragraphSection = ctx ? `${ctxLabel}:\n${ctx}\n\n` : "";
    const suggestOutputFormat = `OUTPUT FORMAT — REQUIRED JSON:
Return a single JSON object:
{
  "content": "",
  "suggestedEdits": [
    {
      "type": "add_paragraph" | "rewrite_paragraph" | "add_citation",
      "description": "Short user-facing label",
      "proposedText": "The exact text to insert or replace — real case facts only"
    }
  ]
}
RULES: Provide exactly 2-3 suggestedEdits. Set "content" to empty string. Each proposedText must be grounded in the case file. Do not output markdown fences or any text outside the JSON object.`;
    return header + draftSection + matterSection + otherDraftsSection + paragraphSection + suggestOutputFormat;
  }

  return header + draftSection + matterSection + otherDraftsSection + outputFormat;
}

export async function sendDraftAssistantMessage(
  userMessageContent: string,
  draft: Draft,
  matter: Matter,
  docsWithResults: Array<{ doc: Document; result: ProcessingResult | null }>,
  otherDrafts: Draft[],
  history: DraftAssistantMessage[],
  mode: "suggest" | "chat" = "chat",
  context?: { paragraphContext?: string; selectionContext?: string }
): Promise<DraftAssistantMessage> {
  const systemPrompt = buildSystemPrompt(draft, matter, docsWithResults, otherDrafts, mode, context);

  // Last 10 messages for history
  const historyMessages = history.slice(-10).map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const response = await client.chat.completions.create({
    model: mode === "suggest" ? MODELS.premium : MODELS.fast,
    max_completion_tokens: 2048,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      ...historyMessages,
      { role: "user", content: userMessageContent },
    ],
  });

  const rawContent = stripCodeFences(response.choices[0].message.content ?? "");

  let parsed: { content: string; suggestedEdits?: SuggestedEdit[] } = {
    content: "I had trouble formatting that response. Please try again.",
    suggestedEdits: [],
  };
  try {
    const p = JSON.parse(rawContent);
    // Allow content === "" for suggest mode (empty string is valid, falsy but intentional)
    if (typeof p.content === "string") {
      parsed = {
        content: p.content,
        suggestedEdits: Array.isArray(p.suggestedEdits)
          ? p.suggestedEdits.map((e: Record<string, unknown>) => ({
              id: crypto.randomUUID(),
              type: e.type as SuggestedEdit["type"],
              description: String(e.description ?? ""),
              proposedText: String(e.proposedText ?? ""),
            })).filter((e: SuggestedEdit) => e.type && e.proposedText)
          : [],
      };
    }
  } catch {
    console.error("[Lexx:draft-assistant] Failed to parse AI response:", rawContent.slice(0, 300));
  }

  return {
    id: crypto.randomUUID(),
    role: "assistant",
    content: parsed.content,
    suggestedEdits: parsed.suggestedEdits,
    createdAt: new Date().toISOString(),
  };
}
