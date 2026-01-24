/**
 * Extracts raw text from a PDF file.
 * Uses global window.pdfjsLib loaded via script tag in index.html for stability.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  try {
    const pdfjsLib = (window as any).pdfjsLib;
    
    if (!pdfjsLib) {
        throw new Error("PDF.js library not loaded. Please refresh the page.");
    }

    // Configure Worker (Idempotent check)
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    
    // Load the document
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    
    // Iterate over all pages
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
        
      if (pageText.trim()) {
          fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }
    }
    
    if (!fullText.trim()) {
        throw new Error("PDF appears to be empty or scanned (images only). OCR is not supported in this client-side demo.");
    }
    
    return fullText;
  } catch (error: any) {
    console.error("Error parsing PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error.message || 'Unknown error'}`);
  }
};