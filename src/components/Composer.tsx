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
      className="border-t border-slate-800 px-4 py-4 sm:px-6"
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
          placeholder={hasConversation ? "Ask a follow-up…" : "Ask a question about the selected documents…"}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSubmit();
            }
          }}
          className="min-h-14 flex-1 resize-none rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-indigo-400 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label="Send question"
          className="mb-1 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500 text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-slate-500">
        {hint ?? "Enter to send. Shift+Enter for a new line. Answers can still be wrong — check the passages."}
      </p>
    </form>
  );
}
