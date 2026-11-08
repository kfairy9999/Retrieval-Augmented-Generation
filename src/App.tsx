import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { TOP_K } from "../shared/models";
import { Composer } from "./components/Composer";
import { EmptyState } from "./components/EmptyState";
import { MessageList } from "./components/MessageList";
import { Sidebar } from "./components/Sidebar";
import { SourcePanel } from "./components/SourcePanel";
import { embedTexts, fetchHealth, historyFromMessages, rewriteQuery, streamAnswer, type Health } from "./lib/api";
import { chunksForPrompt, indexDocument } from "./lib/ingest";
import { resolveSearchQuery } from "./lib/resolveQuery";
import { vectorStore } from "./lib/rag";
import { DocStatus, type Message, type UploadedDocument } from "./types";

const ACCEPTED = new Set([".txt", ".md", ".markdown", ".json", ".pdf"]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const NOT_FOUND = "I looked through the selected documents and didn't find a passage that answers that. Try another question, or add a file that covers it.";

type KeyState = "checking" | "ready" | "missing" | "down";

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
  const cancelledRef = useRef(new Set<string>());

  useEffect(() => {
    void fetchHealth()
      .then((next) => {
        setHealth(next);
        setApiDown(false);
      })
      .catch(() => setApiDown(true));
  }, []);

  const keyState: KeyState = apiDown ? "down" : !health ? "checking" : health.hasKey ? "ready" : "missing";
  const focused = messages.find((message) => message.id === focusedId) ?? null;

  const handleUpload = async (files: FileList) => {
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

    const created: UploadedDocument[] = accepted.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type || "text/plain",
      size: file.size,
      status: DocStatus.UPLOADING,
      chunkCount: 0,
      progress: 0,
      uploadedAt: new Date(),
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

        const result = await indexDocument(
          text,
          docId,
          file.name,
          vectorStore,
          (pieces) => embedTexts(pieces, "document", file.name),
          () => cancelledRef.current.has(docId),
          (progress) => {
            setDocuments((prev) => prev.map((doc) => (
              doc.id === docId ? { ...doc, status: DocStatus.EMBEDDING, progress } : doc
            )));
          },
        );
        if (cancelledRef.current.has(docId)) continue;
        setDocuments((prev) => prev.map((doc) => (
          doc.id === docId
            ? { ...doc, status: DocStatus.INDEXED, chunkCount: result.chunkCount, progress: 1, truncated: result.truncated }
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
    vectorStore.removeDoc(id);
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
    setSelectedDocIds((prev) => prev.filter((docId) => docId !== id));
  };

  const handleSend = async () => {
    const question = input.trim();
    if (!question || isProcessing) return;

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
        () => rewriteQuery(question, prior),
      );
      const [queryEmbedding] = await embedTexts([searchQuery], "query");
      const sources = vectorStore.search(queryEmbedding, readyIds, TOP_K);
      if (sources.length === 0) {
        updateAssistant({ content: NOT_FOUND, status: "refused", searchQuery, sources: [] });
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
          documents={documents}
          selectedDocIds={selectedDocIds}
          notice={notice}
          onUpload={(files) => void handleUpload(files)}
          onToggleDoc={(id) => {
            setSelectedDocIds((prev) => (prev.includes(id) ? prev.filter((docId) => docId !== id) : [...prev, id]));
          }}
          onToggleAll={() => {
            setSelectedDocIds((prev) => (prev.length === documents.length ? [] : documents.map((doc) => doc.id)));
          }}
          onRemove={handleRemove}
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
                {indexedCount > 0
                  ? `Searching ${indexedCount} ${indexedCount === 1 ? "document" : "documents"}`
                  : "No documents selected yet"}
              </p>
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

        {messages.length === 0 ? <EmptyState onUpload={(files) => void handleUpload(files)} /> : (
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

function friendlyError(message: string): string {
  if (message.startsWith("The server is missing")) {
    return "I need a Gemini API key on the server before I can read this. Add it to the server's env file and restart. The key stays off this page.";
  }
  if (message.includes("rejected the server key")) {
    return "Gemini didn't accept the server key. Check the key in the server's env file, then try again.";
  }
  if (message.includes("rate limit") || message.includes("Too many requests")) {
    return "We've asked for a lot in a short time. Wait a moment, then try again.";
  }
  if (message.includes("no extractable text") || message.includes("No text")) {
    return "I couldn't find selectable text in that file. Scanned PDFs need OCR, which this app doesn't do.";
  }
  if (message.includes("Gemini API request failed") || message.includes("empty stream") || message.includes("returned an error")) {
    return "Gemini didn't answer that request. Nothing was saved on the server — please try again.";
  }
  return message;
}

function KeyPill({ state }: { state: KeyState }) {
  const styles: Record<KeyState, string> = {
    checking: "border-[#e4d8cc] bg-[#f6eee7] text-[#4e433c]",
    ready: "border-[#b7dcc6] bg-[#e7f6ee] text-[#145c38]",
    missing: "border-[#e7c7a4] bg-[#fff3e4] text-[#6b3418]",
    down: "border-[#f0c2c8] bg-[#fff1f3] text-[#7a1f36]",
  };
  const labels: Record<KeyState, string> = {
    checking: "Checking the server",
    ready: "Key is on the server",
    missing: "Add a server key",
    down: "Can't reach the server",
  };
  return (
    <span className={`inline-flex min-h-8 items-center rounded-full border px-3 text-sm font-medium ${styles[state]}`}>
      {labels[state]}
    </span>
  );
}
