/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { Sidebar } from "../src/components/Sidebar";
import { DEVICE_LIBRARY_NOTE, STORAGE_QUOTA_NOTE, documentStore } from "../src/lib/documentStore";
import { DB_NAME, indexedDbDatabase } from "../src/lib/indexedDb";
import { DocStatus, type UploadedDocument } from "../src/types";

describe("library persistence in the page", () => {
  beforeEach(async () => {
    installBlobText();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
    documentStore.close();
    await deleteDatabase();
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (String(url).includes("/api/health")) {
        return {
          ok: true,
          json: async () => ({
            ok: true,
            hasEmbeddingKey: false,
            hasChatKey: false,
            chatModel: "grok-4.7",
            embeddingModel: "gemini-embedding-2",
          }),
        };
      }
      throw new Error(`unexpected fetch ${String(url)}`);
    }));
  });

  afterEach(async () => {
    cleanup();
    documentStore.close();
    vi.unstubAllGlobals();
    await deleteDatabase();
  });

  it("shows an empty library and says documents stay on this device", async () => {
    render(<App />);
    expect(await screen.findByText("Saved in this browser, kept after a refresh")).toBeTruthy();
    expect(screen.getByText(DEVICE_LIBRARY_NOTE)).toBeTruthy();
    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.getByText(/including after a refresh/)).toBeTruthy();
  });

  it("restores an uploaded document after the page is opened again and can clear it", async () => {
    const first = render(<App />);
    await ready();
    upload("plants.md", "Photosynthesis stores energy in leaves.");
    expect(await screen.findByText("Ready to search")).toBeTruthy();

    first.unmount();
    documentStore.close();
    render(<App />);
    expect(await screen.findByText("plants.md")).toBeTruthy();
    expect(screen.getByText(/still in this browser/)).toBeTruthy();
    expect(screen.getByText("Ready to search")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Clear documents on this device" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove them" }));
    expect(screen.queryByText("plants.md")).toBeNull();
    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
    await waitFor(async () => {
      const probe = await indexedDbDatabase(indexedDB, DB_NAME);
      const rows = await probe.read();
      probe.close();
      expect(rows.documents).toEqual([]);
    });

    documentStore.close();
    cleanup();
    render(<App />);
    expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.queryByText("plants.md")).toBeNull();
  });

  it("keeps the sample labeled as a demo and searchable after reload", async () => {
    const first = render(<App />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Try the sample document" }));
    expect(await screen.findByRole("button", { name: "Sample document is loaded" })).toBeTruthy();
    expect(screen.getByText("Demo document, not your files")).toBeTruthy();

    first.unmount();
    documentStore.close();
    render(<App />);
    await ready();
    expect(await screen.findByText("Demo document, not your files")).toBeTruthy();
    expect(screen.getByText(/short demo about this app/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Where do the API keys live?" }));
    expect((await screen.findAllByText(/Cloudflare Worker secrets/)).length).toBeGreaterThan(0);
  });
});

describe("storage failure copy", () => {
  it("offers a phone-sized clear control and does not claim the library was saved", () => {
    const onClear = vi.fn();
    render(
      <Sidebar
        documents={[doc]}
        selectedDocIds={["doc-1"]}
        notice={null}
        libraryReady
        storageMode="memory"
        storageNotice={STORAGE_QUOTA_NOTE}
        canClearDevice
        onUpload={() => undefined}
        onToggleDoc={() => undefined}
        onToggleAll={() => undefined}
        onRemove={() => undefined}
        onClear={onClear}
        onDismissNotice={() => undefined}
      />,
    );

    expect(screen.getByText(STORAGE_QUOTA_NOTE)).toBeTruthy();
    expect(screen.getByText("This tab only")).toBeTruthy();
    expect(screen.getByText("In this tab only")).toBeTruthy();
    const clear = screen.getByRole("button", { name: "Clear documents on this device" });
    expect(clear.className).toContain("min-h-11");
    expect(clear.className).toContain("w-full");
    fireEvent.click(clear);
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    expect(onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear documents on this device" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove them" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

const doc: UploadedDocument = {
  id: "doc-1",
  name: "notes.md",
  type: "text/markdown",
  size: 128,
  status: DocStatus.INDEXED,
  chunkCount: 1,
  progress: 1,
  uploadedAt: new Date("2026-11-12T00:00:00Z"),
  stored: false,
};

async function ready(): Promise<void> {
  expect(await screen.findByText("Saved in this browser, kept after a refresh")).toBeTruthy();
  expect(await screen.findByText(/Demo mode:/)).toBeTruthy();
}

function upload(name: string, contents: string): void {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("Missing file input.");
  const file = new File([contents], name, { type: "text/markdown" });
  fireEvent.change(input, { target: { files: [file] } });
}

function installBlobText(): void {
  if (typeof Blob.prototype.text === "function") return;
  Blob.prototype.text = function text() {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error ?? new Error("Could not read the file."));
      reader.readAsText(this);
    });
  };
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete the test database."));
    request.onblocked = () => reject(new Error("IndexedDB delete was blocked."));
  });
}
