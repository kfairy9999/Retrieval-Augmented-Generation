import { DocumentChunk, UploadedDocument, SearchResult } from "../types";
import { generateEmbedding } from "./gemini";

// --- Constants ---
const CHUNK_SIZE = 800;  // Characters approx.
const CHUNK_OVERLAP = 150; // Overlap to maintain context

// --- Vector Store (In-Memory for Demo) ---
// In a production backend, this would be Pinecone / Milvus / Weaviate
let VECTOR_STORE: DocumentChunk[] = [];

/**
 * Recursive Character Text Splitter Simulation
 * Splits text by separators to keep paragraphs/sentences together.
 */
export const splitText = (text: string, docId: string, sourceName: string): DocumentChunk[] => {
  const chunks: DocumentChunk[] = [];
  const separators = ["\n\n", "\n", ". ", " ", ""];
  
  let start = 0;
  
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    
    // If not at the end of text, try to find the best separator to break at
    if (end < text.length) {
      let foundSeparator = false;
      for (const sep of separators) {
        const lastIndex = text.lastIndexOf(sep, end);
        // Only accept separator if it's reasonably close to the chunk limit (e.g., within last 40%)
        if (lastIndex > start + (CHUNK_SIZE * 0.6)) {
          end = lastIndex + sep.length;
          foundSeparator = true;
          break;
        }
      }
    }

    const chunkContent = text.slice(start, end).trim();
    if (chunkContent.length > 0) {
      chunks.push({
        id: crypto.randomUUID(),
        docId,
        content: chunkContent,
        metadata: {
          source: sourceName,
          start,
          end
        }
      });
    }

    // Check if we reached the end
    if (end >= text.length) {
        break;
    }

    // Move forward, subtracting overlap
    // CRITICAL FIX: Ensure we move strictly forward to avoid infinite loops with short texts/overlaps
    const prevStart = start;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
    
    // If overlap logic pushed us back behind where we started (unlikely with max above, but safely), fix it.
    if (start <= prevStart) {
        start = prevStart + 1;
    }
  }

  return chunks;
};

/**
 * Adds document chunks to the vector store after generating embeddings.
 */
export const ingestDocument = async (doc: UploadedDocument, onProgress: (progress: number) => void): Promise<void> => {
  // 1. Split Text
  const chunks = splitText(doc.content, doc.id, doc.name);
  
  // 2. Generate Embeddings (Batch processing simulated)
  const total = chunks.length;
  let processed = 0;

  for (const chunk of chunks) {
    try {
      // Small delay to avoid hitting rate limits in this client-side demo
      await new Promise(r => setTimeout(r, 100)); 
      chunk.embedding = await generateEmbedding(chunk.content);
      
      // Store in memory
      VECTOR_STORE.push(chunk);
      
      processed++;
      onProgress(processed / total);
    } catch (e) {
      console.error(`Failed to embed chunk in ${doc.name}`, e);
    }
  }
};

/**
 * Cosine Similarity calculation
 */
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Retrieves the most relevant chunks for a query.
 * @param query The user query
 * @param filterDocIds Array of document IDs to search within. If empty, search returns no results.
 * @param topK Number of results to return
 */
export const retrieveDocuments = async (query: string, filterDocIds: string[], topK: number = 4): Promise<SearchResult[]> => {
  if (VECTOR_STORE.length === 0 || filterDocIds.length === 0) return [];

  // 1. Embed Query
  const queryEmbedding = await generateEmbedding(query);

  // 2. Filter Store based on selected documents
  const filteredStore = VECTOR_STORE.filter(chunk => filterDocIds.includes(chunk.docId));

  // 3. Calculate Similarity for filtered chunks
  const scoredChunks: SearchResult[] = filteredStore.map(chunk => {
    if (!chunk.embedding) return { ...chunk, score: 0 };
    return {
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding)
    };
  });

  // 4. Sort and Slice
  return scoredChunks
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
};

export const clearVectorStore = () => {
  VECTOR_STORE = [];
};