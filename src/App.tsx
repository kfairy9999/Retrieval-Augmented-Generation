import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { TOP_K } from "../shared/models";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import { SourcePanel } from "./components/SourcePanel";
import { embedTexts, fetchHealth, historyFromMessages, rewriteQuery, streamAnswer, type Health } from "./lib/api";
import { documentStore, toUploadedDocument, type StorageMode } from "./lib/documentStore";
import { chunksForPrompt, indexDocument } from "./lib/ingest";
import { keywordVectors, tokenize } from "./lib/keyword";
import { VectorStore } from "./lib/rag";
import { resolveSearchQuery } from "./lib/resolveQuery";
import sampleText from "./samples/how-this-app-works.md?raw";
import { DocStatus, type Message, type UploadedDocument } from "./types";

const ACCEPTED = new Set([".txt", ".md", ".markdown", ".json", ".pdf"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const SAMPLE_NAME = "how-this-app-works.md";
export const SAMPLE_QUESTIONS = [
  "Where do the API keys live?",
  "How are documents split into passages?",
  "What does this demo not do?",
];
const NOT_FOUND = "I looked through the selected documents and didn't find a passage that answers that. Try another question, or add a file that covers it.";

type KeyState = "checking" | "ready" | "missing" | "missing-chat" | "missing-embed" | "down";

export default function App() {
  const [documents, setDocuments] = useState<UploadedDocument[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] = useState<number | null>(null);
  const [libraryReady, setLibraryReady] = useState(false);
  const [storageMode, setStorageMode] = useState<StorageMode | "loading">("loading");
  const [storageNotice, setStorageNotice] = useState<string | null>(null);
  const [canClearDevice, setCanClearDevice] = useState(false);
  const cancelledRef = useRef(new Set<string>());
  const libraryEpoch = useRef(0);

  useEffect(() => {
    void fetchHealth()
      .then((next) => {
        setHealth(next);
        setApiDown(false);
      })
      .catch(() => setApiDown(true));
  }, []);

  useEffect(() => {
    let cancelled = false;
    void documentStore.open().then((snapshot) => {
      if (cancelled) return;
      const restored = snapshot.documents.map(toUploadedDocument);
      setDocuments(restored);
      setSelectedDocIds(restored.map((doc) => doc.id));
      setStorageMode(snapshot.mode);
      setStorageNotice(snapshot.notice);
      setCanClearDevice(documentStore.hasDeviceDatabase);
      setLibraryReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSidebarOpen(false);
      setContextOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const keyState: KeyState = keyStateFrom(health, apiDown);
  // Without an embedding key the app still works, using keyword vectors computed in this tab.
  const keywordMode = health !== null && !health.hasEmbeddingKey;
  const passagesOnly = health !== null && !health.hasChatKey;
  const embedDocuments = (pieces: string[], title: string) =>
    keywordMode ? Promise.resolve(keywordVectors(pieces)) : embedTexts(pieces, "document", title);
  const embedQuery = (text: string) => (keywordMode ? Promise.resolve(keywordVectors([text])) : embedTexts([text], "query"));
  const focused = messages.find((message) => message.id === focusedId) ?? null;

  const handleUpload = async (files: FileList | File[], options?: { demo?: boolean }) => {
    if (!libraryReady) return;
    const incoming = Array.from(files);
    if (incoming.length > 10) {
      setNotice("Let's keep it to 10 files at a time.");
      return;
    }

    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of incoming) {
      const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
      if (!ACCEPTED.has(extension)) {
        rejected.push(`${file.name} isn't a PDF, Markdown, text, or JSON file, so I left it out.`);
        continue;
      }
      if (file.size === 0) {
        rejected.push(`${file.name} is empty, so there's nothing to read.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        rejected.push(`${file.name} is over 2 MB. A shorter file will be easier to index.`);
        continue;
      }
      accepted.push(file);
    }
    setNotice(rejected.length > 0 ? rejected.join(" ") : null);

    const epoch = libraryEpoch.current;
    const markDemo = options?.demo === true;
    const created: UploadedDocument[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || "text/plain",
      size: file.size,
      status: DocStatus.UPLOADING,
      chunkCount: 0,
      progress: 0,
      uploadedAt: new Date(),
      demo: markDemo && file.name === SAMPLE_NAME,
    }));
    setDocuments((prev) => [...prev, ...created]);
    setSelectedDocIds((prev) => [...prev, ...created.map((doc) => doc.id)]);

    for (const [index, file] of accepted.entries()) {
      const docId = created[index].id;
      try {
        const extension = file.name.toLowerCase();
        const text = extension.endsWith(".pdf")
          ? await import("./lib/pdf").then((pdf) => pdf.extractTextFromPDF(file))
          : await file.text();
        if (cancelledRef.current.has(docId)) continue;
        setDocuments((prev) => prev.map((doc) => (doc.id === docId ? { ...doc, status: DocStatus.PROCESSING } : doc)));

        const scratch = new VectorStore();
        const result = await indexDocument(
          text,
          docId,
          file.name,
          scratch,
          (pieces) => embedDocuments(pieces, file.name),
          () => cancelledRef.current.has(docId) || libraryEpoch.current !== epoch,
          (progress) => {
            setDocuments((prev) => prev.map((doc) => (
              doc.id === docId ? { ...doc, status: DocStatus.EMBEDDING, progress } : doc
            )));
          },
        );
        if (cancelledRef.current.has(docId) || libraryEpoch.current !== epoch) continue;
        const saved = await documentStore.put(
          {
            id: docId,
            name: file.name,
            type: file.type || "text/plain",
            size: file.size,
            createdAt: created[index]?.uploadedAt.getTime() ?? Date.now(),
            chunkCount: result.chunkCount,
            capHit: result.truncated,
            demo: markDemo && file.name === SAMPLE_NAME,
          },
          scratch.chunksFor(docId),
        );
        if (cancelledRef.current.has(docId) || libraryEpoch.current !== epoch) {
          await documentStore.delete(docId);
          continue;
        }
        if (saved.notice) setStorageNotice(saved.notice);
        setStorageMode(documentStore.storageMode);
        setCanClearDevice(documentStore.hasDeviceDatabase);
        setDocuments((prev) => prev.map((doc) => (
          doc.id === docId
            ? {
                ...doc,
                status: DocStatus.INDEXED,
                chunkCount: result.chunkCount,
                progress: 1,
                truncated: result.truncated,
                stored: saved.persisted,
              }
            : doc
        )));
      } catch (error) {
        if (cancelledRef.current.has(docId)) continue;
        const message = error instanceof Error ? friendlyError(error.message) : "I couldn't finish indexing this file.";
        setDocuments((prev) => prev.map((doc) => (
          doc.id === docId ? { ...doc, status: DocStatus.ERROR, error: message } : doc
        )));
      }
    }
  };

  const handleRemove = (id: string) => {
    cancelledRef.current.add(id);
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setSelectedDocIds((prev) => prev.filter((docId) => docId !== id));
    void documentStore.delete(id).then((result) => {
      if (result.notice) setStorageNotice(result.notice);
    });
  };

  const handleClear = () => {
    libraryEpoch.current += 1;
    for (const doc of documents) cancelledRef.current.add(doc.id);
    setDocuments([]);
    setSelectedDocIds([]);
    setMessages([]);
    setFocusedId(null);
    setActiveCitation(null);
    setInput("");
    void documentStore.clear().then((result) => {
      if (result.notice) setStorageNotice(result.notice);
    });
  };

  const loadSample = () => {
    if (!libraryReady || documents.some((doc) => doc.name === SAMPLE_NAME)) return;
    void handleUpload([new File([sampleText], SAMPLE_NAME, { type: "text/markdown" })], { demo: true });
  };

  const handleSend = async (preset?: string) => {
    const question = (preset ?? input).trim();
    if (!question || isProcessing) return;
    if (!libraryReady) {
      setHint("Still opening documents saved in this browser.");
      return;
    }

    const readyIds = selectedDocIds.filter((id) => (
      documents.some((doc) => doc.id === id && doc.status === DocStatus.INDEXED)
    ));
    if (readyIds.length === 0) {
      setHint("Choose a document that has finished indexing, then ask again.");
      return;
    }

    const prior = historyFromMessages(messages);
    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };
    const assistantId = crypto.randomUUID();
    const placeholder: Message = {
      id: assistantId,
      role: "model",
      content: "",
      timestamp: new Date(),
      status: "retrieving",
      question,
    };

    setMessages((prev) => [...prev, userMessage, placeholder]);
    setInput("");
    setHint(null);
    setIsProcessing(true);
    setFocusedId(assistantId);
    setActiveCitation(null);

    const updateAssistant = (patch: Partial<Message>) => {
      setMessages((prev) => prev.map((message) => (message.id === assistantId ? { ...message, ...patch } : message)));
    };

    try {
      const searchQuery = await resolveSearchQuery(
        question,
        prior.length > 0,
        () => (passagesOnly ? Promise.resolve(question) : rewriteQuery(question, prior)),
      );
      const [queryEmbedding] = await embedQuery(searchQuery);
      const ranked = documentStore.search(queryEmbedding, readyIds, TOP_K);
      // A keyword score of 0 means the passage shares no words with the question.
      const sources = keywordMode ? ranked.filter((source) => source.score > 0) : ranked;
      if (sources.length === 0) {
        updateAssistant({ content: NOT_FOUND, status: "refused", searchQuery, sources: [] });
        return;
      }

      if (passagesOnly) {
        updateAssistant({ content: passagesOnlyReply(sources, question), status: "done", searchQuery, sources });
        return;
      }

      updateAssistant({ sources, searchQuery, status: "writing" });
      let answer = "";
      await streamAnswer(
        { question, history: prior, chunks: chunksForPrompt(sources) },
        (delta) => {
          answer += delta;
          updateAssistant({ content: answer, status: "writing" });
        },
      );
      updateAssistant({
        content: answer.trim() || "I didn't get any words back. Please try the question again.",
        status: "done",
      });
    } catch (error) {
      const message = error instanceof Error ? friendlyError(error.message) : "Something went wrong with that question.";
      setMessages((prev) => prev.map((item) => (
        item.id === assistantId
          ? {
              ...item,
              status: "error",
              error: message,
              content: item.content || "I had to stop before the answer was finished.",
            }
          : item
      )));
    } finally {
      setIsProcessing(false);
    }
  };

  const indexedCount = documents.filter((doc) => doc.status === DocStatus.INDEXED && selectedDocIds.includes(doc.id)).length;

  return (
    <div className="flex h-dvh overflow-hidden text-[#2a211c]">
      <a
        href="#question"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-[#8c3a24] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to the question
      </a>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close documents"
          className="fixed inset-0 z-30 bg-[#2a211c]/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className={`fixed inset-y-0 left-0 z-40 transition-transform duration-300 ease-out md:static md:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Sidebar
          keywordMode={keywordMode}
          passagesOnly={passagesOnly}
          documents={documents}
          selectedDocIds={selectedDocIds}
          notice={notice}
          libraryReady={libraryReady}
          storageMode={storageMode}
          storageNotice={storageNotice}
          canClearDevice={canClearDevice}
          onUpload={(files) => void handleUpload(files)}
          onToggleDoc={(id) => {
            setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]));
          }}
          onToggleAll={() => {
            setSelectedDocIds((prev) => (prev.length === documents.length ? [] : documents.map((doc) => doc.id)));
          }}
          onRemove={handleRemove}
          onClear={handleClear}
          onDismissNotice={() => setNotice(null)}
        />
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eadfd4] bg-[#fffdfb]/80 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[#2a211c] md:hidden"
              aria-label={sidebarOpen ? "Close documents" : "Open documents"}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="min-w-0">
              <p className="font-serif truncate text-lg text-[#2a211c]">Personal Knowledge Engine</p>
              <p className="text-sm text-[#4e433c]">
                {libraryReady
                  ? indexedCount > 0
                    ? `Searching ${indexedCount} ${indexedCount === 1 ? "document" : "documents"}`
                    : "No documents selected yet"
                  : "Opening saved documents"}
              </p>
              <p className="text-sm text-[#4e433c]">{storageLine(storageMode)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <KeyPill state={keyState} />
            <button
              type="button"
              className="min-h-11 rounded-full border border-[#e4d8cc] bg-white px-3 text-sm font-medium text-[#2a211c] xl:hidden"
              onClick={() => setContextOpen(true)}
            >
              Sources
            </button>
          </div>
        </header>

        {(keywordMode || passagesOnly) && <DemoBanner keywordMode={keywordMode} passagesOnly={passagesOnly} />}
        {storageNotice && (
          <div role="status" className="border-b border-[#ead3b0] bg-[#fff8ee] px-4 py-2.5 text-sm leading-6 text-[#5a2c14] sm:px-6">
            {storageNotice}
          </div>
        )}
        {messages.length === 0 ? (
          <EmptyState
            onUpload={(files) => void handleUpload(files)}
            onTrySample={loadSample}
            sampleReady={documents.some((doc) => doc.name === SAMPLE_NAME && doc.status === DocStatus.INDEXED)}
            sampleQuestions={SAMPLE_QUESTIONS}
            onAsk={(question) => void handleSend(question)}
            libraryReady={libraryReady}
            persisted={storageMode === "indexeddb"}
            savedCount={documents.filter((doc) => doc.status === DocStatus.INDEXED).length}
          />
        ) : (
          <MessageList
            messages={messages}
            onCite={(messageId, index) => {
              setFocusedId(messageId);
              setActiveCitation(index);
              setContextOpen(true);
            }}
            onShowContext={(messageId) => {
              setFocusedId(messageId);
              setActiveCitation(null);
              setContextOpen(true);
            }}
          />
        )}
        <Composer
          value={input}
          disabled={isProcessing}
          hasConversation={messages.length > 0}
          hint={hint}
          onChange={(value) => {
            setInput(value);
            if (hint) setHint(null);
          }}
          onSubmit={() => void handleSend()}
        />
      </div>

      <SourcePanel
        message={focused}
        activeIndex={activeCitation}
        open={contextOpen}
        onClose={() => setContextOpen(false)}
      />
    </div>
  );
}

/** The sentence in a passage that shares the most words with the question. */
export function bestSentence(content: string, question: string): string {
  const wanted = new Set(tokenize(question));
  const sentences = content
    .replace(/^#+\s*/gm, "")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.replace(/\s+/g, " ").trim())
    .filter((sentence) => sentence.length > 30 && /[.!?]["')]?$/.test(sentence));
  let best = sentences[0] ?? content.trim();
  let bestScore = -1;
  for (const sentence of sentences) {
    const score = new Set(tokenize(sentence).filter((token) => wanted.has(token))).size;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  return best.length > 180 ? `${best.slice(0, 177).trimEnd()}…` : best;
}

function passagesOnlyReply(sources: { content: string; metadata: { source: string; page?: number } }[], question: string): string {
  const lines = sources.map((source, index) => {
    const where = source.metadata.page ? `${source.metadata.source}, page ${source.metadata.page}` : source.metadata.source;
    return `${index + 1}. [${index + 1}] *${where}*: "${bestSentence(source.content, question)}"`;
  });
  return [
    "**Retrieval ran, but no answer was written.** This public demo has no Grok key yet, so instead of a generated answer here are the passages an answer would be grounded in, best match first:",
    "",
    ...lines,
    "",
    "Tap a number to read the full passage.",
  ].join("\n");
}

function DemoBanner({ keywordMode, passagesOnly }: { keywordMode: boolean; passagesOnly: boolean }) {
  const parts = [
    keywordMode ? "keyword search in your browser" : null,
    passagesOnly ? "matching passages instead of written answers" : null,
  ].filter(Boolean);
  return (
    <div role="status" className="border-b border-[#ead3b0] bg-[#fff8ee] px-4 py-2.5 text-sm leading-6 text-[#5a2c14] sm:px-6">
      <span className="font-semibold">Demo mode:</span> {parts.join(" and ")}, until API keys are added on the server.
    </div>
  );
}

function storageLine(mode: StorageMode | "loading"): string {
  if (mode === "loading") return "Checking this browser";
  if (mode === "indexeddb") return "Saved in this browser, kept after a refresh";
  return "Not saved on this device, this tab only";
}

function keyStateFrom(health: Health | null, apiDown: boolean): KeyState {
  if (apiDown) return "down";
  if (!health) return "checking";
  if (health.hasEmbeddingKey && health.hasChatKey) return "ready";
  if (!health.hasEmbeddingKey && !health.hasChatKey) return "missing";
  if (!health.hasChatKey) return "missing-chat";
  return "missing-embed";
}

function friendlyError(message: string): string {
  if (message.startsWith("The server is missing the Grok")) {
    return "I need a Grok API key on the server before I can answer. Add it to the server's env file and restart. The key stays off this page.";
  }
  if (message.startsWith("The server is missing")) {
    return "I need a Gemini API key on the server before I can read this. Add it to the server's env file and restart. The key stays off this page.";
  }
  if (message.includes("rejected the server key")) {
    return message.includes("Grok")
      ? "Grok didn't accept the server key. Check the key in the server's env file, then try again."
      : "Gemini didn't accept the server key. Check the key in the server's env file, then try again.";
  }
  if (message.includes("rate limit") || message.includes("Too many requests")) {
    return "We've asked for a lot in a short time. Wait a moment, then try again.";
  }
  if (message.includes("no extractable text") || message.includes("No text")) {
    return "I couldn't find selectable text in that file. Scanned PDFs need OCR, which this app doesn't do.";
  }
  if (message.includes("API request failed") || message.includes("empty stream") || message.includes("returned an error")) {
    return "The model didn't answer that request. Nothing was saved on the server — please try again.";
  }
  return message;
}

function KeyPill({ state }: { state: KeyState }) {
  const styles: Record<KeyState, string> = {
    checking: "border-[#e4d8cc] bg-[#f6eee7] text-[#4e433c]",
    ready: "border-[#b7dcc6] bg-[#e7f6ee] text-[#145c38]",
    missing: "border-[#e7c7a4] bg-[#fff3e4] text-[#6b3418]",
    "missing-chat": "border-[#e7c7a4] bg-[#fff3e4] text-[#6b3418]",
    "missing-embed": "border-[#e7c7a4] bg-[#fff3e4] text-[#6b3418]",
    down: "border-[#f0c2c8] bg-[#fff1f3] text-[#7a1f36]",
  };
  const labels: Record<KeyState, string> = {
    checking: "Checking the server",
    ready: "Keys are on the server",
    missing: "Demo mode",
    "missing-chat": "Demo mode: passages only",
    "missing-embed": "Demo mode: keyword search",
    down: "Can't reach the server",
  };
  return (
    <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-medium ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}
