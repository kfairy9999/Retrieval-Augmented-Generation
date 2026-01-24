import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { SearchResult } from "../types";

// Initialize Gemini Client
const apiKey = process.env.API_KEY || ''; // In a real app, handle missing key gracefully
const ai = new GoogleGenAI({ apiKey });

// Configuration for models
const CHAT_MODEL = "gemini-3-flash-preview";
const EMBEDDING_MODEL = "text-embedding-004";

/**
 * Generates vector embeddings for a given text.
 */
export const generateEmbedding = async (text: string): Promise<number[]> => {
  try {
    const result = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
    });
    
    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error("No embeddings returned from API");
    }
    
    // Check if values exist
    const values = result.embeddings[0].values;
    if (!values) {
        throw new Error("Embedding values are missing");
    }

    return values;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
};

/**
 * Generates a response using RAG (Retrieval Augmented Generation).
 */
export const generateRAGResponse = async (
  query: string, 
  contextChunks: SearchResult[]
): Promise<{ text: string }> => {
  
  // 1. Construct the context block
  const contextText = contextChunks.map(chunk => 
    `Source (${chunk.metadata.source}):\n"${chunk.content}"`
  ).join("\n\n");

  // 2. Construct the system instruction for RAG
  const systemInstruction = `You are a precise and helpful Personal Knowledge Assistant. 
  Your task is to answer the user's question using ONLY the provided Context information.
  
  Rules:
  1. If the answer is found in the Context, answer clearly and concisely.
  2. If the answer is NOT found in the Context, do NOT hallucinate information. Instead, politely reply: "I couldn't find specific information on that topic in the provided documents. Would you like me to try a broader search or do you have other documents I can check?"
  3. You may synthesize information from multiple sources within the context.
  4. Use Markdown for formatting.`;

  // 3. Create the prompt
  const prompt = `
  Context Information:
  ---------------------
  ${contextText}
  ---------------------

  User Question: 
  ${query}
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: CHAT_MODEL,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.3, // Lower temperature for more factual responses
      }
    });

    return { text: response.text || "No response generated." };
  } catch (error) {
    console.error("Error generating content:", error);
    return { text: "I encountered an error while communicating with the AI." };
  }
};