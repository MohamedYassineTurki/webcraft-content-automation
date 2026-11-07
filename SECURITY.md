# Security

Do not commit API keys, .env files, private Notion exports, generated production media, or raw analytics exports. `.env.example` contains empty configuration values only. The production integration should have access only to the intended Notion database.

To report a vulnerability, use the repository's private vulnerability-reporting feature when available. Otherwise open an issue asking for a private reporting channel without posting exploit data or credentials. If a secret is exposed, revoke or rotate it; deleting it from a later commit does not revoke it.

The MCP server runs locally over stdio. It is not an authenticated public HTTP service. Web search sends the supplied query to the configured provider. The speech worker sends the approved script to Microsoft's online speech endpoint. The offline demo and automated tests use synthetic data and mocks.

Original project code is MIT-licensed. Notion, Brave, Microsoft, Gemini, OpenAI, and other services have separate terms and limits. The unofficial Edge speech integration is not a Microsoft-supported API contract.
