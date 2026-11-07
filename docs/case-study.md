# Engineering a workflow I actually use

## Context

WebCraft publishes software tutorials and reviews for people searching for practical answers. Producing these videos involved repeated handoffs: finding a topic, researching a website, drafting a script, generating speech, collecting footage, organizing assets, and tracking completion.

I built the automation around the actual production queue rather than a hypothetical product. Notion became the operator interface, Node.js coordinated jobs, and external speech and model services handled specific stages. The system evolved as I learned which steps benefited from automation and which needed direct editorial control.

## Reported scale

During 2026, I used the workflow to support the production of more than 1,000 videos. WebCraft reached more than 1 million views and 2,400 subscribers. These figures are creator-reported; channel growth is an outcome of content, search demand, publishing, and other factors as well as production support. See [evidence notes](impact.md).

## Evolution

| Stage | Approach | What I learned |
| --- | --- | --- |
| Initial workflow | Notion titles and websites; API script generation; speech; Playwright website recording | Automating each handoff exposed layout, network, and provider reliability issues |
| Editorial workflow | Manually reviewed ChatGPT scripts stored in Notion; Edge TTS; structured asset folders | Keeping the script approval step explicit made the output easier to control |
| Public engineering edition | Testable adapters, offline demonstration, documented interfaces, CI, new research MCP server | A portfolio project needs reproducibility and clear claims, beyond code that runs on one PC |

The earlier research routine used existing connected tools, including vidIQ's MCP integration. The custom MCP server in this repository was added for the public engineering edition in November 2026. It was not the implementation behind all previously produced videos.

## Problems that shaped the design

### Ordering is a contract

Notion's visual table order is not a general API ordering guarantee. The production queue queries rows with an explicit ascending creation timestamp. Paginated queries preserve the API sequence. A manually rearranged view can differ; the documentation calls that out instead of promising an order the API does not expose.

### Failures should stay contained

A speech-service outage can affect every queued job. Continuing blindly turned one external problem into a queue full of failed rows. The worker therefore stops at the first failure. Tests cover the important example: row one succeeds, row two fails, and row three remains untouched.

### Provider compatibility is not permanent

Edge TTS required work on connection headers, clock skew, and alternate speech endpoints. The worker reads Microsoft's server time for token generation without changing the operating system clock. A Node subprocess boundary gives the Python speech client a real completion status and a hard timeout.

These measures improve diagnostics and recovery; they do not make an unofficial service a guaranteed production API. HTTP 429 remains an explicit stop condition. [Operational limits](architecture.md#failure-behavior).

### A demo should prove behavior without asking for secrets

The public demo runs the same queue engine as production, injecting a synthetic Notion adapter and a simulated speech adapter. It produces inspectable folders and state transitions. Tests separately exercise MCP discovery and tool calls through the actual protocol SDK.

## My engineering scope

Problem definition, workflow design, API integration, queue semantics, provider troubleshooting, production use, and preparation of this public project. AI coding tools assisted implementation and debugging. The project does not claim to implement the language models, speech synthesis engine, Notion, or vidIQ itself.

## Next engineering steps

An explicitly numbered Notion queue for arbitrary editorial ordering; persisted job identities and resumable stages; configurable speech-provider adapters with a supported API option; backoff honoring rate-limit headers; and measured production-time comparisons. These are future work, not shipped features.
