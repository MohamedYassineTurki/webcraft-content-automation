import fs from "node:fs/promises";
import path from "node:path";
import sanitize from "sanitize-filename";

export function safeSlug(value, fallback = "review") {
  const cleaned = sanitize(String(value || fallback))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

export async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function writeText(filePath, text) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, text, "utf8");
}

export async function writeJson(filePath, value) {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function absoluteFromCwd(...parts) {
  return path.resolve(process.cwd(), ...parts);
}

export function asFileUrl(filePath) {
  return path.resolve(filePath);
}
