import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const indexPath = resolve(root, "index.html");
const html = readFileSync(indexPath, "utf8");

const refs = [];

for (const match of html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi)) {
  refs.push(match[1]);
}

for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
  refs.push(match[1]);
}

const localRefs = refs.filter((ref) => !/^(?:[a-z]+:)?\/\//i.test(ref) && !ref.startsWith("data:"));
const missing = localRefs.filter((ref) => !existsSync(resolve(root, ref)));

if (missing.length > 0) {
  console.error("Missing static assets referenced by index.html:");
  for (const ref of missing) console.error(`- ${ref}`);
  process.exit(1);
}

console.log(`All ${localRefs.length} static asset references exist.`);
