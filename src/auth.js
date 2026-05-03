const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { randomDelay, logInfo, logError } = require("./utils");

const SESSION_DATA_DIR = path.resolve(process.cwd(), "session-data");
const INSTAGRAM_HOME_URL = "https://www.instagram.com/";
const INSTAGRAM_LOGIN_URL = "https://www.instagram.com/accounts/login/";
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function hasSessionDataFiles(sessionDir) {
  if (!fs.existsSync(sessionDir)) {
    return false;
  }

  const entries = fs.readdirSync(sessionDir, { withFileTypes: true });
  if (entries.length === 0) {
    return false;
  }

  return entries.some((entry) => {
    if (entry.isFile()) {
      return true;
    }

    if (!entry.isDirectory()) {
      return false;
    }

    const nestedPath = path.join(sessionDir, entry.name);
    return hasSessionDataFiles(nestedPath);
  });
}

async function launchBrowser() {
  const hasSessionData = hasSessionDataFiles(SESSION_DATA_DIR);
  const headless = hasSessionData;

  const context = await chromium.launchPersistentContext(SESSION_DATA_DIR, {
    headless,
    viewport: { width: 1366, height: 768 },
    userAgent: DEFAULT_USER_AGENT
  });

  let page = context.pages()[0];
  if (!page) {
    page = await context.newPage();
  }

  await page.setViewportSize({ width: 1366, height: 768 });

  logInfo(
    `Browser launched (${headless ? "headless" : "headed"}) using session dir`
  );

  return { context, page };
}

async function isLoggedIn(page) {
  const url = page.url().toLowerCase();
  if (url.includes("/accounts/onetap")) {
    return true;
  }

  const username = process.env.INSTAGRAM_USERNAME;
  const selectors = [
    "a[href='/direct/inbox/']",
    "a[href*='/direct/inbox']",
    "nav a[aria-label='Direct']",
    "svg[aria-label='Messenger']",
    "nav a[href='/accounts/edit/']"
  ];

  if (username) {
    selectors.push(`nav a[href='/${username}/']`);
    selectors.push(`a[href='/${username}/']`);
  }

  for (const selector of selectors) {
    const match = await page
      .locator(selector)
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);
    if (match) {
      return true;
    }
  }

  return false;
}

async function typeSlowly(locator, value) {
  for (const character of value) {
    await locator.type(character, { delay: 0 });
    await randomDelay(57, 149);
  }
}

async function clickIfVisible(page, candidates) {
  for (const candidate of candidates) {
    const button = page.getByRole("button", { name: candidate });
    if (await button.first().isVisible().catch(() => false)) {
      await button.first().click();
      return true;
    }
  }

  return false;
}

async function dismissOnetapIfPresent(page) {
  const url = page.url().toLowerCase();
  if (!url.includes("/accounts/onetap")) {
    return false;
  }
  logInfo("Onetap interstitial detected, dismissing");
  const dismissed = await clickIfVisible(page, [
    "Not Now",
    "Not now",
    "Save Info",
    "Save info"
  ]);
  if (dismissed) {
    await randomDelay(1500, 2800);
  }
  try {
    await page.waitForURL((u) => !u.toLowerCase().includes("/accounts/onetap"), {
      timeout: 30000
    });
  } catch (_e) {
    logInfo("Onetap dismissal did not redirect within 30s, continuing");
  }
  return true;
}

async function dismissCookieBanner(page) {
  try {
    const dismissed = await clickIfVisible(page, [
      "Allow all cookies",
      "Accept all",
      "Allow All Cookies",
      "Accept All",
      "Only allow essential cookies",
      "Decline optional cookies"
    ]);
    if (dismissed) {
      await randomDelay(1500, 2800);
      logInfo("Cookie banner dismissed");
    }
  } catch (e) {
    logError(`Cookie banner dismissal failed: ${e.message}`);
  }
}

async function loginToInstagram(page) {
  const username = process.env.INSTAGRAM_USERNAME || "";
  const password = process.env.INSTAGRAM_PASSWORD || "";

  if (!username || !password) {
    logError("Instagram credentials are missing in environment variables");
    return false;
  }

  await page.goto(INSTAGRAM_HOME_URL, { waitUntil: "domcontentloaded" });
  await randomDelay(3133, 4921);
  await dismissCookieBanner(page);
  await dismissOnetapIfPresent(page);

  if (await isLoggedIn(page)) {
    logInfo("Session valid");
    return true;
  }

  await page.goto(INSTAGRAM_LOGIN_URL, { waitUntil: "domcontentloaded" });
  await randomDelay(1117, 1979);
  await dismissCookieBanner(page);

  const usernameInput = page.locator("input[name='email'], input[name='username']").first();
  const passwordInput = page.locator("input[name='pass'], input[name='password']").first();

  await usernameInput.waitFor({ state: "visible", timeout: 180000 });
  await typeSlowly(usernameInput, username);
  await randomDelay(1093, 1891);
  await typeSlowly(passwordInput, password);
  await randomDelay(941, 1379);

  const loginButton = page.getByRole("button", { name: "Log in" });
  await loginButton.first().click();
  try {
    await page.waitForLoadState("networkidle", { timeout: 180000 });
  } catch (e) {
    logInfo("Network did not go idle within 3 minutes, continuing anyway");
  }

  await randomDelay(1283, 2147);

  await clickIfVisible(page, ["Save info", "Save Info", "Save"]);
  await randomDelay(2000, 4000);
  await randomDelay(709, 1237);
  await clickIfVisible(page, ["Not Now", "Not now"]);
  await randomDelay(801, 1411);

  const success = await isLoggedIn(page);
  if (!success) {
    logError("Instagram login verification failed");
    return false;
  }

  logInfo("Instagram login successful");
  return true;
}

async function checkSession(page) {
  await page.goto(INSTAGRAM_HOME_URL, { waitUntil: "domcontentloaded" });
  await randomDelay(1207, 2099);
  await dismissCookieBanner(page);
  await dismissOnetapIfPresent(page);
  return isLoggedIn(page);
}

module.exports = {
  launchBrowser,
  loginToInstagram,
  checkSession
};
