import type { NextApiRequest, NextApiResponse } from "next";
import { db } from "@/lib/db";
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { id } = req.query;
  if (typeof id !== "string") return res.status(400).json({ error: "Invalid id" });

  const format = (req.query.format as string) || "docx";

  if (format === "pdf") {
    return res.status(400).json({ error: "PDF export is not yet available. Please use Word export." });
  }

  if (format !== "docx") {
    return res.status(400).json({ error: "Unsupported format. Use docx." });
  }

  const draft = await db.getDraft(id);
  if (!draft) return res.status(404).json({ error: "Draft not found" });

  const doc = await db.getDocument(draft.documentId);
  const docName = doc?.fileName || "Document";
  const date = new Date(draft.createdAt).toLocaleDateString();

  const docx = new DocxDocument({
    sections: [{
      properties: {},
      children: [
        new Paragraph({
          children: [new TextRun({ text: "LEXX — Construction Litigation Intelligence", bold: true, size: 28, font: "Arial" })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Document: ${docName}`, size: 22, font: "Arial", color: "666666" })],
          spacing: { after: 100 },
        }),
        new Paragraph({
          children: [new TextRun({ text: `Draft Type: ${draft.title}  |  Date: ${date}`, size: 20, font: "Arial", color: "666666" })],
          spacing: { after: 400 },
        }),
        ...draft.content.split("\n").map(
          (line) => new Paragraph({
            children: [new TextRun({ text: line, size: 22, font: "Arial" })],
            spacing: { after: 120 },
          })
        ),
        new Paragraph({
          children: [new TextRun({ text: "", size: 22 })],
          spacing: { before: 400 },
        }),
        new Paragraph({
          heading: HeadingLevel.HEADING_3,
          children: [new TextRun({ text: "Disclaimer", bold: true, size: 20, font: "Arial", color: "999999" })],
        }),
        new Paragraph({
          children: [new TextRun({ text: draft.disclaimer, italics: true, size: 18, font: "Arial", color: "999999" })],
        }),
      ],
    }],
  });

  const buffer = await Packer.toBuffer(docx);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="Lexx-${draft.title.replace(/\s+/g, "-")}-${date}.docx"`);
  return res.send(buffer);
}
