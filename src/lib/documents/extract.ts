import fs from "fs/promises";
import path from "path";

export async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case ".pdf":
      return extractPdf(filePath);
    case ".docx":
      return extractDocx(filePath);
    case ".txt":
    case ".md":
      return fs.readFile(filePath, "utf-8");
    default:
      throw new Error(`Unsupported file type: ${ext}`);
  }
}

async function extractPdf(filePath: string): Promise<string> {
  const mod = await import("pdf-parse");
  const parse = ((mod as Record<string, unknown>).default ?? mod) as unknown as
    (buf: Buffer) => Promise<{ text: string }>;
  const buffer = await fs.readFile(filePath);
  const result = await parse(buffer);
  return result.text;
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
