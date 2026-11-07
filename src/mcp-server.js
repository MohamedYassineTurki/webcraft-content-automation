import "dotenv/config";
import { pathToFileURL } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildContentBrief, rankOpportunities, searchTopicEvidence } from "./topic-research.js";

function result(value) { return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] }; }

export function createResearchServer() {
  const server = new McpServer({ name: "webcraft-research", version: "1.0.0" });
  server.registerTool("search_topic_evidence", {
    description: "Search public web evidence for a website/topic. Requires a Brave Search API key. Returns source URLs and excerpts; does not use vidIQ credits.",
    inputSchema: { domain: z.string().min(3).max(253), query: z.string().min(1).max(300), count: z.number().int().min(1).max(10).optional() },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: true }
  }, async (input) => {
    try { return result(await searchTopicEvidence(input)); } catch (error) { return { ...result({ error: error.message }), isError: true }; }
  });
  server.registerTool("rank_video_opportunities", {
    description: "Rank supplied YouTube evidence by observed views/day, views-to-subscriber ratio, and competition. Deterministic heuristic; no YouTube API, predictions, or paid analytics calls.",
    inputSchema: { candidates: z.array(z.object({
      title: z.string().min(1).max(300), sourceUrl: z.string().url(),
      views: z.number().int().nonnegative(), ageDays: z.number().nonnegative(),
      channelSubscribers: z.number().int().nonnegative(), largeChannelCompetitors: z.number().int().nonnegative()
    })).min(1).max(100) },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async ({ candidates }) => result({ ranked: rankOpportunities(candidates), method: "Transparent research heuristic, not a virality forecast. Accuracy depends on the supplied observations." }));
  server.registerTool("build_content_brief", {
    description: "Build a structured review/tutorial brief and a handoff to the Notion production queue using supplied evidence.",
    inputSchema: {
      domain: z.string().min(3).max(253), title: z.string().min(1).max(300), intent: z.enum(["review", "tutorial"]),
      sources: z.array(z.object({ url: z.string().url(), finding: z.string().min(1).max(1500) })).max(30).optional()
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
  }, async (input) => {
    try { return result(buildContentBrief(input)); } catch (error) { return { ...result({ error: error.message }), isError: true }; }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await createResearchServer().connect(new StdioServerTransport());
}
