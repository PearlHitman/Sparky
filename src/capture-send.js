require("dotenv").config();

const path = require("path");
const { chromium } = require("playwright");
const { launchBrowser, loginToInstagram } = require("./auth");

const SESSION_DATA_DIR = path.resolve(process.cwd(), "session-data");
const INSTAGRAM_INBOX_URL = "https://www.instagram.com/direct/inbox/";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function shouldCaptureRequest(url, method) {
  if (method !== "POST") {
    return false;
  }
  return (
    url.includes("/api/v1/direct_v2/threads/") ||
    url.includes("/api/graphql") ||
    url.includes("/ajax/bz")
  );
}

async function launchBrowserHeaded() {
  const context = await chromium.launchPersistentContext(SESSION_DATA_DIR, {
    headless: false,
    viewport: { width: 1366, height: 768 },
    userAgent: DEFAULT_USER_AGENT
  });

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  await page.setViewportSize({ width: 1366, height: 768 });
  return { context, page };
}

async function main() {
  const { context, page } = await launchBrowserHeaded();

  const ok = await loginToInstagram(page);
  if (!ok) {
    console.error("Login failed; exiting.");
    await context.close().catch(() => {});
    process.exit(1);
  }

  await page.goto(INSTAGRAM_INBOX_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);

  page.on("request", (request) => {
    const url = request.url();
    const method = request.method();
    if (!shouldCaptureRequest(url, method)) {
      return;
    }
    const headers = request.headers();
    const postData = request.postData();
    console.log("--- captured request ---");
    console.log("URL:", url);
    console.log("Method:", method);
    console.log("Headers:", JSON.stringify(headers, null, 2));
    console.log("POST data:", postData);
    console.log("--- end ---");
  });

  console.log(
    "READY — Manually send a message in the visible Instagram window now. Watching for 90 seconds..."
  );
  await page.waitForTimeout(90000);

  await context.close().catch(() => {});
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
