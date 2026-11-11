import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

interface TextPiece {
  str?: string;
}

export async function extractTextFromPDF(file: File): Promise<string> {
  const pdfjs = await getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdfjs.numPages; pageNumber++) {
    const page = await pdfjs.getPage(pageNumber);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((item) => {
        const piece = item as TextPiece;
        return typeof piece.str === "string" ? piece.str : "";
      })
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (pageText) pages.push(`--- Page ${pageNumber} ---\n${pageText}`);
  }

  if (pages.length === 0) {
    throw new Error("This PDF has no extractable text. Scanned pages need OCR, which this app does not run.");
  }
  return pages.join("\n\n");
}
