import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist", import.meta.url));
const forbidden = ["GEMINI_API_KEY", "XAI_API_KEY", "generativelanguage.googleapis.com", "api.x.ai", "AIza"];

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await walk(path));
    else found.push(path);
  }
  return found;
}

const distFiles = await walk(root);
let failed = false;
for (const file of distFiles) {
  const text = await readFile(file, "utf8");
  for (const needle of forbidden) {
    if (text.includes(needle)) {
      console.error(`${file} contains ${needle}`);
      failed = true;
    }
  }
}

if (distFiles.length === 0) {
  console.error("dist/ is empty");
  failed = true;
}

if (failed) process.exit(1);
console.log(`Checked ${distFiles.length} client files. No API key or model host in the bundle.`);
