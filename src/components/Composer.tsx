import { Send } from "lucide-react";

interface ComposerProps {
  value: string;
  disabled: boolean;
  hasConversation: boolean;
  hint: string | null;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

export function Composer({ value, disabled, hasConversation, hint, onChange, onSubmit }: ComposerProps) {
  return (
    <form
      className="border-t border-[#eadfd4] bg-[#fffdfb]/90 px-4 py-4 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <label className="sr-only" htmlFor="question">Question</label>
        <textarea
          id="question"
          rows={2}
          value={value}
          disabled={disabled}
          placeholder={hasConversation ? "Ask a follow-up…" : "Ask something these documents might know…"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="min-h-16 flex-1 resize-none rounded-3xl border border-[#e4d8cc] bg-white px-4 py-3 text-base text-[#2a211c] outline-none placeholder:text-[#5c514a] focus:border-[#8c3a24] disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send question"
          className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-[#8c3a24] text-white transition hover:bg-[#732f1d] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-sm text-[#4e433c]" role={hint ? "status" : undefined}>
        {hint ?? "Enter sends. Shift+Enter starts a new line. Please check the passages — I can still miss something."}
      </p>
    </form>
  );
}
