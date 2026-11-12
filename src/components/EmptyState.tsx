import { useRef } from "react";
import { BookOpenText, FileUp, MessagesSquare, TextSearch } from "lucide-react";

function stepsFor(persisted: boolean) {
  return [
    {
      icon: FileUp,
      title: "Add a document",
      body: "A PDF, a markdown note, or a plain text file is enough to begin.",
    },
    {
      icon: TextSearch,
      title: "Give it a moment",
      body: persisted
        ? "Passages are saved in this browser and become searchable once indexing finishes."
        : "Passages stay in this tab and become searchable once indexing finishes.",
    },
    {
      icon: MessagesSquare,
      title: "Ask in your own words",
      body: "The reply points back at the passages, so you can check the source.",
    },
  ];
}

interface EmptyStateProps {
  onUpload: (files: FileList) => void;
  onTrySample?: () => void;
  sampleReady?: boolean;
  sampleQuestions?: string[];
  onAsk?: (question: string) => void;
  libraryReady?: boolean;
  persisted?: boolean;
  savedCount?: number;
}

export function EmptyState({
  onUpload,
  onTrySample,
  sampleReady = false,
  sampleQuestions = [],
  onAsk,
  libraryReady = true,
  persisted = true,
  savedCount = 0,
}: EmptyStateProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-6 sm:px-8">
      <div className="mx-auto my-auto w-full max-w-3xl">
      <p className="text-sm font-semibold text-[#8c3a24]">Welcome</p>
      <h2 className="font-serif mt-2 max-w-xl text-4xl leading-tight text-[#2a211c] sm:text-5xl">
        What do you want to ask your documents?
      </h2>
      <p className="mt-4 max-w-xl text-base leading-7 text-[#4e433c]">
        {welcomeCopy(libraryReady, persisted, savedCount, sampleReady)}
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
          disabled={!libraryReady}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#8c3a24] px-5 text-sm font-semibold text-white transition hover:bg-[#732f1d] disabled:opacity-70"
        >
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Add your first document
        </button>
        {onTrySample && (
          <button
            type="button"
            onClick={onTrySample}
            disabled={!libraryReady || sampleReady}
            className="ml-0 mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#d9c3b2] bg-white px-5 text-sm font-semibold text-[#6b2e1c] transition hover:bg-[#fbf3ec] disabled:opacity-70 sm:ml-3 sm:mt-0"
          >
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
            {sampleReady ? "Sample document is loaded" : "Try the sample document"}
          </button>
        )}
        <p className="mt-2 text-sm text-[#4e433c]">PDF, Markdown, text, or JSON. Up to 2 MB each. The sample is a short note about how this app works.</p>
      </div>
      {sampleReady && onAsk && sampleQuestions.length > 0 && (
        <div className="mt-6">
          <p className="text-sm font-semibold text-[#2a211c]">Ask the sample something</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sampleQuestions.map((question) => (
              <button
                key={question}
                type="button"
                onClick={() => onAsk(question)}
                className="min-h-11 rounded-full border border-[#e4d8cc] bg-[#f6eee7] px-4 text-left text-sm font-medium text-[#2a211c] transition hover:bg-[#efe2d6]"
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}
      <ol className="mt-8 grid gap-4 sm:grid-cols-3">
        {stepsFor(persisted).map((step, index) => (
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

function welcomeCopy(libraryReady: boolean, persisted: boolean, savedCount: number, sampleReady: boolean): string {
  if (!libraryReady) return "Opening documents saved in this browser.";
  if (sampleReady && savedCount === 1) {
    return "The sample document is still in this browser. It is a short demo about this app, not your own files. Ask one of the questions below, or add a file of your own.";
  }
  if (savedCount > 0) return "Your documents are still in this browser. Ask a question whenever you’re ready.";
  if (persisted) {
    return "Add a file you already trust. I’ll keep the passages in this browser, including after a refresh, and show them beside the answer.";
  }
  return "Add a file you already trust. I’ll keep the passages in this tab until you close it, and show them beside the answer.";
}
