import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { BookOpen, User } from "lucide-react";
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
    <div className="flex-1 space-y-7 overflow-y-auto px-4 py-6 sm:px-8">
      {messages.map((message) => (
        <article key={message.id} className={`rise-in flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
          {message.role === "model" && (
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#f6e7dc] text-[#8c3a24]">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
          <div className="max-w-[42rem]">
            <div
              className={`rounded-3xl px-4 py-3.5 text-base leading-7 ${
                message.role === "user"
                  ? "bg-[#8c3a24] text-white"
                  : message.status === "error"
                    ? "border border-[#f0c9cf] bg-[#fff5f6] text-[#2a211c]"
                    : message.status === "refused"
                      ? "border border-[#ead3b0] bg-[#fff8ee] text-[#2a211c]"
                      : "border border-[#eadfd4] bg-white text-[#2a211c] shadow-sm"
              } ${message.status === "done" ? "answer-done" : ""}`}
            >
              {message.status === "retrieving" && (
                <p className="text-[#4e433c]" role="status">Looking through your documents…</p>
              )}
              {message.status === "writing" && message.content.length === 0 && (
                <p className="text-[#4e433c]" role="status">Writing from the passages I found…</p>
              )}
              {message.content && message.role === "model" && (
                <div className="prose prose-stone prose-sm max-w-none prose-p:my-2 prose-headings:font-serif prose-headings:text-[#2a211c]">
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
                              className="mx-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[#f6e7dc] px-1.5 align-baseline text-xs font-semibold text-[#6b2e1c] hover:bg-[#efd3c2]"
                            >
                              {children}
                            </button>
                          );
                        }
                        return (
                          <a href={href} target="_blank" rel="noreferrer" className="text-[#8c3a24] underline">
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {linkCitations(message.content, message.sources?.length ?? 0)}
                  </ReactMarkdown>
                  {message.status === "writing" && (
                    <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[#8c3a24] align-middle" />
                  )}
                </div>
              )}
              {message.role === "user" && <p className="whitespace-pre-wrap">{message.content}</p>}
              {message.error && <p className="mt-2 text-sm leading-6 text-[#7a1f36]">{message.error}</p>}
              {message.status === "done" && (
                <p className="mt-3 text-sm font-medium text-[#145c38]" role="status">Ready to check the passages.</p>
              )}
            </div>
            {message.role === "model" && message.sources && message.sources.length > 0 && (
              <button
                type="button"
                onClick={() => onShowContext(message.id)}
                className="mt-2 min-h-11 text-sm font-medium text-[#6b2e1c] underline-offset-2 hover:underline"
              >
                Show {message.sources.length} {message.sources.length === 1 ? "passage" : "passages"} I used
              </button>
            )}
            <time
              className={`mt-1 block text-xs text-[#5c514a] ${message.role === "user" ? "text-right" : "text-left"}`}
              dateTime={message.timestamp.toISOString()}
            >
              {message.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </time>
          </div>
          {message.role === "user" && (
            <span className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#efe4da] text-[#4e433c]">
              <User className="h-4 w-4" aria-hidden="true" />
            </span>
          )}
        </article>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
