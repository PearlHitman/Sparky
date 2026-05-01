const { randomDelay, logInfo, logError } = require("./utils");

async function sendDirectMessage(page, threadId, text) {
  try {
    if (!page) {
      throw new Error("A Playwright page is required");
    }

    const normalizedThreadId = String(threadId || "").trim();
    const normalizedText = String(text || "").trim();

    if (!normalizedThreadId) {
      throw new Error("threadId is required");
    }

    if (!normalizedText) {
      throw new Error("text is required");
    }

    logInfo("Sending direct message", { threadId: normalizedThreadId });
    await randomDelay(800, 2200);

    const targetUrl = `https://www.instagram.com/direct/t/${encodeURIComponent(normalizedThreadId)}/`;
    const currentUrl = page.url();
    if (currentUrl !== targetUrl) {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await randomDelay(2000, 3500);
    }

    const composeSelector = 'div[contenteditable="true"][role="textbox"]';
    const composeBox = page.locator(composeSelector).last();
    await composeBox.waitFor({ state: "visible", timeout: 20000 });

    await composeBox.click();
    await randomDelay(300, 700);
    for (const char of normalizedText) {
      await page.keyboard.type(char, { delay: 0 });
      await new Promise((resolve) => setTimeout(resolve, 30 + Math.floor(Math.random() * 80)));
    }
    await randomDelay(400, 900);

    await page.keyboard.press("Enter");

    try {
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelectorAll(sel);
          const last = el[el.length - 1];
          return last && (last.textContent || "").trim() === "";
        },
        composeSelector,
        { timeout: 15000 }
      );
    } catch (_e) {
      throw new Error("Message did not appear to send (compose box did not clear)");
    }

    logInfo("Direct message sent", { threadId: normalizedThreadId });
    return {
      instagram_message_id: null,
      client_context: null,
      sent_at: new Date().toISOString()
    };
  } catch (error) {
    logError(`[sender] sendDirectMessage failed for thread ${threadId}`, error);
    throw error;
  }
}

module.exports = {
  sendDirectMessage
};
