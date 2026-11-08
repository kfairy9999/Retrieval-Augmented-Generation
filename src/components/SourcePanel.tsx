import { useEffect } from "react";
import { X } from "lucide-react";
import type { Message } from "../types";

interface SourcePanelProps {
  message: Message | null;
  activeIndex: number | null;
  open: boolean;
  onClose: () => void;
}

export function SourcePanel({ message, activeIndex, open, onClose }: SourcePanelProps) {
  useEffect(() => {
    if (!message || activeIndex == null) return;
    document.getElementById(`passage-${message.id}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [message, activeIndex]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close retrieved context"
          className="fixed inset-0 z-30 bg-black/60 xl:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(100%,22rem)] flex-col border-l border-slate-800 bg-[#0c1222] transition-transform xl:static xl:translate-x-0 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Retrieved context</h2>
            <p className="text-[11px] text-slate-500">Cosine similarity, not a confidence score</p>
          </div>
          <button type="button" className="text-slate-400 xl:hidden" aria-label="Close context panel" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!message?.sources?.length && (
            <p className="text-sm leading-6 text-slate-500">
              Passages used for an answer show up here, with the cosine score from the in-browser index.
            </p>
          )}
          {message?.searchQuery && message.question && message.searchQuery !== message.question && (
            <p className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-xs leading-5 text-slate-400">
              Follow-up searched as <span className="text-slate-200">{message.searchQuery}</span>
            </p>
          )}
          {message?.sources?.map((source, index) => {
            const number = index + 1;
            const active = activeIndex === number;
            return (
              <article
                key={source.id}
                id={`passage-${message.id}-${number}`}
                className={`rounded-xl border p-3 ${active ? "border-indigo-400 bg-indigo-500/10" : "border-slate-800 bg-slate-900/50"}`}
              >
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-semibold text-indigo-200">{number}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-300" title={source.metadata.source}>{source.metadata.source}</span>
                  <span className="font-mono text-[11px] text-slate-400">{source.score.toFixed(2)}</span>
                </div>
                {source.metadata.page && (
                  <p className="mt-1 text-[11px] text-slate-500">Page {source.metadata.page}</p>
                )}
                <p className="mt-2 text-xs leading-5 text-slate-400">{source.content}</p>
              </article>
            );
          })}
        </div>
      </aside>
    </>
  );
}
