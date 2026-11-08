import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, User } from "lucide-react";
import { citationIndexFromHref, linkCitations } from "../../shared/citations";
import type { Message } from "../types";

interface MessageListProps {
  messages: Message[];
  onCite: (messageId: string, index: number) => void;
  onShowContext: (messageId: string) => void;
}

export function MessageList({ messages, onCite, onShowContext }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-8">
      {messages.map((message) => (
        <article key={message.id} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          {message.role === "model" && (
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white">
              <Bot className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className={`max-w-[42rem] ${message.role === "user" ? "items-end" : ""}`}>
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                message.role === "user"
                  ? "bg-slate-700 text-white"
                  : message.status === "error"
                    ? "border border-rose-400/30 bg-rose-950/40 text-rose-50"
                    : message.status === "refused"
                      ? "border border-amber-400/30 bg-amber-950/30 text-amber-50"
                      : "border border-slate-800 bg-slate-900 text-slate-100"
              }`}
            >
              {message.status === "retrieving" && (
                <p className="text-slate-400" role="status">Retrieving passages…</p>
              )}
              {message.status === "writing" && message.content.length === 0 && (
                <p className="text-slate-400" role="status">Writing from the retrieved passages…</p>
              )}
              {message.content && message.role === "model" && (
                <div className="prose prose-invert prose-sm max-w-none prose-p:my-2 prose-headings:mb-2 prose-headings:mt-3">
                  <ReactMarkdown
                    components={{
                      a: ({ href, children }) => {
                        const index = citationIndexFromHref(href);
                        if (index) {
                          return (
                            <button
                              type="button"
                              aria-label={`Passage ${index}`}
                              onClick={() => onCite(message.id, index)}
                              className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-indigo-400/15 px-1 align-baseline text-[11px] font-semibold text-indigo-200 hover:bg-indigo-400/25"
                            >
                              {children}
                            </button>
                          );
                        }
                        return (
                          <a href={href} target="_blank" rel="noreferrer" className="text-indigo-300 underline">
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {linkCitations(message.content, message.sources?.length ?? 0)}
                  </ReactMarkdown>
                  {message.status === "writing" && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-300 align-middle" />}
                </div>
              )}
              {message.role === "user" && <p className="whitespace-pre-wrap">{message.content}</p>}
              {message.error && <p className="mt-2 text-xs text-rose-200">{message.error}</p>}
            </div>
            {message.role === "model" && message.sources && message.sources.length > 0 && (
              <button
                type="button"
                onClick={() => onShowContext(message.id)}
                className="mt-2 text-xs font-medium text-slate-400 hover:text-indigo-200"
              >
                View {message.sources.length} retrieved {message.sources.length === 1 ? "passage" : "passages"}
              </button>
            )}
            <time className={`mt-1 block text-[10px] text-slate-500 ${message.role === "user" ? "text-right" : "text-left"}`} dateTime={message.timestamp.toISOString()}>
              {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
          </div>
          {message.role === "user" && (
            <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-700 text-slate-200">
              <User className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </article>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
