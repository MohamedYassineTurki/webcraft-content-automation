import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runQueue } from "./worker.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const jobs = JSON.parse(await fs.readFile(path.join(root, "examples", "queue.json"), "utf8"));
const pages = jobs.map((job) => ({ id: job.id, properties: {
  "Video Title": { title: [{ plain_text: job.title }] },
  "Website URL": { url: job.website },
  "Video To follow": { rich_text: [{ plain_text: job.reference }] },
  "ChatGpt Script": { rich_text: [{ plain_text: job.script }] }
} }));
const states = Object.fromEntries(jobs.map((job) => [job.id, "Ready"]));
const fail = process.argv.includes("--fail");
console.log("WEBCRAFT / OFFLINE DEMO\nSynthetic rows and simulated speech. No credentials, APIs, real audio, or Notion writes.\n");
const result = await runQueue({
  pages,
  outputRoot: path.join(root, "outputs", "demo"),
  queue: { update: async (id, status) => { states[id] = status; } },
  audioName: "audio.demo.txt",
  synthesize: async ({ text, outputPath }) => {
    if (fail) throw new Error("Simulated provider failure. Later rows must remain Ready.");
    await fs.writeFile(outputPath, `SIMULATED AUDIO - NOT AN MP3\n\n${text}\n`, "utf8");
  }
});
console.log("\nFinal queue states:", JSON.stringify(states, null, 2));
console.log("Demo artifacts:", path.join(root, "outputs", "demo"));
if (fail && !(result.failed === 1 && result.remaining === 1 && states["sample-002"] === "Ready")) throw new Error("Failure isolation check failed.");
