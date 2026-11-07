# Research MCP server

## What changed

**MCP is a protocol for an AI application to discover and call tools.** It separates the application using tools (the host/client) from the program exposing tools (the server).

The creator's earlier workflow connected an AI client to existing integrations such as vidIQ and researched topics with those tools. That was **using MCP integrations**, rather than writing the underlying MCP server. A prompt, saved workflow, or skill can organize those calls without implementing a protocol server.

This repository now includes a custom server: `src/mcp-server.js` registers three project-specific tools, validates their inputs, handles tool results, and connects through the SDK's stdio transport. A protocol-level test uses an actual MCP client to discover and invoke a tool.

The distinction is about what was implemented, not whether the earlier workflow was useful. The public server is a new November 2026 addition; the historical content milestones are not attributed to this new implementation alone.

## Tools

| Tool | Input | Output | External access |
| --- | --- | --- | --- |
| search_topic_evidence | Domain, query, optional result count | Source titles, URLs, excerpts, retrieval timestamp | Brave Web Search API; requires your own key |
| rank_video_opportunities | Supplied views, age, subscribers, large-channel competitor count and source URLs | Ranked list with velocity, reach ratio, score and rationale | None |
| build_content_brief | Domain, title, review/tutorial intent and supplied findings | Outline, evidence, website URL and Notion handoff | None |

The ranking formula is deliberately inspectable:

```text
velocity = views / max(1, ageDays)
reach = views / max(1, channelSubscribers)
score = 100 * log(1 + velocity) * (1 + log(1 + reach))
        / (1 + largeChannelCompetitors)
```

This is a research heuristic, not a validated forecasting model. The caller supplies the observations and their sources; the server does not scrape YouTube, infer hidden analytics, or compute competitor counts itself. General web search excerpts are not a substitute for video analytics. No vidIQ account or credits are used by this implementation.

## Connect a client

Run directly with Node so stdout contains MCP messages only:

```sh
node /absolute/path/to/webcraft-content-automation/src/mcp-server.js
```

For a client that accepts the common `mcpServers` configuration shape:

```json
{
  "mcpServers": {
    "webcraft-research": {
      "command": "node",
      "args": ["/absolute/path/to/webcraft-content-automation/src/mcp-server.js"],
      "env": { "BRAVE_SEARCH_API_KEY": "YOUR_SEARCH_API_KEY" }
    }
  }
}
```

Use your client's documented configuration location and format. The optional key belongs in local settings, not a committed file. If no search key is configured, ranking and brief creation still work; live search returns an actionable configuration error.

Example tool input for `build_content_brief`:

```json
{
  "domain": "example.com",
  "title": "How to export your first project",
  "intent": "tutorial",
  "sources": [{ "url": "https://example.com/docs", "finding": "Synthetic demonstration finding; replace with verified evidence." }]
}
```

## Trust boundaries

The server performs no Notion writes and no YouTube publication. Domain inputs are validated; the domain is a search query term, not an arbitrary URL fetched by the server. Returned excerpts and findings are external content, not instructions. All three tools are annotated as read-only; live search can still consume the configured provider's quota. The server has no autonomous planning loop or LLM of its own.

References: [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture), [official TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk), [Brave Web Search API](https://api-dashboard.search.brave.com/app/documentation/web-search).
