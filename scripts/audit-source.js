import fs from "node:fs/promises";
import path from "node:path";

const skipped = new Set([".git", "node_modules", ".venv", ".tts-runtime", "outputs", "__pycache__"]);
const rules = [
  ["Notion credential", /(?:ntn_|secret_)[a-zA-Z0-9]{20,}/],
  ["OpenAI credential", /sk-(?:proj-)?[a-zA-Z0-9_-]{30,}/],
  ["Google credential", /AIza[a-zA-Z0-9_-]{30,}/],
  ["GitHub credential", /(?:gh[pousr]_|github_pat_)[a-zA-Z0-9_]{30,}/],
  ["Developer-specific Windows profile path", /C:[\\/]+Users[\\/]+USER[\\/]/i]
];
const failures = [];
let inspected = 0;
async function scan(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) { await scan(file); continue; }
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") { failures.push(`${file}: private environment file in release tree`); continue; }
    if (!/\.(?:js|py|json|md|txt|yml|yaml|cmd|svg)$/.test(entry.name) && ![".env.example", "LICENSE", ".gitignore"].includes(entry.name)) continue;
    const text = await fs.readFile(file, "utf8");
    inspected += 1;
    for (const [label, pattern] of rules) if (pattern.test(text)) failures.push(`${file}: ${label}`);
    if (entry.name === ".env.example" && /^(?:NOTION_TOKEN|BRAVE_SEARCH_API_KEY)=\S+/m.test(text)) failures.push(`${file}: nonempty credential placeholder`);
  }
}
await scan(".");
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
else console.log(`Source hygiene check passed (${inspected} files). This does not replace reviewing staged files.`);
