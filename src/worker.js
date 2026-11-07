import fs from "node:fs/promises";
import path from "node:path";
import { safeSlug } from "./files.js";
import { readJob, richText } from "./notion.js";

export function normalizeWebsite(value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, "");
  if (!cleaned) throw new Error("Website URL is required.");
  const url = new URL(/^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Website URL must use HTTP or HTTPS.");
  return url.href;
}

export function formatVideoInfo(job) {
  return `Video Title: ${job.title}\nWebsite URL: ${job.website}\nVideo To Follow: ${job.reference}\n`;
}

export async function runQueue({ pages, queue, synthesize, outputRoot, log = console.log, audioName = "audio.mp3" }) {
  const results = [];
  log(`Queue: ${pages.length} row(s), oldest first.`);
  for (let index = 0; index < pages.length; index += 1) {
    const job = readJob(pages[index]);
    log(`\nJob ${index + 1}/${pages.length}: ${job.title}`);
    try {
      if (!job.title) throw new Error("Video Title is required.");
      if (!job.script) throw new Error("ChatGpt Script is empty. Fill it before setting Ready.");
      job.website = normalizeWebsite(job.website);
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const folder = path.resolve(outputRoot, `${stamp}-${safeSlug(job.title)}-${safeSlug(job.id).slice(0, 8)}`);
      log("[1/5] Creating job folder");
      await fs.mkdir(folder, { recursive: true });
      log("[2/5] Updating status to Generating");
      await queue.update(job.id, "Generating", { "Error Message": richText(""), "Output Folder": richText(folder) });
      log("[3/5] Writing video-info.txt");
      await fs.writeFile(path.join(folder, "video-info.txt"), formatVideoInfo(job), "utf8");
      log("[4/5] Generating voiceover");
      const audioPath = path.join(folder, audioName);
      await synthesize({ text: job.script, outputPath: audioPath });
      log("[5/5] Updating status to Done");
      await queue.update(job.id, "Done", {
        "Audio File": richText(audioPath), "Output Folder": richText(folder),
        "Generated At": { date: { start: new Date().toISOString() } }
      });
      results.push({ id: job.id, status: "done", folder, audioPath });
      log(`Done: ${path.basename(folder)}`);
    } catch (error) {
      const message = error.message || String(error);
      try {
        await queue.update(job.id, "Error", { "Error Message": richText(message) });
      } catch (updateError) {
        log(`Notion error status could not be saved: ${updateError.message}. Check this row before rerunning.`);
      }
      results.push({ id: job.id, status: "error", error: message });
      log(`Stopped: ${message}`);
      break;
    }
  }
  const done = results.filter((result) => result.status === "done").length;
  const summary = { done, failed: results.length - done, remaining: pages.length - results.length, results };
  log(`\nFinished: ${summary.done} done, ${summary.failed} failed, ${summary.remaining} remaining.`);
  return summary;
}
