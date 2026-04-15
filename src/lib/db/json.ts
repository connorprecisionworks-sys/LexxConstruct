/**
 * LEXX — JSON File Storage Adapter (V1)
 */

import fs from "fs";
import path from "path";
import { deleteFile } from "@/lib/store/fileStore";
import type { StorageAdapter } from "./adapter";
import type {
  Matter,
  MatterStatus,
  Document,
  ProcessingStage,
  ProcessingResult,
  WorkspaceThread,
  WorkspaceMessage,
  Draft,
  DraftVersion,
  Flag,
  FlagType,
  Activity,
  ChatConversation,
  ChatMessage,
  DraftAssistantConversation,
  DraftAssistantMessage,
} from "@/types";

const DATA_DIR = path.join(process.cwd(), "data");

const VALID_CASE_TYPES = new Set([
  "construction_delay",
  "construction_defect",
  "construction_payment",
  "construction_general",
]);
const warnedCaseTypes = new Set<string>();

// On-read migration: coerce legacy PI caseType values and unset caseType to
// "construction_general". Logs a warning once per distinct legacy value per run.
function normalizeMatter(m: Matter): Matter {
  if (m.caseType && VALID_CASE_TYPES.has(m.caseType)) return m;
  if (m.caseType && !warnedCaseTypes.has(m.caseType)) {
    console.warn(`[Lexx] Legacy caseType "${m.caseType}" coerced to "construction_general" (matter: ${m.id})`);
    warnedCaseTypes.add(m.caseType);
  }
  return { ...m, caseType: "construction_general" as const };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readCollection<T>(name: string): T[] {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${name}.json`);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

/** Lazy migration: ensure every Draft has a status field. */
function normalizeDraft(d: Draft): Draft {
  if (d.status) return d;
  return { ...d, status: "draft" };
}

function writeCollection<T>(name: string, data: T[]): void {
  ensureDataDir();
  const filePath = path.join(DATA_DIR, `${name}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export const JsonAdapter: StorageAdapter = {
  // ── Matters ──────────────────────────────────────────────
  async getMatter(id) {
    const m = readCollection<Matter>("matters").find((m) => m.id === id);
    return m ? normalizeMatter(m) : null;
  },
  async listMatters() {
    return readCollection<Matter>("matters").map(normalizeMatter);
  },
  async saveMatter(matter) {
    const all = readCollection<Matter>("matters");
    const idx = all.findIndex((m) => m.id === matter.id);
    if (idx >= 0) all[idx] = matter;
    else all.push(matter);
    writeCollection("matters", all);
    return matter;
  },
  async updateMatterStatus(id, status: MatterStatus) {
    const all = readCollection<Matter>("matters");
    const idx = all.findIndex((m) => m.id === id);
    if (idx >= 0) {
      all[idx].status = status;
      all[idx].updatedAt = new Date().toISOString();
      writeCollection("matters", all);
    }
  },
  async updateMatterNotes(id, notes) {
    const all = readCollection<Matter>("matters");
    const idx = all.findIndex((m) => m.id === id);
    if (idx >= 0) {
      all[idx].notes = notes;
      all[idx].updatedAt = new Date().toISOString();
      writeCollection("matters", all);
    }
  },
  async deleteMatter(matterId) {
    // Collect document IDs belonging to this matter
    const docs = readCollection<Document>("documents").filter((d) => d.matterId === matterId);
    const docIds = new Set(docs.map((d) => d.id));

    // Delete physical upload files
    for (const doc of docs) {
      try { deleteFile(doc.storageKey); } catch { /* file already gone — ignore */ }
    }

    // Collect draft IDs so we can cascade to draft_versions
    // Include both document-scoped drafts and matter-level drafts (documentId: null, matterId set)
    const draftIds = new Set(
      readCollection<Draft>("drafts")
        .filter((d) =>
          (d.documentId != null && docIds.has(d.documentId)) ||
          d.matterId === matterId
        )
        .map((d) => d.id)
    );

    // Cascade: remove from every collection
    writeCollection("matters", readCollection<Matter>("matters").filter((m) => m.id !== matterId));
    writeCollection("documents", readCollection<Document>("documents").filter((d) => d.matterId !== matterId));
    writeCollection("processing_results", readCollection<ProcessingResult>("processing_results").filter((r) => !docIds.has(r.documentId)));
    writeCollection("threads", readCollection<WorkspaceThread>("threads").filter((t) => !docIds.has(t.documentId)));
    writeCollection("drafts", readCollection<Draft>("drafts").filter((d) =>
      !((d.documentId != null && docIds.has(d.documentId)) || d.matterId === matterId)
    ));
    writeCollection("draft_versions", readCollection<DraftVersion>("draft_versions").filter((v) => !draftIds.has(v.draftId)));
    writeCollection("draft_assistant_conversations", readCollection<DraftAssistantConversation>("draft_assistant_conversations").filter((c) => !draftIds.has(c.draftId)));
    writeCollection("chat_conversations", readCollection<ChatConversation>("chat_conversations").filter((c) => c.matterId !== matterId));
    writeCollection("activities", readCollection<Activity>("activities").filter((a) => a.matterId !== matterId));
  },

  // ── Documents ────────────────────────────────────────────
  async getDocument(id) {
    return readCollection<Document>("documents").find((d) => d.id === id) ?? null;
  },
  async listDocuments(matterId) {
    return readCollection<Document>("documents").filter((d) => d.matterId === matterId);
  },
  async listAllDocuments() {
    return readCollection<Document>("documents");
  },
  async saveDocument(doc) {
    const all = readCollection<Document>("documents");
    const idx = all.findIndex((d) => d.id === doc.id);
    if (idx >= 0) all[idx] = doc;
    else all.push(doc);
    writeCollection("documents", all);
    return doc;
  },
  async updateDocumentStatus(id, status) {
    const all = readCollection<Document>("documents");
    const idx = all.findIndex((d) => d.id === id);
    if (idx >= 0) {
      all[idx].status = status;
      writeCollection("documents", all);
    }
  },
  async updateDocumentStage(id, stage: ProcessingStage) {
    const all = readCollection<Document>("documents");
    const idx = all.findIndex((d) => d.id === id);
    if (idx >= 0) {
      all[idx].processingStage = stage;
      writeCollection("documents", all);
    }
  },
  async updateDocumentNotes(id, notes) {
    const all = readCollection<Document>("documents");
    const idx = all.findIndex((d) => d.id === id);
    if (idx >= 0) {
      all[idx].notes = notes;
      writeCollection("documents", all);
    }
  },

  // ── Processing Results ────────────────────────────────────
  async getProcessingResult(documentId) {
    return (
      readCollection<ProcessingResult>("processing_results").find(
        (r) => r.documentId === documentId
      ) ?? null
    );
  },
  async saveProcessingResult(result) {
    const all = readCollection<ProcessingResult>("processing_results");
    const idx = all.findIndex((r) => r.documentId === result.documentId);
    if (idx >= 0) all[idx] = result;
    else all.push(result);
    writeCollection("processing_results", all);
    return result;
  },
  async addFlag(documentId, flagData) {
    const all = readCollection<ProcessingResult>("processing_results");
    const idx = all.findIndex((r) => r.documentId === documentId);
    if (idx < 0) throw new Error("ProcessingResult not found for document");
    const flag: Flag = {
      ...flagData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      documentId,
    };
    if (!all[idx].flags) all[idx].flags = [];
    all[idx].flags.push(flag);
    writeCollection("processing_results", all);
    return flag;
  },
  async updateFlag(flagId, updates) {
    const all = readCollection<ProcessingResult>("processing_results");
    for (const result of all) {
      if (!result.flags) continue;
      const fi = result.flags.findIndex((f) => f.id === flagId);
      if (fi >= 0) {
        if (updates.resolved === true && !result.flags[fi].resolved) {
          result.flags[fi].resolvedAt = new Date().toISOString();
        }
        result.flags[fi] = { ...result.flags[fi], ...updates };
        writeCollection("processing_results", all);
        return result.flags[fi];
      }
    }
    throw new Error("Flag not found");
  },
  async deleteFlag(flagId) {
    const all = readCollection<ProcessingResult>("processing_results");
    for (const result of all) {
      if (!result.flags) continue;
      const fi = result.flags.findIndex((f) => f.id === flagId);
      if (fi >= 0) {
        result.flags.splice(fi, 1);
        writeCollection("processing_results", all);
        return;
      }
    }
  },
  async listFlagsForDocument(documentId) {
    const result = readCollection<ProcessingResult>("processing_results").find((r) => r.documentId === documentId);
    return result?.flags ?? [];
  },
  async listFlagsForMatter(matterId, filters) {
    const docs = readCollection<Document>("documents").filter((d) => d.matterId === matterId);
    const docMap = new Map(docs.map((d) => [d.id, d.fileName]));
    const results = readCollection<ProcessingResult>("processing_results").filter((r) => docMap.has(r.documentId));
    let flags = results.flatMap((r) =>
      (r.flags ?? []).map((f) => ({ ...f, documentFileName: docMap.get(f.documentId) ?? "" }))
    );
    if (filters?.type) flags = flags.filter((f) => f.type === filters.type);
    if (filters?.resolved !== undefined) flags = flags.filter((f) => f.resolved === filters.resolved);
    return flags.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  // ── Workspace Threads ─────────────────────────────────────
  async getThread(id) {
    return readCollection<WorkspaceThread>("threads").find((t) => t.id === id) ?? null;
  },
  async listThreads(documentId) {
    return readCollection<WorkspaceThread>("threads").filter(
      (t) => t.documentId === documentId
    );
  },
  async saveThread(thread) {
    const all = readCollection<WorkspaceThread>("threads");
    const idx = all.findIndex((t) => t.id === thread.id);
    if (idx >= 0) all[idx] = thread;
    else all.push(thread);
    writeCollection("threads", all);
    return thread;
  },
  async appendMessage(threadId, message) {
    const all = readCollection<WorkspaceThread>("threads");
    const thread = all.find((t) => t.id === threadId);
    if (thread) {
      thread.messages.push(message);
      writeCollection("threads", all);
    }
  },

  // ── Drafts ───────────────────────────────────────────────

  /** Lazily infer matterId for legacy drafts that predate the matter-level workspace. */
  async getDraft(id) {
    const draft = readCollection<Draft>("drafts").find((d) => d.id === id);
    if (!draft) return null;
    if (!draft.matterId && draft.documentId) {
      const doc = readCollection<Document>("documents").find((d) => d.id === draft.documentId);
      if (doc) draft.matterId = doc.matterId;
    }
    return normalizeDraft(draft);
  },
  async listDrafts(documentId) {
    const drafts = readCollection<Draft>("drafts").filter((d) => d.documentId === documentId);
    const doc = readCollection<Document>("documents").find((d) => d.id === documentId);
    if (doc) {
      for (const draft of drafts) {
        if (!draft.matterId) draft.matterId = doc.matterId;
      }
    }
    return drafts.map(normalizeDraft);
  },
  async listDraftsForMatter(matterId) {
    const allDrafts = readCollection<Draft>("drafts");
    const docs = readCollection<Document>("documents").filter((d) => d.matterId === matterId);
    const docToMatter = new Map(docs.map((d) => [d.id, matterId]));

    return allDrafts.filter((d) => {
      if (d.matterId === matterId) return true;
      if (!d.matterId && d.documentId && docToMatter.has(d.documentId)) return true;
      return false;
    }).map((d) => {
      const migrated = (!d.matterId && d.documentId && docToMatter.has(d.documentId))
        ? { ...d, matterId }
        : d;
      return normalizeDraft(migrated);
    });
  },
  async listAllDrafts() {
    return readCollection<Draft>("drafts").map(normalizeDraft);
  },
  async saveDraft(draft) {
    const all = readCollection<Draft>("drafts");
    const idx = all.findIndex((d) => d.id === draft.id);
    if (idx >= 0) all[idx] = draft;
    else all.push(draft);
    writeCollection("drafts", all);
    return draft;
  },
  async updateDraft(id, content, snapshotLabel) {
    const all = readCollection<Draft>("drafts");
    const idx = all.findIndex((d) => d.id === id);
    if (idx < 0) throw new Error("Draft not found");
    // Snapshot the current content before overwriting
    const currentContent = all[idx].content;
    if (currentContent.trim()) {
      const version: DraftVersion = {
        id: crypto.randomUUID(),
        draftId: id,
        content: currentContent,
        label: snapshotLabel,
        createdAt: new Date().toISOString(),
      };
      const versions = readCollection<DraftVersion>("draft_versions");
      versions.push(version);
      writeCollection("draft_versions", versions);
    }
    all[idx].content = content;
    all[idx].updatedAt = new Date().toISOString();
    writeCollection("drafts", all);
    const versionCount = readCollection<DraftVersion>("draft_versions").filter((v) => v.draftId === id).length;
    return { draft: all[idx], versionCount };
  },

  async deleteDraft(draftId) {
    writeCollection("draft_versions", readCollection<DraftVersion>("draft_versions").filter((v) => v.draftId !== draftId));
    writeCollection("draft_assistant_conversations", readCollection<DraftAssistantConversation>("draft_assistant_conversations").filter((c) => c.draftId !== draftId));
    writeCollection("drafts", readCollection<Draft>("drafts").filter((d) => d.id !== draftId));
  },
  async renameDraft(draftId, title) {
    const all = readCollection<Draft>("drafts");
    const idx = all.findIndex((d) => d.id === draftId);
    if (idx < 0) throw new Error("Draft not found");
    all[idx].title = title;
    all[idx].updatedAt = new Date().toISOString();
    writeCollection("drafts", all);
    return normalizeDraft(all[idx]);
  },
  async setDraftStatus(draftId, status) {
    const all = readCollection<Draft>("drafts");
    const idx = all.findIndex((d) => d.id === draftId);
    if (idx < 0) throw new Error("Draft not found");
    all[idx].status = status;
    if (status === "final") {
      all[idx].finalizedAt = new Date().toISOString();
    } else {
      delete all[idx].finalizedAt;
    }
    all[idx].updatedAt = new Date().toISOString();
    writeCollection("drafts", all);
    return normalizeDraft(all[idx]);
  },

  // ── Draft Versions ────────────────────────────────────────
  async saveDraftVersion(version) {
    const all = readCollection<DraftVersion>("draft_versions");
    all.push(version);
    writeCollection("draft_versions", all);
    return version;
  },
  async listDraftVersions(draftId) {
    return readCollection<DraftVersion>("draft_versions")
      .filter((v) => v.draftId === draftId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getDraftVersion(id) {
    return readCollection<DraftVersion>("draft_versions").find((v) => v.id === id) ?? null;
  },

  // ── Activity ─────────────────────────────────────────────
  async listActivities(limit = 10) {
    const all = readCollection<Activity>("activities");
    return all.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, limit);
  },
  async saveActivity(activity) {
    const all = readCollection<Activity>("activities");
    all.push(activity);
    writeCollection("activities", all);
    return activity;
  },

  // ── Chat Conversations ────────────────────────────────────
  async createConversation(data) {
    const now = new Date().toISOString();
    const conversation: ChatConversation = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    const all = readCollection<ChatConversation>("chat_conversations");
    all.push(conversation);
    writeCollection("chat_conversations", all);
    return conversation;
  },
  async getConversation(conversationId) {
    return readCollection<ChatConversation>("chat_conversations").find((c) => c.id === conversationId) ?? null;
  },
  async listConversationsForMatter(matterId) {
    return readCollection<ChatConversation>("chat_conversations")
      .filter((c) => c.matterId === matterId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  },
  async appendChatMessage(conversationId, messageData) {
    const all = readCollection<ChatConversation>("chat_conversations");
    const idx = all.findIndex((c) => c.id === conversationId);
    if (idx < 0) throw new Error("Conversation not found");
    const message: ChatMessage = {
      ...messageData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    all[idx].messages.push(message);
    all[idx].updatedAt = new Date().toISOString();
    writeCollection("chat_conversations", all);
    return message;
  },
  async renameConversation(conversationId, name) {
    const all = readCollection<ChatConversation>("chat_conversations");
    const idx = all.findIndex((c) => c.id === conversationId);
    if (idx < 0) throw new Error("Conversation not found");
    all[idx].name = name;
    all[idx].updatedAt = new Date().toISOString();
    writeCollection("chat_conversations", all);
    return all[idx];
  },
  async deleteConversation(conversationId) {
    const all = readCollection<ChatConversation>("chat_conversations");
    const filtered = all.filter((c) => c.id !== conversationId);
    writeCollection("chat_conversations", filtered);
  },

  // ── Draft Assistant Conversations ─────────────────────────
  async getDraftAssistantConversation(draftId) {
    return readCollection<DraftAssistantConversation>("draft_assistant_conversations").find((c) => c.draftId === draftId) ?? null;
  },
  async saveDraftAssistantMessage(draftId, matterId, message) {
    const all = readCollection<DraftAssistantConversation>("draft_assistant_conversations");
    const now = new Date().toISOString();
    const idx = all.findIndex((c) => c.draftId === draftId);
    if (idx >= 0) {
      all[idx].messages.push(message);
      all[idx].updatedAt = now;
      writeCollection("draft_assistant_conversations", all);
      return all[idx];
    } else {
      const conv: DraftAssistantConversation = {
        id: crypto.randomUUID(),
        draftId,
        matterId,
        messages: [message],
        createdAt: now,
        updatedAt: now,
      };
      all.push(conv);
      writeCollection("draft_assistant_conversations", all);
      return conv;
    }
  },
  async clearDraftAssistantConversation(draftId) {
    writeCollection(
      "draft_assistant_conversations",
      readCollection<DraftAssistantConversation>("draft_assistant_conversations").filter((c) => c.draftId !== draftId)
    );
  },
};
