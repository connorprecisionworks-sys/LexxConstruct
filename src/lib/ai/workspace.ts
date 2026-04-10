import OpenAI from "openai";
import type { ProcessingResult, WorkspaceActionType, WorkspaceMessage } from "@/types";

const client = new OpenAI();
const MODEL = "gpt-4o";
const DISCLAIMER = "This output is not legal advice and requires attorney review before any action is taken.";

// ── Q&A system prompt ─────────────────────────────────────────────────────────
// Used for ask-question only. Instructs the model to stay grounded in the
// document and end answers with a disclaimer.
function buildQaSystemPrompt(r: ProcessingResult): string {
  return `You are a legal assistant helping a construction litigation attorney work with a specific project document.
DOCUMENT SUMMARY: ${r.summary}
KEY ISSUES: ${r.keyIssues.map((i) => `- ${i.title}: ${i.description}`).join("\n")}
EXTRACTED FACTS: ${r.extractedFacts.map((f) => `- [${f.category.toUpperCase()}] ${f.fact}`).join("\n")}
TIMELINE: ${r.timeline.map((t) => `- ${t.date}: ${t.description}`).join("\n")}
MISSING INFORMATION: ${r.missingInformation.map((m) => `- [${m.importance.toUpperCase()}] ${m.description}`).join("\n")}
RULES: Only answer based on the document. Use construction industry terminology accurately. Do not invent facts. If information is not in the document, say so clearly. Always end your answer with: "${DISCLAIMER}"`;
}

// ── Draft system prompt ───────────────────────────────────────────────────────
// Base for all draft generation. The model writes as the attorney, never as an
// assistant. Placeholders fill gaps — no narration of absence, no refusals.
const DRAFT_SYSTEM_PROMPT = `You are drafting a construction litigation document on behalf of an attorney. Produce only the document itself — no commentary, no apologies, no disclaimers, no explanations of what you are doing. When specific information is not available in the source document, use bracketed placeholders like [Contract Number], [Attorney Name], or [Project Owner] — never narrate the absence or explain that information is missing. Write in the confident, direct voice of an experienced construction litigator. Do not hedge. Do not refuse. Do not add "this is not legal advice" to the output. Do not begin with "Here is a draft" or any other preamble — start immediately with the document content. The attorney will review and finalize before sending. Use construction industry terminology accurately: change order, RFI, pay application, substantial completion, notice to proceed, critical path, liquidated damages, retainage, differing site conditions.

FORMAT RULES — CRITICAL:
- Output valid HTML using <p> tags for every paragraph and section block.
- Each distinct section must be its own <p> element: letterhead block, date, recipient address block, RE line, salutation, each body paragraph, and signature block are all separate <p> elements.
- Within address blocks (letterhead, recipient address, signature), use <br> between lines — do NOT wrap each line in its own <p>.
- Never output one continuous block of text. Never use plain newlines as paragraph separators — use <p> tags only.
- Do not output any markdown, asterisks, or backticks. Output only HTML.`;

function buildDraftContext(r: ProcessingResult): string {
  let ctx = `SOURCE DOCUMENT FACTS:
Summary: ${r.summary}
Key Issues: ${r.keyIssues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n")}
Extracted Facts: ${r.extractedFacts.map((f) => `- [${f.category.toUpperCase()}] ${f.fact}`).join("\n")}
Timeline: ${r.timeline.map((t) => `- ${t.date}: ${t.description}`).join("\n")}
Missing Information (use placeholders for these): ${r.missingInformation.map((m) => `- ${m.description}`).join("\n") || "None identified"}`;

  if (r.depositionAnalysis) {
    const d = r.depositionAnalysis;
    const topAdmissions = d.keyAdmissions
      .filter((a) => a.significance === "high")
      .slice(0, 3)
      .map((a) => `- [${a.significance.toUpperCase()}] ${a.topic}: ${a.admission}${a.pageReference ? ` (${a.pageReference})` : ""}`)
      .join("\n");
    ctx += `

DEPOSITION CONTEXT:
Witness: ${d.witnessName} (${d.witnessRole})
Date: ${d.depositionDate}
Top Admissions:
${topAdmissions || "None identified"}`;
  }

  return ctx;
}

const DRAFT_INSTRUCTIONS: Record<string, string> = {
  draft_claim_letter: `Draft a construction claim letter on behalf of the attorney's client giving formal notice under the contract's notice provisions. The letter must: identify the specific contract clause being invoked for notice; identify the triggering event with its exact date from the documents; describe the nature of the impact — time extension, additional compensation, or both; include preliminary quantification of time and cost impact using figures from the documents; and close by expressly reserving all rights under the contract and applicable law. Use formal legal correspondence format:
- Letterhead block (firm name, address, phone, email — use placeholders if not in documents)
- Date line
- Recipient block (owner or owner's representative name, company, address)
- RE: line identifying the project name, contract number, and nature of the claim
- Salutation
- Body paragraphs
- Signature block
Use bracketed placeholders for any information not in the documents.`,

  draft_summary: `Draft an internal case summary memorandum for attorney review. The memo must contain these sections:
1. Project Overview — project name, location, owner, general contractor, key subcontractors, contract amount, contract type, and project scope
2. Dispute Overview — nature of the dispute, claims asserted by each party, and relief sought
3. Parties — all parties, their roles, and their counsel if identified in the documents
4. Relevant Contract Terms — key provisions bearing on the dispute: notice requirements, time extension procedures, dispute resolution clauses, liquidated damages, retainage provisions
5. Chronology — key events in chronological order, citing the specific document for each fact
6. Document Gaps — key documents referenced but not available, information missing from available documents
Write in plain, direct prose. Do not hedge. Cite specific document names when stating facts. Use construction industry terminology accurately.`,

  draft_mediation_brief: `Draft a pre-mediation position paper outline. The document must contain:
1. Introduction — identify the parties, the project, and the dispute; state the client's position in summary
2. Project Background — contract structure, parties' roles, project scope, contract price, and timeline
3. Statement of Facts — chronological narrative of the dispute, drawing exclusively from the documents provided, citing specific document names for key facts
4. Client's Position — the legal and factual basis for the client's claims or defenses, organized by claim type (delay, payment, defect, etc.)
5. Damages — itemized damages with document support for each category (include specific dollar amounts and time impacts from the documents where available)
6. Key Evidence Summary — the strongest documentary evidence supporting the client's position, with specific document citations
7. Resolution Parameters — [SETTLEMENT PARAMETERS — ATTORNEY TO COMPLETE]
Format as a structured document with numbered sections and lettered subsections. Use construction industry terminology accurately. Cite specific documents — do not use generic references.`,

  draft_deposition_outline: `Draft a witness deposition outline based on the documents provided. Organize as follows:
1. Background and Qualifications — [WITNESS NAME]'s role on the project, tenure, responsibilities, and reporting structure
2. Contract Knowledge — what the witness knows about the contract terms, scope, and project goals
3. Project Execution — the witness's involvement in day-to-day project management, specific decisions and events identified in the documents
4. Specific Events — for each significant event in the documents (delays, change orders, RFIs, claim notices, payment disputes, defect discoveries), targeted questions about the witness's knowledge and involvement. Reference specific documents by name and date.
5. Communications — specific correspondence, emails, and meeting minutes referencing or authored by the witness
6. Damages — the witness's knowledge of cost impacts, schedule impacts, and financial effects
Frame questions in deposition format — open-ended, grounded in specific facts from the documents. Insert [WITNESS NAME] and [WITNESS ROLE] where needed. Do not fabricate facts not supported by the documents.`,

  draft_delay_narrative: `Draft a delay narrative memorandum for expert handoff. The narrative must:
- Describe the project's baseline schedule and planned sequence of work, citing the specific schedule document
- Identify each delay event in chronological order from the documents: state the date, cause, responsible party (owner, contractor, third party, or force majeure), and the documents that establish each event
- Explain the causal chain from each delay event to the schedule impact
- Distinguish between excusable delays (for which time extension may be owed) and compensable delays (for which both time and money may be owed)
- Note any concurrent delays identified in the documents
- Summarize the cumulative schedule impact based on the documents
Write in clear, factual prose suitable for a scheduling expert to use as a starting framework. Cite the specific document for every factual assertion. Use construction scheduling terminology accurately: critical path, float, concurrent delay, pacing delay, excusable delay, compensable delay. Use bracketed placeholders for any schedule data not available in the documents.`,

  draft_defect_summary: `Draft a defect summary memorandum organized by defect category. For each defect or category of defects:
- State the location on the project
- Describe the nature of the condition using specific language from the documents
- State the date of discovery or first documentation
- Identify the responsible party if established in the documents
- List the documents that evidence the defect (by name)
- Summarize any testing findings, expert conclusions, or repair estimates from the documents
- Note any applicable code compliance issues
Organize by defect category (roofing, waterproofing, structural, mechanical, etc. — use categories that match the actual defects in the documents). For each defect include a "Document Support" line naming specific documents. Write in plain, factual prose. State what the documents show — do not characterize liability. Use bracketed placeholders for missing information.`,

  draft_motion: `Draft a motion outline for construction litigation (summary judgment, motion to compel arbitration, or similar). The outline must contain:
1. Case Caption — party names, case number, court or arbitration forum, and counsel (use placeholders for any not in the documents)
2. Introduction — one paragraph stating the motion and the specific relief sought
3. Statement of Facts — numbered factual paragraphs grounded in the documents; each paragraph must cite a specific document by name; include only facts relevant to the motion
4. Legal Standard — [APPLICABLE STANDARD — ATTORNEY TO COMPLETE WITH CITATION]
5. Argument — organized by legal theory with clear subheadings; each argument section states the rule, applies the documented facts, and uses [Case Citation] and [Statute] placeholders where legal authority is needed; tie every factual assertion to a specific document
6. Conclusion — state the specific relief requested
Write in formal motion style. Facts must be grounded in the documents provided. Do not invent legal citations.`,

  draft_client_update: `Draft a client update email. Format as a professional email with To/From/Subject header fields, then body and signature. The email must:
- Open with [Client Name]'s name (or use [Client Name] placeholder if not in documents)
- State clearly why you are writing
- Summarize the most significant recent developments on the dispute with specific dates and references to what has happened (drawn from the documents)
- Identify any upcoming deadlines, hearings, or required responses with specific dates
- List any action items the client needs to complete, clearly and specifically
- Close professionally with next steps
Write in plain English the client can understand — no legal jargon. Be direct. Use specific dates, amounts, and event descriptions from the documents. Use bracketed placeholders for anything not in the documents.`,

  deposition_summary_memo: `Draft an internal deposition summary memo with sections: MEMORANDUM header, TO/FROM/DATE/RE lines, Executive Summary (2-3 sentences), Witness Background, Key Admissions (bulleted with page references in (Tr. X) format), Key Denials, Exhibits Discussed, Inconsistencies Noted, and Recommendations. Use direct declarative language. Output HTML with <p>, <h3>, <ul>, <li> tags.`,

  cross_examination_outline: `Draft a cross-examination outline organized by topic. Each topic: heading, Goal (one sentence), numbered leading questions with expected answer in brackets. Favor short one-fact questions. Output HTML with <h3> for topics, <p> for goals, <ol><li> for questions.`,

  witness_prep_outline: `Draft a witness preparation outline covering: background topics, key facts to remember, prior statements made, likely areas of attack by opposing counsel, and recommended framing for difficult questions. Coaching tone. Output HTML with <h3> for sections, <p> for narrative, <ul><li> for points.`,
};

export async function askQuestion(
  question: string,
  processingResult: ProcessingResult,
  history: WorkspaceMessage[]
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: buildQaSystemPrompt(processingResult) },
    ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: question },
  ];
  const response = await client.chat.completions.create({ model: MODEL, max_tokens: 1024, messages });
  return (response.choices[0].message.content || "").trim();
}

export async function generateDraft(
  actionType: WorkspaceActionType,
  processingResult: ProcessingResult,
  additionalContext?: string
): Promise<string> {
  const instruction = DRAFT_INSTRUCTIONS[actionType] || "Draft a professional construction litigation document summarizing the key facts, parties, and issues from the source document. Use bracketed placeholders for any missing information.";
  const context = additionalContext ? `\nAdditional context from attorney: ${additionalContext}` : "";

  const response = await client.chat.completions.create({
    model: MODEL,
    max_tokens: 4096,
    messages: [
      { role: "system", content: DRAFT_SYSTEM_PROMPT },
      { role: "user", content: `${buildDraftContext(processingResult)}\n\n${instruction}${context}` },
    ],
  });

  return (response.choices[0].message.content || "").trim();
}
