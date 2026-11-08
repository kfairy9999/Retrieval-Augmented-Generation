import { FileUp, MessagesSquare, TextSearch } from "lucide-react";

const steps = [
  {
    icon: FileUp,
    title: "Upload sources",
    body: "PDF, Markdown, text, or JSON. Text is extracted in the browser.",
  },
  {
    icon: TextSearch,
    title: "Index the passages",
    body: "Chunks are embedded with Gemini and kept in this tab.",
  },
  {
    icon: MessagesSquare,
    title: "Ask, then follow up",
    body: "Answers cite the retrieved passages. Scores stay visible.",
  },
];

export function EmptyState() {
  return (
    <div className="mx-auto flex h-full max-w-2xl flex-col justify-center px-6 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Retrieval-augmented generation</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Ask questions against documents you actually uploaded.</h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
        The index stays in this browser tab. Only the query, the top passages, and a short conversation window are sent to Gemini.
      </p>
      <ol className="mt-8 grid gap-3 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center gap-2 text-indigo-300">
              <step.icon className="h-4 w-4" aria-hidden="true" />
              <span className="font-mono text-[11px]">0{index + 1}</span>
            </div>
            <p className="mt-3 text-sm font-medium text-slate-100">{step.title}</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">{step.body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
