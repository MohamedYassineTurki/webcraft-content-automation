import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runQueue, normalizeWebsite } from "../src/worker.js";
import { findPages } from "../src/notion.js";

function page(id, script = "A complete voiceover script.") {
  return { id, properties: { "Video Title": { title: [{ plain_text: `Video ${id}` }] }, "Website URL": { url: "example.com" }, "ChatGpt Script": { rich_text: [{ plain_text: script }] } } };
}

test("successful jobs create assets and transition Generating -> Done in input order", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "webcraft-queue-"));
  try {
    const updates = [];
    const result = await runQueue({ pages: [page("one"), page("two")], outputRoot: folder, log: () => {},
      queue: { update: async (id, status) => updates.push([id, status]) },
      synthesize: async ({ outputPath }) => fs.writeFile(outputPath, "SIMULATED_AUDIO")
    });
    assert.deepEqual(updates, [["one", "Generating"], ["one", "Done"], ["two", "Generating"], ["two", "Done"]]);
    assert.equal(result.done, 2);
    assert.deepEqual((await fs.readdir(result.results[0].folder)).sort(), ["audio.mp3", "video-info.txt"]);
    assert.match(await fs.readFile(path.join(result.results[0].folder, "video-info.txt"), "utf8"), /https:\/\/example.com/);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("a provider failure preserves earlier Done jobs and leaves later rows untouched", async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), "webcraft-failure-"));
  try {
    let calls = 0;
    const updates = [];
    const result = await runQueue({ pages: [page("one"), page("two"), page("three")], outputRoot: folder, log: () => {},
      queue: { update: async (id, status) => updates.push([id, status]) },
      synthesize: async ({ outputPath }) => { if (++calls === 2) throw Error("provider unavailable"); await fs.writeFile(outputPath, "SIMULATED_AUDIO"); }
    });
    assert.equal(result.done, 1);
    assert.equal(result.failed, 1);
    assert.equal(result.remaining, 1);
    assert.deepEqual(updates, [["one", "Generating"], ["one", "Done"], ["two", "Generating"], ["two", "Error"]]);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
});

test("empty scripts fail before creating a production folder or calling TTS", async () => {
  const states = [];
  const result = await runQueue({ pages: [page("one", ""), page("two")], outputRoot: "unused", log: () => {},
    queue: { update: async (id, status) => states.push([id, status]) }, synthesize: () => { throw Error("must not run"); }
  });
  assert.equal(result.remaining, 1);
  assert.deepEqual(states, [["one", "Error"]]);
});

test("Notion query paginates and explicitly sorts oldest first", async () => {
  const queries = [];
  const notion = { databases: { query: async (query) => { queries.push(query); return queries.length === 1 ? { results: [page("one")], has_more: true, next_cursor: "next" } : { results: [page("two")], has_more: false }; } } };
  const pages = await findPages(notion, "sample", { limit: 2, status: "Done", unposted: true });
  assert.deepEqual(pages.map((p) => p.id), ["one", "two"]);
  assert.equal(queries[1].start_cursor, "next");
  assert.equal(queries[1].page_size, 1);
  assert.equal(queries[0].sorts[0].direction, "ascending");
  assert.equal(queries[0].filter.and[1].checkbox.equals, false);
});

test("website cleanup handles spaces in pasted URLs", () => {
  assert.equal(normalizeWebsite("https:// example.com"), "https://example.com/");
  assert.equal(normalizeWebsite("example.com"), "https://example.com/");
  assert.throws(() => normalizeWebsite(""));
});
