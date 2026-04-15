/**
 * LEXX — Storage Adapter Interface
 *
 * ALL data access goes through this interface.
 * V1: JsonAdapter (local files)
 * V2: swap to PostgresAdapter, SupabaseAdapter, PrismaAdapter — nothing else changes.
 *
 * Rule: Never import from json.ts or any concrete adapter directly in app code.
 * Always import { db } from "@/lib/db"
 */

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

export interface StorageAdapter {
  // Matters
  getMatter(id: string): Promise<Matter | null>;
  listMatters(): Promise<Matter[]>;
  saveMatter(matter: Matter): Promise<Matter>;
  updateMatterStatus(id: string, status: MatterStatus): Promise<void>;
  updateMatterNotes(id: string, notes: string): Promise<void>;
  deleteMatter(matterId: string): Promise<void>;

  // Documents
  getDocument(id: string): Promise<Document | null>;
  listDocuments(matterId: string): Promise<Document[]>;
  listAllDocuments(): Promise<Document[]>;
  saveDocument(doc: Document): Promise<Document>;
  updateDocumentStatus(id: string, status: Document["status"]): Promise<void>;
  updateDocumentStage(id: string, stage: ProcessingStage): Promise<void>;
  updateDocumentNotes(id: string, notes: string): Promise<void>;

  // Processing Results
  getProcessingResult(documentId: string): Promise<ProcessingResult | null>;
  saveProcessingResult(result: ProcessingResult): Promise<ProcessingResult>;

  // Flags
  addFlag(documentId: string, flag: Omit<Flag, "id" | "createdAt">): Promise<Flag>;
  updateFlag(flagId: string, updates: Partial<Pick<Flag, "resolved" | "resolvedAt" | "text" | "type">>): Promise<Flag>;
  deleteFlag(flagId: string): Promise<void>;
  listFlagsForDocument(documentId: string): Promise<Flag[]>;
  listFlagsForMatter(matterId: string, filters?: { type?: FlagType; resolved?: boolean }): Promise<(Flag & { documentFileName: string })[]>;

  // Workspace
  getThread(id: string): Promise<WorkspaceThread | null>;
  listThreads(documentId: string): Promise<WorkspaceThread[]>;
  saveThread(thread: WorkspaceThread): Promise<WorkspaceThread>;
  appendMessage(threadId: string, message: WorkspaceMessage): Promise<void>;

  // Drafts
  getDraft(id: string): Promise<Draft | null>;
  listDrafts(documentId: string): Promise<Draft[]>;
  listDraftsForMatter(matterId: string): Promise<Draft[]>;
  listAllDrafts(): Promise<Draft[]>;
  saveDraft(draft: Draft): Promise<Draft>;
  updateDraft(id: string, content: string, snapshotLabel?: string): Promise<{ draft: Draft; versionCount: number }>;
  deleteDraft(draftId: string): Promise<void>;
  renameDraft(draftId: string, title: string): Promise<Draft>;
  setDraftStatus(draftId: string, status: "draft" | "final"): Promise<Draft>;

  // Draft Versions
  saveDraftVersion(version: DraftVersion): Promise<DraftVersion>;
  listDraftVersions(draftId: string): Promise<DraftVersion[]>;
  getDraftVersion(id: string): Promise<DraftVersion | null>;

  // Activity
  listActivities(limit?: number): Promise<Activity[]>;
  saveActivity(activity: Activity): Promise<Activity>;

  // Chat Conversations
  createConversation(conversation: Omit<ChatConversation, "id" | "createdAt" | "updatedAt">): Promise<ChatConversation>;
  getConversation(conversationId: string): Promise<ChatConversation | null>;
  listConversationsForMatter(matterId: string): Promise<ChatConversation[]>;
  appendChatMessage(conversationId: string, message: Omit<ChatMessage, "id" | "createdAt">): Promise<ChatMessage>;
  renameConversation(conversationId: string, name: string): Promise<ChatConversation>;
  deleteConversation(conversationId: string): Promise<void>;

  // Draft Assistant Conversations
  getDraftAssistantConversation(draftId: string): Promise<DraftAssistantConversation | null>;
  saveDraftAssistantMessage(draftId: string, matterId: string, message: DraftAssistantMessage): Promise<DraftAssistantConversation>;
  clearDraftAssistantConversation(draftId: string): Promise<void>;
}
