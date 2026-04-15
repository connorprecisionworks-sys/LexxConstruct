export type DocumentStatus = "uploading" | "processing" | "ready" | "error";

export interface UploadQueueItem {
  id: string;
  file: File;
  fileName: string;
  fileSize: number;
  matterId: string;
  status: "queued" | "uploading" | "extracting" | "analyzing" | "done" | "error" | "canceled";
  documentId?: string;
  error?: string;
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
}
export type ProcessingStage = "uploading" | "extracting" | "analyzing" | "done" | "error";
export type MatterStatus = "active" | "on_hold" | "closed";
export type FlagType = "contradiction" | "missing_info" | "follow_up" | "key_evidence" | "deadline";
export type { CaseType } from "@/lib/caseChecklists";

export interface CaseIntelligenceResult {
  caseOverview: string;
  unifiedTimeline: Array<{ date: string; description: string; source: string; significance: string }>;
  factConsistency: Array<{
    topic: string;
    documentA: { id: string; statement: string };
    documentB: { id: string; statement: string };
    severity: string;
    explanation?: string;
  }>;
  checklist: Array<{
    item: { id: string; label: string; description: string; required: boolean };
    status: "present" | "missing";
    matchedDocuments: string[];
  }>;
  disclaimer: string;
  builtAt: string;
}

export interface Matter {
  id: string;
  name: string;
  clientName: string;
  matterType: "construction" | "other";
  caseType?: import("@/lib/caseChecklists").CaseType; // defaults to "construction_general" on read
  firmId: string;
  status: MatterStatus;
  notes: string;
  representedParty?: string; // which party the attorney represents — anchors draft perspective
  pinned?: boolean;          // pinned matters float to the top of the table
  caseIntelligence?: CaseIntelligenceResult;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  matterId: string;
  fileName: string;
  fileType: "pdf" | "docx" | "txt";
  fileSize: number;
  storageKey: string;
  extractionMethod?: "text" | "ocr" | "mixed" | "failed";
  ocrConfidence?: number; // 0–100, only populated when OCR was used
  ocrQuality?: "low" | "high"; // present when OCR ran; low = confidence 60–75, high = >75
  status: DocumentStatus;
  processingStage?: ProcessingStage;
  documentKind?: "standard" | "deposition";
  notes: string;
  uploadedAt: string;
  processedAt?: string;
}

export interface DepositionAnalysis {
  witnessName: string;
  witnessRole: string;
  depositionDate: string;
  location?: string;
  attorneysPresent: Array<{ name: string; representing: string }>;
  courtReporter?: string;
  duration?: string;
  topics: string[];
  keyAdmissions: Array<{
    topic: string;
    admission: string;
    pageReference?: string;
    significance: "high" | "medium" | "low";
  }>;
  keyDenials: Array<{
    topic: string;
    denial: string;
    pageReference?: string;
  }>;
  exhibitsReferenced: Array<{
    exhibitNumber: string;
    description: string;
    pageReference?: string;
  }>;
  inconsistencies: Array<{
    topic: string;
    description: string;
    pages: string[];
  }>;
  objectionsSummary: {
    total: number;
    sustainedCount?: number;
    commonGrounds: string[];
  };
  summary: string;
  followUpQuestions: string[];
}

export interface KeyIssue { id: string; title: string; description: string; severity: "high" | "medium" | "low"; pageRef?: string; }
export interface ExtractedFact { id: string; fact: string; category: "party" | "date" | "amount" | "event" | "obligation" | "other"; pageRef?: string; confidence: "high" | "medium" | "low"; }
export interface TimelineEvent { id: string; date: string; description: string; significance: "critical" | "important" | "contextual"; }
export interface MissingInfo { id: string; description: string; importance: "required" | "helpful" | "optional"; }

export interface Flag {
  id: string;
  documentId: string;
  type: FlagType;
  source: "auto" | "manual";
  text: string;
  location?: string;
  createdAt: string;
  resolved: boolean;
  resolvedAt?: string;
}

export interface ProcessingResult {
  id: string;
  documentId: string;
  summary: string;
  keyIssues: KeyIssue[];
  extractedFacts: ExtractedFact[];
  timeline: TimelineEvent[];
  missingInformation: MissingInfo[];
  flags: Flag[];
  disclaimer: string;
  processedAt: string;
  depositionAnalysis?: DepositionAnalysis;
}

export interface WorkspaceMessage { id: string; role: "user" | "assistant"; content: string; actionType?: WorkspaceActionType; createdAt: string; }
export type WorkspaceActionType =
  | "ask"
  | "draft_claim_letter"
  | "draft_summary"
  | "draft_mediation_brief"
  | "draft_deposition_outline"
  | "draft_delay_narrative"
  | "draft_defect_summary"
  | "draft_motion"
  | "draft_client_update"
  | "refine"
  | "deposition_summary_memo"
  | "cross_examination_outline"
  | "witness_prep_outline";
export interface WorkspaceThread { id: string; documentId: string; title: string; messages: WorkspaceMessage[]; createdAt: string; }

export interface Draft {
  id: string;
  documentId: string | null; // null for matter-level drafts (no specific source document)
  matterId?: string;         // set on all new drafts; lazily inferred for legacy records
  threadId?: string;
  title: string;
  content: string;
  contentFormat?: "html";
  draftType: WorkspaceActionType;
  disclaimer: string;
  status: "draft" | "final";
  finalizedAt?: string;      // ISO timestamp, set when status transitions to "final"
  createdAt: string;
  updatedAt: string;
}

export interface DraftVersion {
  id: string;
  draftId: string;
  content: string;
  label?: string;
  createdAt: string;
}

export interface User { id: string; email: string; fullName: string; firmId: string; role: "admin" | "attorney" | "paralegal"; }
export interface Firm { id: string; name: string; plan: "trial" | "pro" | "enterprise"; }

export interface Activity {
  id: string;
  action: "matter_created" | "document_uploaded" | "document_processed" | "draft_generated" | "note_added" | "flag_added" | "case_intelligence_built" | "chat_message_sent" | "matter_deleted" | "draft_deleted" | "draft_finalized" | "draft_assist_applied";
  entityName: string;
  matterId: string;
  timestamp: string;
  meta?: Record<string, string>;
}

export interface Citation {
  id: string;              // e.g., "cite:1"
  documentId: string;
  documentName: string;
  excerpt: string;
  location?: string;
}

export type ChatAction = { label: string } & (
  | { type: "draft_claim_letter"; matterId: string; prefill?: string }
  | { type: "draft_mediation_brief"; matterId: string; prefill?: string }
  | { type: "draft_motion_outline"; matterId: string; prefill?: string }
  | { type: "draft_demand_letter"; matterId: string; prefill?: string }
  | { type: "draft_case_summary"; matterId: string; prefill?: string }
  | { type: "draft_client_update"; matterId: string; prefill?: string }
  | { type: "draft_delay_narrative"; matterId: string; prefill?: string }
  | { type: "draft_defect_summary"; matterId: string; prefill?: string }
  | { type: "draft_deposition_outline"; matterId: string; documentId: string; prefill?: string }
  | { type: "open_draft"; matterId: string; draftId: string }
  | { type: "open_document"; matterId: string; documentId: string }
  | { type: "open_workspace"; matterId: string }
  | { type: "open_matter"; matterId: string }
);

/** @deprecated Use ChatAction */
export interface SuggestedAction {
  label: string;
  actionType: "generate_draft" | "view_document" | "view_flag";
  params: Record<string, string>;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations?: Citation[];
  suggestedActions?: ChatAction[];
  createdAt: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

export interface SuggestedEdit {
  id: string;
  type: "add_paragraph" | "rewrite_paragraph" | "add_citation";
  description: string;
  proposedText: string;
}

export interface DraftAssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  suggestedEdits?: SuggestedEdit[];
}

export interface DraftAssistantConversation {
  id: string;
  draftId: string;
  matterId: string;
  messages: DraftAssistantMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatConversation {
  id: string;
  matterId: string;
  name: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}
