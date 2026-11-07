# Setup

## 1. Try the offline demo

Install Node.js 22+, clone the repository, and run `npm ci`, `npm run demo`, and `npm run demo:failure`. Neither demo contacts external services or uses credentials. The failure demonstration intentionally exercises a handled failure and exits successfully when later rows remain untouched.

## 2. Create your Notion queue

Create your own Notion database and an internal integration. Grant that integration access to the database. A database ID identifies the database, not the page that contains it. This edition expects the database-query API available under Notion API version `2022-06-28`.

Use these exact property names:

| Property | Type | Purpose |
| --- | --- | --- |
| Video Title | Title | Job title |
| Website URL | URL | Website included in production notes |
| ChatGpt Script | Rich text | Final reviewed voiceover text |
| Video To follow | Rich text | Optional reference video or notes |
| Status | Select or Status | Include Ready, Generating, Done, Error |
| Posted | Checkbox | Exclude published content from the title export |
| Output Folder | Rich text | Saved local job path |
| Audio File | Rich text | Saved local MP3 path |
| Error Message | Rich text | Failure information |
| Generated At | Date | Successful completion timestamp |

Copy `.env.example` to `.env`. Set `NOTION_TOKEN` and `NOTION_DATABASE_ID`. If your Status property is Notion's native Status type, set `NOTION_STATUS_TYPE=status`; for a Select property, keep `select`.

`OUTPUT_ROOT` may be an absolute path or a project-relative directory. A local path stored in Notion is a reference for the operator, not a public download link. The worker checks that the script is nonempty, but does not evaluate its accuracy.

## 3. Install Python speech dependencies

Use Python 3.12+ for this documented setup. Python is a standard project dependency; the public edition does not require a Codex installation or use a developer-specific Python path.

Windows PowerShell:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe scripts\setup-tts.py
.\.venv\Scripts\python.exe tests\test-edge-tts-retries.py
```

If `py` is unavailable, use your installed `python` executable for the first command. Linux/macOS:

```sh
python3 -m venv .venv
.venv/bin/python scripts/setup-tts.py
.venv/bin/python tests/test-edge-tts-retries.py
```

The setup copies Edge TTS dependencies into `.tts-runtime/packages` so files inherit the destination's Windows permissions. These dependencies and the virtual environment are ignored by Git. The worker defaults to the virtual environment's Python; `EDGE_TTS_PYTHON` can override it with a full path.

## 4. Run a real job

Fill one row with your title, website, script, and optional reference; set Status to Ready:

```sh
npm start
```

Review the generated `audio.mp3` and `video-info.txt`. Successful rows become Done. On failure, the worker stops; fix the cause, then deliberately reset the failed row to Ready. It does not silently requeue Error rows.

For explicit single-row processing:

```sh
node src/cli.js --page YOUR_PAGE_ID
```

On Windows, `run-worker.cmd` keeps the terminal open. `npm run titles` prints Done rows with Posted unchecked, oldest first. `print-done-titles.cmd` keeps that output open for copying.

## Troubleshooting

| Message | Meaning and next action |
| --- | --- |
| Empty ChatGpt Script | Paste the approved script into the correct rich-text property |
| Notion says page, not database | Use the database ID, not its containing page ID |
| Property type mismatch | Match the schema above and NOTION_STATUS_TYPE |
| Python not found | Create .venv or set EDGE_TTS_PYTHON |
| Incomplete installation | Rerun scripts/setup-tts.py using the virtual environment |
| HTTP 403 | Worker corrects the token clock and tries the alternate endpoint; a persistent refusal is surfaced |
| HTTP 429 | Service throttling; allow a cooldown before retrying the row |
| Access is denied on network socket | Check VPN/security software; the worker makes bounded retries but cannot override a system block |
| Worker lock exists | Close overlapping workers; after a crash, inspect the Generating row and remove only OUTPUT_ROOT/.run.lock before restarting |

Do not run multiple workers against the same queue from separate output roots. Before sharing screenshots or logs, remove personal paths, credentials, private titles, and analytics you do not intend to publish.
