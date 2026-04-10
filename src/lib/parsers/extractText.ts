export function chunkText(text: string, maxChars = 12000): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    current += (current ? "\n\n" : "") + para;
  }
  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export async function extractText(buffer: Buffer, fileType: "pdf" | "docx" | "txt"): Promise<string> {
  switch (fileType) {
    case "pdf": {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text;
    }
    case "docx": {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
    case "txt": return buffer.toString("utf-8");
    default: throw new Error(`Unsupported file type: ${fileType}`);
  }
}
