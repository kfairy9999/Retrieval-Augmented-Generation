import { useRef } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Database,
  FileUp,
  Loader2,
  Square,
  SquareCheck,
  Trash2,
  X,
} from "lucide-react";
import { CHAT_MODEL, EMBEDDING_MODEL } from "../../shared/models";
import { DocStatus, type UploadedDocument } from "../types";

interface SidebarProps {
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

  return (
    <aside className="flex h-full w-80 flex-col border-r border-slate-800 bg-[#0c1222]">
      <div className="border-b border-slate-800 px-5 py-5">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
            <Database className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-sm font-semibold text-white">Knowledge Engine</h1>
            <p className="text-xs text-slate-400">Personal document RAG</p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-400"
          >
            <FileUp className="h-4 w-4" aria-hidden="true" />
            Upload documents
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500">PDF, Markdown, text, or JSON · 2 MB each</p>
          {documents.length > 0 && (
            <button
              type="button"
              onClick={onToggleAll}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
            >
              {allSelected ? <SquareCheck className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>

        {notice && (
          <div className="flex gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
            <p className="flex-1">{notice}</p>
            <button type="button" aria-label="Dismiss notice" onClick={onDismissNotice} className="text-amber-200">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Documents {selectedDocIds.length}/{documents.length}
          </h2>
          {documents.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-700 px-3 py-8 text-center text-sm text-slate-500">
              Nothing indexed yet.
            </div>
          )}
          <ul className="space-y-2">
            {documents.map((doc) => {
              const selected = selectedDocIds.includes(doc.id);
              return (
                <li
                  key={doc.id}
                  className={`rounded-xl border px-3 py-3 ${selected ? "border-indigo-400/40 bg-indigo-500/10" : "border-slate-800 bg-slate-900/40"}`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={`${selected ? "Deselect" : "Select"} ${doc.name}`}
                      onClick={() => onToggleDoc(doc.id)}
                      className="mt-0.5 text-slate-400"
                    >
                      {selected ? <SquareCheck className="h-4 w-4 text-indigo-300" /> : <Square className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-100" title={doc.name}>{doc.name}</p>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <StatusIcon status={doc.status} />
                        <span>{labelFor(doc)}</span>
                      </div>
                      {doc.error && <p className="mt-1 text-xs leading-5 text-rose-300">{doc.error}</p>}
                      {doc.status === DocStatus.INDEXED && (
                        <p className="mt-2 text-[11px] text-slate-500">
                          {(doc.size / 1024).toFixed(1)} KB · {doc.chunkCount} chunks
                          {doc.truncated ? " · first 80 only" : ""}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${doc.name}`}
                      onClick={() => onRemove(doc.id)}
                      className="text-slate-500 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-800 px-4 py-3 font-mono text-[11px] leading-5 text-slate-400">
        <p>embed {EMBEDDING_MODEL}</p>
        <p>answer {CHAT_MODEL}</p>
        <p>index lives in this tab</p>
      </div>
    </aside>
  );
}

function labelFor(doc: UploadedDocument): string {
  if (doc.status === DocStatus.EMBEDDING) return `Embedding ${Math.round(doc.progress * 100)}%`;
  if (doc.status === DocStatus.PROCESSING) return "Chunking";
  if (doc.status === DocStatus.UPLOADING) return "Reading";
  return doc.status.toLowerCase();
}

function StatusIcon({ status }: { status: UploadedDocument["status"] }) {
  if (status === DocStatus.INDEXED) return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === DocStatus.ERROR) return <AlertCircle className="h-3.5 w-3.5 text-rose-400" />;
  if (status === DocStatus.EMBEDDING || status === DocStatus.PROCESSING || status === DocStatus.UPLOADING) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-300" />;
  }
  return null;
}
