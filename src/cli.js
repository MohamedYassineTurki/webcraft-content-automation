import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import { parseArgs } from "node:util";
import { createNotionClient, findPages, notionQueue } from "./notion.js";
import { runQueue } from "./worker.js";
import { generateEdgeTts } from "./edge-tts.js";
import { notify } from "./notify.js";

async function main() {
  const { values } = parseArgs({ options: { page: { type: "string" }, limit: { type: "string" } } });
  const outputRoot = path.resolve(process.env.OUTPUT_ROOT || "outputs/jobs");
  await fs.mkdir(outputRoot, { recursive: true });
  const lock = path.join(outputRoot, ".run.lock");
  try { await fs.mkdir(lock); } catch (error) {
    if (error.code === "EEXIST") throw new Error(`A worker lock exists at ${lock}. Close any other worker first. After a crash, remove only this lock folder before rerunning.`);
    throw error;
  }
  try {
    console.log("WebCraft | Production Queue\nConnecting to Notion...");
    const notion = createNotionClient();
    const pages = values.page ? [await notion.pages.retrieve({ page_id: values.page })] : await findPages(notion, process.env.NOTION_DATABASE_ID, {
      limit: Number(values.limit || process.env.READY_ROW_LIMIT || 50)
    });
    const result = await runQueue({ pages, queue: notionQueue(notion), synthesize: generateEdgeTts, outputRoot });
    notify("WebCraft production", `${result.done} done, ${result.failed} failed, ${result.remaining} remaining.`);
    if (result.failed) process.exitCode = 1;
  } finally { await fs.rmdir(lock); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
