/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageList } from "../src/components/MessageList";
import { SourcePanel } from "../src/components/SourcePanel";
import type { Message } from "../src/types";

const message: Message = {
  id: "m1",
  role: "model",
  content: "Plants store energy [1].",
  timestamp: new Date("2026-11-08T12:00:00Z"),
  status: "done",
  question: "How do plants store energy?",
  searchQuery: "photosynthesis chemical energy storage",
  sources: [{
    id: "c1",
    docId: "d1",
    content: "Photosynthesis converts sunlight into chemical energy.",
    metadata: { source: "plants.md", start: 0, end: 52 },
    score: 0.82,
  }],
};

describe("answer citations", () => {
  it("turns a passage marker into a button and shows the cosine score", () => {
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    const onCite = vi.fn();
    render(
      <>
        <MessageList messages={[message]} onCite={onCite} onShowContext={() => undefined} />
        <SourcePanel message={message} activeIndex={null} open onClose={() => undefined} />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Passage 1" }));
    expect(onCite).toHaveBeenCalledWith("m1", 1);
    expect(screen.getByText("0.82")).toBeTruthy();
    expect(screen.getByText(/Photosynthesis converts sunlight/)).toBeTruthy();
    expect(screen.getByText(/photosynthesis chemical energy storage/)).toBeTruthy();
  });
});
