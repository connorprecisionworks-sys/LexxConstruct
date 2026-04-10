/**
 * LEXX — Chat AI
 *
 * Scoped per-matter conversational assistant. Every response cites source
 * documents. Uses get_document_excerpt tool for deep retrieval (simple text
 * search, no embeddings).
 */

import OpenAI from "openai";
import type {
  Matter,
  Document,
  ProcessingResult,
  Flag,
  ChatConversation,
  ChatMessage,
  Citation,
  SuggestedAction,
} from "@/types";
import { readFile } from "@/lib/store/fileStore";
import { extractText } from "@/lib/parsers/extractText";

const client = new OpenAI();
const MODEL = "gpt-4o";

// ── Token estimation ──────────────────────────────────────────────────────────
// Rough approximation: 4 chars ≈ 1 token
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// ── System prompt ─────────────────────────────────────────────────────────────
export function buildSystemPrompt(
  matter: Matter,
  documents: Document[],
  results: Map<string, ProcessingResult>,
  flags: Array<Flag & { documentFileName: string }>
): string {
  const TOKEN_BUDGET = 10000;
  let usedTokens = 0;

  const caseTypeLabel = (matter.caseType ?? "construction_general").replace(/_/g, " ");

  const headerLines = [
    `You are Lexx Chat, a legal research assistant scoped to a single construction litigation matter. You help attorneys understand the documents in their case file. You have access to the following matter:`,
    ``,
    `MATTER: ${matter.name}`,
    `CASE TYPE: ${caseTypeLabel}`,
    `CLIENT: ${matter.clientName}`,
    `STATUS: ${matter.status}`,
    ``,
    `DOCUMENTS IN THIS MATTER (${documents.length} total):`,
  ];
  const header = headerLines.join("\n");
  usedTokens += estimateTokens(header);

  // ── Document sections ────────────────────────────────────
  const docSections: string[] = [];
  for (const doc of documents) {
    const result = results.get(doc.id);
    if (!result) {
      const basic = `\n[${doc.id}] ${doc.fileName} (${doc.documentKind ?? "standard"}) — not yet processed`;
      docSections.push(basic);
      usedTokens += estimateTokens(basic);
      continue;
    }

    const docHeader = `\n[${doc.id}] ${doc.fileName} (${doc.documentKind ?? "standard"})\nSummary: ${result.summary}`;
    usedTokens += estimateTokens(docHeader);
    let docSection = docHeader;

    // Key issues — cut first if budget is tight
    if (result.keyIssues.length > 0 && usedTokens < TOKEN_BUDGET * 0.75) {
      const issues = `\nKey Issues:\n${result.keyIssues
        .map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`)
        .join("\n")}`;
      if (usedTokens + estimateTokens(issues) < TOKEN_BUDGET * 0.8) {
        docSection += issues;
        usedTokens += estimateTokens(issues);
      }
    }

    // Extracted facts (cap at 10 per doc)
    if (result.extractedFacts.length > 0 && usedTokens < TOKEN_BUDGET * 0.82) {
      const facts = `\nKey Facts:\n${result.extractedFacts
        .slice(0, 10)
        .map((f) => `- [${f.category.toUpperCase()}] ${f.fact}`)
        .join("\n")}`;
      if (usedTokens + estimateTokens(facts) < TOKEN_BUDGET * 0.85) {
        docSection += facts;
        usedTokens += estimateTokens(facts);
      }
    }

    // Timeline (first to be cut under budget pressure)
    if (result.timeline.length > 0 && usedTokens < TOKEN_BUDGET * 0.87) {
      const timeline = `\nTimeline:\n${result.timeline
        .slice(0, 8)
        .map((t) => `- ${t.date}: ${t.description}`)
        .join("\n")}`;
      if (usedTokens + estimateTokens(timeline) < TOKEN_BUDGET * 0.9) {
        docSection += timeline;
        usedTokens += estimateTokens(timeline);
      }
    }

    // Missing info (first to be cut under budget pressure)
    if (result.missingInformation.length > 0 && usedTokens < TOKEN_BUDGET * 0.9) {
      const missing = `\nMissing Info:\n${result.missingInformation
        .slice(0, 5)
        .map((m) => `- [${m.importance.toUpperCase()}] ${m.description}`)
        .join("\n")}`;
      if (usedTokens + estimateTokens(missing) < TOKEN_BUDGET * 0.92) {
        docSection += missing;
        usedTokens += estimateTokens(missing);
      }
    }

    // Deposition analysis
    if (result.depositionAnalysis && usedTokens < TOKEN_BUDGET * 0.92) {
      const d = result.depositionAnalysis;
      const topAdmissions = d.keyAdmissions
        .slice(0, 5)
        .map(
          (a) =>
            `- [${a.significance.toUpperCase()}] ${a.topic}: ${a.admission}${a.pageReference ? ` (${a.pageReference})` : ""}`
        )
        .join("\n");
      const inconsistencies =
        d.inconsistencies
          .slice(0, 3)
          .map((i) => `- ${i.topic}: ${i.description}`)
          .join("\n") || "None identified";
      const depoSection = `\nDeposition — Witness: ${d.witnessName} (${d.witnessRole}), Date: ${d.depositionDate}\nKey Admissions:\n${topAdmissions}\nInconsistencies:\n${inconsistencies}`;
      if (usedTokens + estimateTokens(depoSection) < TOKEN_BUDGET * 0.94) {
        docSection += depoSection;
        usedTokens += estimateTokens(depoSection);
      }
    }

    docSections.push(docSection);
  }

  // ── Case intelligence ────────────────────────────────────
  let caseIntelSection = "";
  if (matter.caseIntelligence && usedTokens < TOKEN_BUDGET * 0.93) {
    const ci = matter.caseIntelligence;
    let ci_text = `\n\nCASE INTELLIGENCE:\nOverview: ${ci.caseOverview}`;
    if (ci.factConsistency.length > 0) {
      ci_text += `\nContradictions Detected:\n${ci.factConsistency
        .slice(0, 3)
        .map(
          (f) =>
            `- ${f.topic}: [${f.documentA.id}] says "${f.documentA.statement}" vs [${f.documentB.id}] says "${f.documentB.statement}"`
        )
        .join("\n")}`;
    }
    if (usedTokens + estimateTokens(ci_text) < TOKEN_BUDGET * 0.95) {
      caseIntelSection = ci_text;
      usedTokens += estimateTokens(ci_text);
    }
  }

  // ── Flags ────────────────────────────────────────────────
  let flagsSection = "";
  if (flags.length > 0 && usedTokens < TOKEN_BUDGET * 0.95) {
    const activeFlags = flags.filter((f) => !f.resolved);
    if (activeFlags.length > 0) {
      const flags_text = `\n\nFLAGS IN THIS MATTER (${activeFlags.length} active):\n${activeFlags
        .slice(0, 15)
        .map((f) => `- [${f.type.toUpperCase()}] ${f.text} (${f.documentFileName})`)
        .join("\n")}`;
      if (usedTokens + estimateTokens(flags_text) < TOKEN_BUDGET * 0.97) {
        flagsSection = flags_text;
        usedTokens += estimateTokens(flags_text);
      }
    }
  }

  // ── Rules and output format ──────────────────────────────
  const rules = `

━━━ CITATION CONTRACT — NON-NEGOTIABLE ━━━
Every inline marker [cite:N] you write in "content" MUST have a corresponding entry in the "citations" array with "id": "cite:N". One marker = one citation object. If you write [cite:1] and [cite:2] in content, citations must contain objects with "id": "cite:1" and "id": "cite:2". An empty citations array combined with any inline markers is a structural error that breaks the application. If you cannot cite a source for a claim, do not make the claim.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULES:
1. Answer only from the documents in this matter. Never reference outside knowledge, general legal principles, or other cases.
2. CITATIONS ARE MANDATORY: Every factual claim must include an inline [cite:N] marker AND a matching entry in the citations array. The N in [cite:N] must match the "id" field "cite:N" in citations. Number citations sequentially starting at 1.
3. If the documents do not contain information to answer a question, say so explicitly: "The documents in this matter do not contain information about [topic]." Do not use citation markers for this statement.
4. Never provide legal advice or strategic recommendations. Describe what the documents say. If the attorney asks for advice, redirect: "I can help you understand what the documents say about this — [rephrased version of the question as a factual question]."
5. When appropriate, suggest a next step (draft a document, view a specific document, view a flag). These are suggestions only.
6. If a question requires a specific quote or text not in your summaries, use the get_document_excerpt tool to retrieve it. Use the document's ID (the part in [brackets] above) as the documentId argument.
7. If you see any reference to a case or matter other than "${matter.name}", respond: "I only have access to the documents in ${matter.name}. I can't help with other cases from this conversation."
8. Write as a senior associate briefing a partner: direct, factual, unhedged, but never overconfident. No preamble. No "certainly" or "great question."

OUTPUT FORMAT — YOU MUST RETURN VALID JSON:
Your entire response must be a single JSON object. No markdown fences, no backticks, no text outside the JSON.

EXAMPLE (two citations, two markers):
{
  "content": "The waterproofing issue was first documented on August 12, 2022 [cite:1]. Castillo acknowledged awareness in his deposition [cite:2].",
  "citations": [
    { "id": "cite:1", "documentId": "abc-uuid-here", "documentName": "Daily Log 8-12-22.pdf", "excerpt": "Waterproofing membrane failure noted at north elevation", "location": "Entry dated Aug 12 2022" },
    { "id": "cite:2", "documentId": "def-uuid-here", "documentName": "Castillo Deposition.pdf", "excerpt": "I became aware of the issue in August", "location": "p.47" }
  ],
  "suggestedActions": []
}

RULES FOR THE JSON:
- "content": markdown string with [cite:N] markers for every factual claim
- "citations": array with one entry per marker — NEVER empty if content has markers
- Each citation: { "id": "cite:N", "documentId": "<uuid from doc list above>", "documentName": "<filename>", "excerpt": "<exact text or paraphrase>", "location": "<page/section or empty string>" }
- "suggestedActions": array (may be empty)
- If no facts are cited, citations may be []`;

  return header + docSections.join("") + caseIntelSection + flagsSection + rules;
}

// ── Document excerpt retrieval ────────────────────────────────────────────────
async function getDocumentExcerpt(
  documentId: string,
  query: string,
  documents: Document[]
): Promise<string> {
  const doc = documents.find((d) => d.id === documentId);
  if (!doc) {
    return `Error: Document with ID "${documentId}" was not found in this matter. Check the document IDs listed in the system prompt.`;
  }

  try {
    const buffer = readFile(doc.storageKey);
    const text = await extractText(buffer, doc.fileType);

    if (!text.trim()) {
      return `Document "${doc.fileName}" appears to be empty or could not be parsed.`;
    }

    // Score paragraphs by query term matches
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3);

    const paragraphs = text.split(/\n\n+/).filter((p) => p.trim().length > 20);

    if (paragraphs.length === 0) {
      const excerpt = text.slice(0, 2000);
      return `[From "${doc.fileName}" — no paragraph breaks found, showing start of document:]\n\n${excerpt}${text.length > 2000 ? "\n[Document continues...]" : ""}`;
    }

    const scored = paragraphs.map((p, i) => {
      const lower = p.toLowerCase();
      const score =
        queryTerms.length > 0
          ? queryTerms.reduce((acc, term) => acc + (lower.split(term).length - 1), 0)
          : 0;
      return { p, i, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    if (best.score === 0) {
      const start = text.slice(0, 2000);
      return `[No exact match found for "${query}" in "${doc.fileName}". Showing start of document:]\n\n${start}${text.length > 2000 ? "\n[Document continues...]" : ""}`;
    }

    // Return best paragraph plus one before and two after for context
    const contextStart = Math.max(0, best.i - 1);
    const contextEnd = Math.min(paragraphs.length - 1, best.i + 2);
    const contextParagraphs: string[] = [];
    for (let i = contextStart; i <= contextEnd; i++) {
      contextParagraphs.push(paragraphs[i]);
    }

    const excerpt = contextParagraphs.join("\n\n");
    const result =
      excerpt.length > 2000 ? excerpt.slice(0, 2000) + "\n[Excerpt truncated]" : excerpt;
    return `[From "${doc.fileName}"]\n\n${result}`;
  } catch (e) {
    return `Error reading "${doc.fileName}": ${e instanceof Error ? e.message : "Unknown error"}`;
  }
}

// ── Main chat function ────────────────────────────────────────────────────────
export interface ChatResult {
  assistantMessage: ChatMessage;
  newConversationName?: string;
}

export async function sendChatMessage(
  conversation: ChatConversation,
  userMessageContent: string,
  matter: Matter,
  documents: Document[],
  results: Map<string, ProcessingResult>,
  flags: Array<Flag & { documentFileName: string }>
): Promise<ChatResult> {
  const systemPrompt = buildSystemPrompt(matter, documents, results, flags);

  // Last 20 messages for history (skip system messages)
  const history = conversation.messages
    .filter((m) => m.role !== "system")
    .slice(-20);

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: userMessageContent },
  ];

  const tools: OpenAI.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_document_excerpt",
        description:
          "Retrieve a specific excerpt from a document in this matter when the summary is not enough to answer a question. Use this for specific quotes, page references, or detailed text.",
        parameters: {
          type: "object",
          properties: {
            documentId: {
              type: "string",
              description:
                "The UUID of the document to retrieve from (the ID shown in [brackets] in the system prompt)",
            },
            query: {
              type: "string",
              description: "What you are looking for in the document",
            },
          },
          required: ["documentId", "query"],
        },
      },
    },
  ];

  let toolCallCount = 0;
  let currentMessages = [...messages];

  // Agentic loop — cap at 3 tool calls per turn
  while (true) {
    const response = await client.chat.completions.create({
      model: MODEL,
      max_tokens: 2048,
      messages: currentMessages,
      tools,
      tool_choice: "auto",
    });

    const choice = response.choices[0];

    if (choice.finish_reason === "tool_calls" && choice.message.tool_calls?.length) {
      // Append assistant message with tool calls
      currentMessages.push({
        role: "assistant",
        content: choice.message.content ?? null,
        tool_calls: choice.message.tool_calls,
      });

      for (const toolCall of choice.message.tool_calls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tcFn = (toolCall as any).function as { name: string; arguments: string } | undefined;
        if (!tcFn) continue;
        if (toolCallCount >= 3) {
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content:
              "Tool call limit reached (3 per turn). Please synthesize from the information you already have.",
          });
          continue;
        }

        if (tcFn.name === "get_document_excerpt") {
          toolCallCount++;
          let args: { documentId: string; query: string };
          try {
            args = JSON.parse(tcFn.arguments);
          } catch {
            currentMessages.push({
              role: "tool",
              tool_call_id: toolCall.id,
              content: "Error: Invalid tool arguments — could not parse JSON",
            });
            continue;
          }
          const excerpt = await getDocumentExcerpt(args.documentId, args.query, documents);
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: excerpt,
          });
        } else {
          currentMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Unknown tool: ${tcFn.name}`,
          });
        }
      }
      // Continue loop to get final response
    } else {
      // Final text response
      const rawContent = (choice.message.content ?? "").trim();

      // Helper: parse raw JSON string from model into structured response
      const parseRaw = (raw: string): { content: string; citations: Citation[]; suggestedActions: SuggestedAction[] } | null => {
        try {
          const cleaned = raw
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```\s*$/i, "")
            .trim();
          const p = JSON.parse(cleaned);
          if (!p.content || typeof p.content !== "string") return null;
          if (!Array.isArray(p.citations)) p.citations = [];
          if (!Array.isArray(p.suggestedActions)) p.suggestedActions = [];
          return p;
        } catch {
          return null;
        }
      };

      // Count inline citation markers in content string
      const countMarkers = (text: string): number =>
        (text.match(/\[(?:cite[\s_:]*\s*)?\d+\]/gi) ?? []).length;

      // Parse first response
      let parsed = parseRaw(rawContent);
      if (!parsed) {
        console.error("[Lexx Chat] Failed to parse AI response:", rawContent.slice(0, 300));
        parsed = {
          content: rawContent || "I had trouble formatting that response. Could you rephrase your question?",
          citations: [],
          suggestedActions: [],
        };
      }

      const markerCount = countMarkers(parsed.content);
      console.log(
        `[Lexx Chat Server] citations returned: ${parsed.citations.length}, markers in content: ${markerCount}`
      );

      // Retry if markers exist but citations array is missing or too short
      if (markerCount > 0 && parsed.citations.length < markerCount) {
        console.log("[Lexx Chat Server] Citation mismatch — retrying with corrective prompt");
        try {
          const retryMessages: OpenAI.ChatCompletionMessageParam[] = [
            ...currentMessages,
            { role: "assistant", content: rawContent },
            {
              role: "user",
              content:
                `Your previous response contained ${markerCount} inline citation marker(s) (e.g. [1], [cite:1]) ` +
                `but the "citations" array had only ${parsed.citations.length} entr${parsed.citations.length === 1 ? "y" : "ies"}. ` +
                `The citation contract requires every marker in "content" to have a matching object in "citations". ` +
                `Rewrite your ENTIRE response as valid JSON — same "content" text with the same markers, ` +
                `but with a complete "citations" array where each entry has: ` +
                `"id" (matching the marker, e.g. "cite:1"), "documentId", "documentName", "excerpt" (verbatim quote), and optionally "location". ` +
                `Return ONLY the JSON object, no markdown fences.`,
            },
          ];
          const retryResponse = await client.chat.completions.create({
            model: MODEL,
            max_tokens: 2048,
            messages: retryMessages,
            response_format: { type: "json_object" },
          });
          const retryRaw = (retryResponse.choices[0].message.content ?? "").trim();
          const retryParsed = parseRaw(retryRaw);
          if (retryParsed) {
            const retryMarkers = countMarkers(retryParsed.content);
            console.log(
              `[Lexx Chat Server] Retry — citations returned: ${retryParsed.citations.length}, markers in content: ${retryMarkers}`
            );
            parsed = retryParsed;
          } else {
            console.error("[Lexx Chat Server] Retry parse also failed — keeping original");
          }
        } catch (retryErr) {
          console.error("[Lexx Chat Server] Retry request failed:", retryErr);
        }
      }

      const tokenUsage = response.usage
        ? {
            prompt: response.usage.prompt_tokens,
            completion: response.usage.completion_tokens,
            total: response.usage.total_tokens,
          }
        : undefined;

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: parsed.content,
        citations: parsed.citations,
        suggestedActions: parsed.suggestedActions,
        createdAt: new Date().toISOString(),
        tokenUsage,
      };

      // Auto-name if this is the first message and name is still default
      let newConversationName: string | undefined;
      const isFirstMessage = conversation.messages.filter((m) => m.role === "user").length === 0;
      if (isFirstMessage && conversation.name === "New conversation") {
        try {
          const nameRes = await client.chat.completions.create({
            model: "gpt-4o-mini",
            max_tokens: 20,
            messages: [
              {
                role: "user",
                content: `Generate a 3-5 word title for a legal research conversation that starts with this message. Return only the title, no quotes, no punctuation at end:\n\n${userMessageContent}`,
              },
            ],
          });
          const raw = (nameRes.choices[0].message.content ?? "").trim().replace(/^["']|["']$/g, "");
          if (raw) newConversationName = raw;
        } catch {
          // Auto-naming failed — leave as "New conversation"
        }
      }

      return { assistantMessage, newConversationName };
    }
  }
}
