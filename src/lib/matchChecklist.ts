import type { ChecklistItem } from "./caseChecklists";
import type { ProcessingResult } from "@/types";

export interface ChecklistMatchResult {
  item: ChecklistItem;
  status: "present" | "missing";
  matchedDocuments: string[]; // document IDs that matched
}

export function matchChecklist(
  checklist: ChecklistItem[],
  documents: Array<{ id: string; fileName: string; result?: ProcessingResult }>
): ChecklistMatchResult[] {
  return checklist.map((item) => {
    const matchedDocuments: string[] = [];

    for (const doc of documents) {
      const searchText = [
        doc.fileName,
        doc.result?.summary ?? "",
        doc.result?.extractedFacts.map((f) => f.fact).join(" ") ?? "",
      ]
        .join(" ")
        .toLowerCase();

      const matched = item.keywords.some((kw) => searchText.includes(kw.toLowerCase()));
      if (matched) matchedDocuments.push(doc.id);
    }

    return {
      item,
      status: matchedDocuments.length > 0 ? "present" : "missing",
      matchedDocuments,
    };
  });
}
