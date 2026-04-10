# LEXX — Claude Code Project Context

## What Is Lexx
Lexx is a **document-first legal intelligence system**. It turns uploaded legal documents
into structured intelligence and provides lawyers with a safe, controlled AI workspace.

It is NOT a chatbot. It is NOT legal research.
It is a document processing and structured output engine.

---

## V1 Scope
1. **Document Processor** — upload → summary, key issues, extracted facts, timeline, missing info
2. **Secure AI Workspace** — Q&A on document, draft generation (demand letter, summary, motion, email)

---

## Tech Stack
| Layer       | V1 (Now)                          | V2 (Later, easy swap)         |
|-------------|-----------------------------------|-------------------------------|
| UI          | Next.js 14 + Tailwind CSS         | Same                          |
| Database    | JSON files in /data/              | Supabase / Postgres / Prisma  |
| File Store  | Local disk /data/uploads/         | S3 / Supabase Storage         |
| AI          | Anthropic Claude API              | Same                          |
| Auth        | None (V1)                         | Supabase Auth / NextAuth      |
| Deploy      | Local / Vercel                    | Vercel                        |

---

## Architecture — The Adapter Pattern
All data access goes through ONE interface: `src/lib/db/adapter.ts`

To swap to a real database:
1. Create `src/lib/db/supabase.ts` (or `prisma.ts`) implementing `StorageAdapter`
2. Change the ONE import in `src/lib/db/index.ts`
3. Done. No other files change.

Same pattern for file storage: `src/lib/store/fileStore.ts`

---

## Project Structure
```
lexx/
├── data/                         ← V1 data store (gitignored)
│   ├── matters.json
│   ├── documents.json
│   ├── processing_results.json
│   ├── threads.json
│   ├── drafts.json
│   └── uploads/                  ← uploaded document files
├── src/
│   ├── lib/
│   │   ├── db/
│   │   │   ├── adapter.ts        ← StorageAdapter interface (never change)
│   │   │   ├── json.ts           ← V1 JSON implementation
│   │   │   └── index.ts          ← ONLY FILE TO CHANGE when swapping DB
│   │   ├── store/
│   │   │   └── fileStore.ts      ← file save/read (swap for S3 later)
│   │   ├── ai/
│   │   │   ├── processDocument.ts ← core document intelligence
│   │   │   └── workspace.ts       ← Q&A + draft generation
│   │   └── parsers/
│   │       └── extractText.ts     ← PDF + DOCX → plain text
│   ├── pages/api/
│   │   ├── matters/index.ts       ← GET list, POST create
│   │   ├── documents/
│   │   │   ├── index.ts           ← GET documents by matter
│   │   │   ├── process.ts         ← POST upload + process
│   │   │   └── result.ts          ← GET processing result
│   │   └── workspace/
│   │       ├── ask.ts             ← POST Q&A
│   │       └── draft.ts           ← POST generate draft
│   ├── types/index.ts             ← All TypeScript interfaces
│   └── components/                ← UI (build next)
├── docs/
├── .env.local                     ← ANTHROPIC_API_KEY goes here
└── CLAUDE.md                      ← this file
```

---

## Data Flow
```
User uploads PDF
    → POST /api/documents/process
    → extractText() → plain text
    → processDocument() → Claude API → structured JSON
    → db.saveProcessingResult()
    → saved to data/processing_results.json
    → returned to UI as 5 cards

User asks question in workspace
    → POST /api/workspace/ask
    → db.getProcessingResult() → context
    → askQuestion() → Claude API → answer
    → db.appendMessage() → saved to thread
    → returned to UI
```

---

## AI Rules (CRITICAL — never violate)
- ALL Claude API calls live in `src/lib/ai/` — nowhere else
- Always use model: `claude-sonnet-4-20250514`
- Output always validated against TypeScript types before saving
- Never expose raw AI output to UI — always parsed through types
- Never train or fine-tune on client data
- Always include disclaimer: "This is not legal advice. Attorney review required."

---

## UX Rules
- No blank prompt boxes — every AI action is a button
- Outputs shown as structured cards, not walls of text
- Disclaimer visible on every AI output
- Loading states on all async operations

---

## What NOT To Build in V1
- Auth / login
- Case management
- Legal research (external data)
- Billing / time tracking
- Email automation (V2)
- Intake forms (V2)

---

## Install
```bash
npx create-next-app@latest . --typescript --tailwind --app
npm install @anthropic-ai/sdk pdf-parse mammoth formidable
npm install -D @types/formidable @types/pdf-parse
cp .env.example .env.local
# Add your ANTHROPIC_API_KEY to .env.local
```

## Positioning
✅ "Lexx turns your documents into structured intelligence instantly."
❌ "AI chatbot" / "Legal AI tool"
