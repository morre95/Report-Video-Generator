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
  const { getPath } = await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  PDFParse.setWorker(getPath());

  const buffer = await fs.readFile(filePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(filePath: string): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await fs.readFile(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
