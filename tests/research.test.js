import test from "node:test";
import assert from "node:assert/strict";
import { rankOpportunities, buildContentBrief, searchTopicEvidence, validateDomain } from "../src/topic-research.js";
import { createResearchServer } from "../src/mcp-server.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

test("ranking exposes the velocity and competition assumptions", () => {
  const base = { title: "Example", sourceUrl: "https://example.com/video", views: 1000, ageDays: 10, channelSubscribers: 100, largeChannelCompetitors: 0 };
  const results = rankOpportunities([{ ...base, title: "Crowded", largeChannelCompetitors: 4 }, { ...base, title: "Accessible" }]);
  assert.equal(results[0].title, "Accessible");
  assert.equal(results[0].viewsPerDay, 100);
  assert.equal(results[0].viewsToSubscriberRatio, 10);
});

test("domain validation rejects credentials, IP addresses and local hostnames", () => {
  assert.equal(validateDomain("https://www.example.com/path"), "example.com");
  for (const host of ["localhost", "127.0.0.1", "https://user:password@example.com", "file://example.com", "host.internal"]) assert.throws(() => validateDomain(host));
});

test("briefs preserve supplied evidence and require editorial handoff", () => {
  const brief = buildContentBrief({ domain: "example.com", title: "Example tutorial", intent: "tutorial", sources: [{ url: "https://example.com/docs", finding: "Supplied finding" }] });
  assert.equal(brief.evidence.length, 1);
  assert.match(brief.handoff, /ChatGpt Script/);
});

test("live search reports provider errors without exposing its key", async () => {
  await assert.rejects(searchTopicEvidence({ domain: "example.com", query: "tutorial" }, { apiKey: "" }), /BRAVE_SEARCH_API_KEY/);
  await assert.rejects(searchTopicEvidence({ domain: "example.com", query: "tutorial" }, { apiKey: "synthetic-key", fetchImpl: async () => ({ ok: false, status: 429 }) }), /HTTP 429/);
});

test("MCP client discovers tools and calls the real brief tool over the protocol", async () => {
  const server = createResearchServer();
  const client = new Client({ name: "webcraft-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((t) => t.name).sort(), ["build_content_brief", "rank_video_opportunities", "search_topic_evidence"]);
    const reply = await client.callTool({ name: "build_content_brief", arguments: { domain: "example.com", title: "A sample tutorial", intent: "tutorial" } });
    const brief = JSON.parse(reply.content[0].text);
    assert.equal(brief.websiteUrl, "https://example.com");
    assert.equal(brief.intent, "tutorial");
  } finally { await Promise.all([client.close(), server.close()]); }
});
