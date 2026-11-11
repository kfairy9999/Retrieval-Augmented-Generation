import { useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Library,
  Loader2,
  Square,
  SquareCheck,
  Trash2,
  X,
} from "lucide-react";
import { CHAT_MODEL, EMBEDDING_MODEL } from "../../shared/models";
import { DocStatus, type UploadedDocument } from "../types";

interface SidebarProps {
  keywordMode?: boolean;
  passagesOnly?: boolean;
  documents: UploadedDocument[];
  selectedDocIds: string[];
  notice: string | null;
  onUpload: (files: FileList) => void;
  onToggleDoc: (id: string) => void;
  onToggleAll: () => void;
  onRemove: (id: string) => void;
  onDismissNotice: () => void;
}

export function Sidebar({
  keywordMode = false,
  passagesOnly = false,
  documents,
  selectedDocIds,
  notice,
  onUpload,
  onToggleDoc,
  onToggleAll,
  onRemove,
  onDismissNotice,
}: SidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const allSelected = documents.length > 0 && selectedDocIds.length === documents.length;
  const ready = documents.filter((doc) => doc.status === DocStatus.INDEXED).map((doc) => doc.name);

  return (
    <aside className="flex h-full w-[min(100vw,20.5rem)] flex-col border-r border-[#eadfd4] bg-[#fffdfb] shadow-xl md:shadow-none">
      <div className="border-b border-[#eadfd4] px-5 py-5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f6e7dc] text-[#8c3a24]">
            <Library className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-serif text-xl leading-none text-[#2a211c]">Your library</h1>
            <p className="mt-1 text-sm text-[#4e433c]">Kept in this browser tab</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-5">
        <div>
          <input
            ref={inputRef}
            type="file"
            className="sr-only"
            multiple
            accept=".txt,.md,.markdown,.json,.pdf,text/plain,text/markdown,application/json,application/pdf"
            onChange={(event) => {
              if (event.target.files && event.target.files.length > 0) onUpload(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[#8c3a24] px-3 text-sm font-semibold text-white transition hover:bg-[#732f1d]"
          >
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Add a document
          </button>
          <p className="mt-2 text-center text-sm text-[#4e433c]">PDF, Markdown, text, or JSON · 2 MB</p>
          {documents.length > 0 && (
            <button
              type="button"
              onClick={onToggleAll}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-2 text-sm font-medium text-[#4e433c] hover:bg-[#f6eee7]"
            >
              {allSelected ? <SquareCheck className="h-4 w-4" /> : <Square className="h-4 w-4" />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>

        {notice && (
          <div className="flex gap-2 rounded-2xl border border-[#e7c7a4] bg-[#fff6ea] px-3 py-3 text-sm leading-6 text-[#5c3b16]">
            <p className="flex-1">{notice}</p>
            <button type="button" aria-label="Dismiss notice" onClick={onDismissNotice} className="mt-0.5 min-h-11 min-w-11 text-[#5c3b16]">
              <X className="mx-auto h-4 w-4" />
            </button>
          </div>
        )}

        <div>
          <h2 className="mb-3 text-sm font-semibold text-[#4e433c]">
            Documents · {selectedDocIds.length} of {documents.length} selected
          </h2>
          <p className="sr-only" aria-live="polite">
            {ready.length > 0 ? `${ready.join(", ")} ${ready.length === 1 ? "is" : "are"} ready to search.` : ""}
          </p>
          {documents.length === 0 && (
            <div className="rounded-3xl border border-dashed border-[#ddcfc2] px-4 py-8 text-center text-sm leading-6 text-[#4e433c]">
              Nothing here yet. Add a file when you’re ready.
            </div>
          )}
          <ul className="space-y-3">
            {documents.map((doc) => {
              const selected = selectedDocIds.includes(doc.id);
              return (
                <li
                  key={doc.id}
                  className={`rounded-3xl border px-3 py-3 transition ${
                    doc.status === DocStatus.INDEXED ? "doc-ready" : ""
                  } ${selected ? "border-[#e7cbb8] bg-[#fbf3ec]" : "border-[#eadfd4] bg-white"}`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${selected ? "Deselect" : "Select"} ${doc.name}`}
                      onClick={() => onToggleDoc(doc.id)}
                      className="mt-0.5 min-h-11 min-w-11 text-[#5c514a]"
                    >
                      {selected ? <SquareCheck className="mx-auto h-5 w-5 text-[#8c3a24]" /> : <Square className="mx-auto h-5 w-5" />}
                    </button>
                    <div className="min-w-0 flex-1 py-2">
                      <p className="truncate text-sm font-semibold text-[#2a211c]" title={doc.name}>{doc.name}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-sm text-[#4e433c]">
                        <StatusIcon status={doc.status} />
                        <span>{labelFor(doc)}</span>
                      </div>
                      {(doc.status === DocStatus.EMBEDDING || doc.status === DocStatus.PROCESSING || doc.status === DocStatus.UPLOADING) && (
                        <div
                          className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f0e4d8]"
                          role="progressbar"
                          aria-valuenow={Math.round(doc.progress * 100)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`Indexing ${doc.name}`}
                        >
                          <div
                            className="h-full rounded-full bg-[#8c3a24] transition-[width] duration-300 motion-reduce:transition-none"
                            style={{ width: `${doc.status === DocStatus.EMBEDDING ? Math.max(8, Math.round(doc.progress * 100)) : 18}%` }}
                          />
                        </div>
                      )}
                      {doc.error && <p className="mt-2 text-sm leading-6 text-[#7a1f36]">{doc.error}</p>}
                      {doc.status === DocStatus.INDEXED && (
                        <p className="mt-2 text-sm text-[#4e433c]">
                          {(doc.size / 1024).toFixed(1)} KB · {doc.chunkCount} passages
                          {doc.truncated ? " · first 80 only" : ""}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${doc.name}`}
                      onClick={() => onRemove(doc.id)}
                      className="min-h-11 min-w-11 text-[#5c514a] hover:text-[#7a1f36]"
                    >
                      <Trash2 className="mx-auto h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="border-t border-[#eadfd4] px-5 py-4 text-sm leading-6 text-[#4e433c]">
        <p>Search · {keywordMode ? "keyword match (demo)" : EMBEDDING_MODEL}</p>
        <p>Answers · {passagesOnly ? "passages only (demo)" : CHAT_MODEL}</p>
      </div>
    </aside>
  );
}

function labelFor(doc: UploadedDocument): string {
  if (doc.status === DocStatus.EMBEDDING) return `Reading the meaning · ${Math.round(doc.progress * 100)}%`;
  if (doc.status === DocStatus.PROCESSING) return "Splitting into passages";
  if (doc.status === DocStatus.UPLOADING) return "Opening the file";
  if (doc.status === DocStatus.INDEXED) return "Ready to search";
  return "Needs another try";
}

function StatusIcon({ status }: { status: UploadedDocument["status"] }) {
  if (status === DocStatus.INDEXED) return <CheckCircle2 className="h-4 w-4 text-[#1b5e3b]" aria-hidden="true" />;
  if (status === DocStatus.ERROR) return <AlertCircle className="h-4 w-4 text-[#7a1f36]" aria-hidden="true" />;
  if (status === DocStatus.EMBEDDING || status === DocStatus.PROCESSING || status === DocStatus.UPLOADING) {
    return <Loader2 className="h-4 w-4 animate-spin text-[#8c3a24]" aria-hidden="true" />;
  }
  return null;
}
