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
          className="fixed inset-0 z-30 bg-[#2a211c]/40 xl:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-0 right-0 z-40 flex w-[min(100%,22rem)] flex-col border-l border-[#eadfd4] bg-[#fffdfb] shadow-2xl transition-transform duration-300 ease-out xl:static xl:translate-x-0 xl:shadow-none ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#eadfd4] px-5 py-5">
          <div>
            <h2 className="font-serif text-xl text-[#2a211c]">Where this came from</h2>
            <p className="mt-1 text-sm leading-6 text-[#4e433c]">Cosine similarity, not a confidence score</p>
          </div>
          <button type="button" className="min-h-11 min-w-11 text-[#4e433c] xl:hidden" aria-label="Close context panel" onClick={onClose}>
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {!message?.sources?.length && (
            <p className="px-1 text-sm leading-7 text-[#4e433c]">
              After you ask a question, the passages I used will sit here so you can read them yourself.
            </p>
          )}
          {message?.searchQuery && message.question && message.searchQuery !== message.question && (
            <p className="rounded-2xl bg-[#f6eee7] px-3 py-3 text-sm leading-6 text-[#4e433c]">
              I searched for <span className="font-semibold text-[#2a211c]">{message.searchQuery}</span>
            </p>
          )}
          {message?.sources?.map((source, index) => {
            const number = index + 1;
            const active = activeIndex === number;
            return (
              <article
                key={source.id}
                id={`passage-${message.id}-${number}`}
                className={`rounded-3xl border p-4 transition ${active ? "border-[#8c3a24] bg-[#fbf3ec]" : "border-[#eadfd4] bg-white"}`}
              >
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded-full bg-[#f6e7dc] px-2 py-0.5 font-semibold text-[#6b2e1c]">{number}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-[#2a211c]" title={source.metadata.source}>{source.metadata.source}</span>
                  <span className="font-mono text-sm text-[#4e433c]">{source.score.toFixed(2)}</span>
                </div>
                {source.metadata.page && (
                  <p className="mt-2 text-sm text-[#4e433c]">Page {source.metadata.page}</p>
                )}
                <p className="mt-2 text-sm leading-6 text-[#4e433c]">{source.content}</p>
              </article>
            );
          })}
        </div>
      </aside>
    </>
  );
}
