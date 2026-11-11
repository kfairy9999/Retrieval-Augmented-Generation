# Field notes: how the Personal Knowledge Engine works

This sample document ships with the app so you can try it without uploading anything. It describes the app itself, so every answer can be checked against the code on GitHub.

## What happens when you add a file

The browser reads the file. PDFs go through pdf.js, page by page, and each page is marked so a passage can point back to its page number. Markdown, text, and JSON are read as plain text. Files over 2 MB are refused, and one document is indexed up to 80 passages.

The text is split into passages of about 1,000 characters with a 200-character overlap. The splitter prefers to cut at a heading, then a blank line, then a line break, then a sentence, so a passage usually holds one complete idea. Tiny leftovers are merged into the passage before them.

## How passages are searched

Every passage becomes a vector. With a Gemini key on the server, the vector comes from the gemini-embedding-2 model at 768 dimensions, which matches meaning as well as words. Without that key, the app falls back to keyword search: each passage becomes a hashed bag of words, with common words removed and simple word endings trimmed. Keyword search finds shared words, not shared meaning.

A question is turned into a vector the same way. The app ranks passages by cosine similarity and keeps the top four. The score shown beside a passage is that similarity. It is not a confidence score.

The vectors live in memory in this browser tab. Nothing is stored on the server, and closing the tab clears the library.

## How an answer is written

With an xAI key on the server, the four passages and your question go to the grok-4.7 model through the app's own server route. The prompt tells the model to answer only from the numbered passages and to cite them as [1], [2], and so on. The answer streams back as it is written, and each citation opens the passage it points to.

Follow-up questions are rewritten into a standalone search query first, so "what about the second one?" still finds the right passages.

If the passages do not contain the answer, the model is told to say it could not find it, not to fill the gap from general knowledge. In keyword mode, a question that shares no words with any passage gets the same reply without calling a model.

## Where the API keys live

The keys are Cloudflare Worker secrets. The browser only talks to /api/embed, /api/rewrite, and /api/generate on the same site. A build check fails if a provider hostname or a key variable name ever ends up in the browser bundle.

Each route has a per-visitor rate limit: 40 embedding requests, 12 rewrites, and 12 answers a minute. The limit lives in the memory of one Worker instance, so it is a speed bump, not a billing guarantee.

## What this demo does not do

It does not read scanned PDFs, because there is no OCR step. It does not remember documents between visits. It does not search the web. When it is running without keys, it shows the passages it found instead of writing an answer, and it says so on the page.
