import { chromium } from "playwright";

const DEFAULT_REVIEW_SOURCES = {
  "trint.com": [
    {
      name: "G2 Trint reviews",
      url: "https://www.g2.com/products/trint/reviews",
      facts: [
        "G2 lists Trint at 4.4/5 from 66 reviews.",
        "Positive reviews commonly mention transcription accuracy, time savings, speaker identification, editing, captions, and convenience for interviews.",
        "Critical reviews mention high pricing, occasional clunky interface, billing or usage tracking concerns, slow server moments, imperfect speaker labels, and weaker results for mumbled or low voices."
      ]
    },
    {
      name: "Trustpilot Trint reviews",
      url: "https://www.trustpilot.com/review/trint.com",
      facts: [
        "Trustpilot shows 370 total reviews, but only 1 review in the last 12 months in the page snapshot used during planning.",
        "Because recent public review volume is limited there, scripts should avoid overstating current Trustpilot sentiment."
      ]
    }
  ]
};

export async function researchWebsite(url, options = {}) {
  const browser = await chromium.launch({ headless: options.headless ?? true });
  const page = await browser.newPage({
    viewport: {
      width: Number(process.env.RECORD_WIDTH || 1920),
      height: Number(process.env.RECORD_HEIGHT || 1080)
    }
  });

  try {
    await navigateForResearch(page, url);
    await page.waitForTimeout(2500);
    await acceptCommonCookieBanner(page);

    const website = await page.evaluate(() => {
      const textOf = (selector) =>
        Array.from(document.querySelectorAll(selector))
          .map((node) => node.innerText?.trim())
          .filter(Boolean);
      const metaDescription =
        document.querySelector('meta[name="description"]')?.getAttribute("content") ||
        document.querySelector('meta[property="og:description"]')?.getAttribute("content") ||
        "";
      const visibleText = document.body?.innerText || "";
      const links = Array.from(document.querySelectorAll("a"))
        .map((a) => ({ text: a.innerText?.trim(), href: a.href }))
        .filter((link) => link.text && link.href)
        .slice(0, 80);
      return {
        pageTitle: document.title,
        metaDescription,
        headings: {
          h1: textOf("h1").slice(0, 10),
          h2: textOf("h2").slice(0, 30),
          h3: textOf("h3").slice(0, 30)
        },
        visibleText: visibleText.replace(/\s+/g, " ").trim().slice(0, 12000),
        links
      };
    });

    const reviewSources = await getReviewSources(url);
    const reviewSummary = reviewSources
      .map((source) => {
        const facts = source.facts.map((fact) => `- ${fact}`).join("\n");
        return `${source.name} (${source.url})\n${facts}`;
      })
      .join("\n\n");

    return {
      url,
      website,
      reviewSources,
      websiteSummary: summarizeWebsite(website),
      reviewSummary
    };
  } finally {
    await browser.close();
  }
}

async function navigateForResearch(page, url) {
  const timeout = Number(process.env.RESEARCH_GOTO_TIMEOUT_MS || 60000);
  const maxAttempts = Math.max(1, Number(process.env.RESEARCH_GOTO_ATTEMPTS || 3));
  const retryDelayMs = Number(process.env.RESEARCH_GOTO_RETRY_DELAY_MS || 60000);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(`    Loading website for research (attempt ${attempt}/${maxAttempts})`);
      await page.goto(url, { waitUntil: "domcontentloaded", timeout });
      return;
    } catch (error) {
      if (!isNavigationTimeout(error) || attempt === maxAttempts) {
        throw error;
      }

      console.log(`    Website did not load within ${Math.round(timeout / 1000)} seconds. Waiting ${Math.round(retryDelayMs / 1000)} seconds before retrying.`);
      await page.evaluate(() => window.stop()).catch(() => {});
      await page.waitForTimeout(retryDelayMs);
    }
  }
}

function isNavigationTimeout(error) {
  return error?.name === "TimeoutError" || /Timeout .* exceeded/i.test(error?.message || "");
}

async function acceptCommonCookieBanner(page) {
  const labels = ["Accept all", "Accept", "I agree", "Agree", "OK", "Got it"];
  for (const label of labels) {
    const button = page.getByRole("button", { name: new RegExp(`^${escapeRegExp(label)}$`, "i") });
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 1500 }).catch(() => {});
      return;
    }
  }
}

async function getReviewSources(url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  return DEFAULT_REVIEW_SOURCES[host] || [
    {
      name: "No configured review source",
      url: "",
      facts: [
        "No default review source is configured for this domain yet.",
        "Add review facts manually to the Notion row or extend src/research.js for this website before publishing."
      ]
    }
  ];
}

function summarizeWebsite(website) {
  const h1 = website.headings.h1.join("; ");
  const h2 = website.headings.h2.slice(0, 12).join("; ");
  return [
    `Page title: ${website.pageTitle}`,
    website.metaDescription ? `Meta description: ${website.metaDescription}` : "",
    h1 ? `Main headings: ${h1}` : "",
    h2 ? `Important sections: ${h2}` : "",
    `Visible text excerpt: ${website.visibleText.slice(0, 2500)}`
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
