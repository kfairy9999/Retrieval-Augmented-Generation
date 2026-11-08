import { useRef } from "react";
import { FileUp, MessagesSquare, TextSearch } from "lucide-react";

const steps = [
  {
    icon: FileUp,
    title: "Add a document",
    body: "A PDF, a markdown note, or a plain text file is enough to begin.",
  },
  {
    icon: TextSearch,
    title: "Give it a moment",
    body: "The passages stay in this tab and become searchable once indexing finishes.",
  },
  {
    icon: MessagesSquare,
    title: "Ask in your own words",
    body: "The reply points back at the passages, so you can check the source.",
  },
];

interface EmptyStateProps {
  onUpload: (files: FileList) => void;
}

export function EmptyState({ onUpload }: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-8">
      <div className="mx-auto my-auto w-full max-w-3xl">
      <p className="text-sm font-medium text-[#8c3a24]">Your reading desk</p>
      <h2 className="font-serif mt-2 max-w-xl text-4xl leading-tight text-[#2a211c] sm:text-5xl">
        Start with one document you already trust.
      </h2>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#4e433c]">
        Upload something you want to ask questions about. I’ll answer from those pages and keep the matching passages beside the reply.
      </p>
      <div className="mt-6">
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
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#8c3a24] px-5 text-sm font-semibold text-white transition hover:bg-[#732f1d]"
        >
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Add your first document
        </button>
        <p className="mt-2 text-sm text-[#4e433c]">PDF, Markdown, text, or JSON. Up to 2 MB each.</p>
      </div>
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-3xl border border-[#eadfd4] bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-[#8c3a24]">
              <step.icon className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-semibold">Step {index + 1}</span>
            </div>
            <p className="font-serif mt-3 text-lg text-[#2a211c]">{step.title}</p>
            <p className="mt-1 text-sm leading-6 text-[#4e433c]">{step.body}</p>
          </li>
        ))}
      </ol>
      </div>
    </div>
  );
}
