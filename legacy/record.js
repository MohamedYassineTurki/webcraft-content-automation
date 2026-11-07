import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

export async function recordWebsite({ url, outputDir }) {
  const width = Number(process.env.RECORD_WIDTH || 1920);
  const height = Number(process.env.RECORD_HEIGHT || 1080);
  const seconds = Number(process.env.RECORD_SECONDS || 90);
  const headless = String(process.env.HEADLESS || "true").toLowerCase() !== "false";
  const scrollMode = String(process.env.RECORD_SCROLL_MODE || "smooth").toLowerCase();

  const browser = await chromium.launch({ headless });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: {
      dir: outputDir,
      size: { width, height }
    }
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await clickCookieButton(page);
    await preparePageForRecording(page, url);
    await autoScroll(page, seconds, scrollMode);
    const video = page.video();
    await context.close();
    const recordedPath = await video.path();
    const finalPath = path.join(outputDir, "website-recording.webm");
    await fs.rename(recordedPath, finalPath).catch(async () => {
      await fs.copyFile(recordedPath, finalPath);
    });
    return finalPath;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function autoScroll(page, seconds, mode) {
  if (mode === "wheel") {
    await wheelScroll(page, seconds);
    return;
  }

  const pauseMs = Number(process.env.RECORD_SCROLL_PAUSE_MS || 1300);
  const maxScroll = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  );
  if (maxScroll <= 0) {
    await page.waitForTimeout(seconds * 1000);
    return;
  }

  await page.waitForTimeout(pauseMs);

  const sectionCount = Math.min(9, Math.max(4, Math.floor(seconds / 10)));
  const scrollDuration = Math.max(1200, Math.floor(((seconds * 1000) - pauseMs * (sectionCount + 2)) / sectionCount));

  for (let i = 1; i <= sectionCount; i += 1) {
    const targetY = Math.round((maxScroll * i) / sectionCount);
    await smoothScrollTo(page, targetY, scrollDuration);
    await page.waitForTimeout(pauseMs);
  }

  await smoothScrollTo(page, Math.round(maxScroll * 0.15), 1600);
  await page.waitForTimeout(900);
}

async function wheelScroll(page, seconds) {
  const steps = Math.max(8, Math.floor(seconds / 3));
  for (let i = 0; i < steps; i += 1) {
    await page.mouse.wheel(0, 380);
    await page.waitForTimeout(2600);
  }
}

async function smoothScrollTo(page, targetY, durationMs) {
  await page.evaluate(
    async ({ targetY, durationMs }) => {
      const startY = window.scrollY;
      const distance = targetY - startY;
      const start = performance.now();
      const easeInOutCubic = (t) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      await new Promise((resolve) => {
        const tick = (now) => {
          const progress = Math.min(1, (now - start) / durationMs);
          window.scrollTo(0, startY + distance * easeInOutCubic(progress));
          if (progress < 1) {
            requestAnimationFrame(tick);
          } else {
            resolve();
          }
        };
        requestAnimationFrame(tick);
      });
    },
    { targetY, durationMs }
  );
}

async function preparePageForRecording(page, url) {
  const host = new URL(url).hostname.replace(/^www\./, "");
  const trintNavFix = String(process.env.RECORD_TRINT_NAV_FIX || "true").toLowerCase() !== "false";
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      * { caret-color: transparent !important; }
      video, canvas { image-rendering: auto; }
    `
  }).catch(() => {});

  if (host === "trint.com" && trintNavFix) {
    await page.addStyleTag({
      content: `
        .navbar-header,
        .navbar-container,
        .navbar-horizontal-padding,
        .navigation-header---main-div,
        .navigation-header---left-items,
        .navigation-header---right-items {
          background: #fff !important;
        }
      `
    }).catch(() => {});
  }
}

async function clickCookieButton(page) {
  for (const label of ["Accept all", "Accept", "I agree", "Agree", "OK", "Got it"]) {
    const button = page.getByRole("button", { name: new RegExp(`^${label}$`, "i") });
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 1500 }).catch(() => {});
      return;
    }
  }
}
