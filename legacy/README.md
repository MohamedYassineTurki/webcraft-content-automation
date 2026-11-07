# Historical pipeline modules

These modules preserve the earlier production experiments:

- `research.js`: extract a website's visible text with Playwright and attach configured review notes.
- `script.js`: generate a script using Gemini or OpenAI from supplied research context.
- `tts.js`: generate speech using Gemini.
- `record.js`: record a website and automated scrolling using Playwright.
- `gemini-keys.js`: parse legacy provider-key settings and recognize quota responses.

They are not wired into the default production queue. They are retained as engineering history, not presented as a fully maintained second application. The default queue reads an approved script from Notion and generates Edge speech only.

To study these modules, run `npm install` in this directory and install the browser with `npx playwright install chromium`. Configure provider credentials only in your own local environment. Live model names, access, pricing, and provider behavior must be checked before executing old integrations. The public release does not test paid model calls.

The research module's Trint review figures are a historical planning snapshot, not a live review scraper or current product-rating evidence. Provider key fallback does not create additional account entitlement; limits can apply across keys belonging to the same project. Website recording is a visual capture of public pages, not autonomous testing of every product feature.
