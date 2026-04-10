import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const client = new OpenAI();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { draftType, selectedText, surroundingContext } = req.body as {
    draftType: string;
    selectedText: string;
    surroundingContext: string;
  };

  if (!selectedText?.trim()) return res.status(400).json({ error: "selectedText is required" });

  const systemPrompt = `You are a legal writing assistant. Your job is to rewrite a selected passage from a legal document.
You will be given the selected text and the surrounding context.
Generate exactly 3 distinct rewrites of the selected text.
Each rewrite should preserve the legal meaning but vary in tone, specificity, or structure.
CRITICAL: Each rewrite must be a single continuous string with absolutely no line breaks (no \\n characters). One paragraph, one string.
Respond ONLY with valid JSON in this exact format: { "variants": ["variant 1 text", "variant 2 text", "variant 3 text"] }
No markdown, no explanation, no extra keys.`;

  const userPrompt = `Document type: ${draftType || "legal document"}

Surrounding context (DO NOT rewrite this, just use it for reference):
${surroundingContext || "(no context provided)"}

Selected text to rewrite:
${selectedText}

Generate 3 distinct rewrites of the selected text.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0].message.content || "";
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const parsed = JSON.parse(cleaned);
  return res.status(200).json({ variants: parsed.variants });
}
