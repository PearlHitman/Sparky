require("dotenv").config();

const cors = require("cors");
const express = require("express");

const { launchBrowser, loginToInstagram, checkSession } = require("./auth");
const { scrapeDirectMessages, scrapeContacts } = require("./scraper");
const { sendDirectMessage } = require("./sender");
const {
  initSupabase,
  syncUser,
  syncContacts,
  syncConversations,
  syncMessages,
  getThreadV2IdForConversation,
  recordSentMessage
} = require("./supabase");
const { randomInt, randomDelay, logInfo, logError } = require("./utils");

const CHALLENGE_DELAY_MS = 601237;

let shouldStop = false;
let browserContext = null;
let activePage = null;
let httpServer = null;
let shutdownInProgress = false;

function parseIntervalSeconds(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function isChallengePage(page) {
  const url = page.url().toLowerCase();
  return (
    url.includes("/challenge/") ||
    url.includes("captcha") ||
    url.includes("/checkpoint/")
  );
}

async function pauseForChallenge(page) {
  if (!isChallengePage(page)) {
    return false;
  }

  logInfo("Instagram challenge/captcha detected. Pausing for 10 minutes before retry.");
  await new Promise((resolve) => setTimeout(resolve, CHALLENGE_DELAY_MS));
  return true;
}

function extractContactsFromConversations(conversations) {
  const byUsername = new Map();
  const list = Array.isArray(conversations) ? conversations : [];

  for (const conversation of list) {
    const participants = Array.isArray(conversation.participants)
      ? conversation.participants
      : [];

    for (const participant of participants) {
      const username = participant && participant.instagram_username;
      if (!username) {
        continue;
      }

      byUsername.set(username, {
        instagram_username: username,
        full_name: participant.full_name || null,
        display_name: participant.full_name || null,
        profile_pic_url: participant.profile_pic_url || null
      });
    }
  }

  return Array.from(byUsername.values());
}

async function getStoredConversationPreviews(threadIds) {
  if (!threadIds.length) {
    return {};
  }

  const supabase = initSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("instagram_thread_id,last_message_preview")
    .in("instagram_thread_id", threadIds);

  if (error) {
    throw error;
  }

  const map = {};
  for (const row of data || []) {
    map[row.instagram_thread_id] = row.last_message_preview || null;
  }
  return map;
}

function hasNewPreview(currentPreview, storedPreview) {
  return (currentPreview || null) !== (storedPreview || null);
}

async function scrapeThreadMessages(page, conversation) {
  if (typeof scrapeDirectMessages !== "function") {
    return [];
  }

  const result = await scrapeDirectMessages(page, {
    mode: "thread",
    conversation
  });

  if (Array.isArray(result)) {
    return result;
  }

  if (result && Array.isArray(result.messages)) {
    return result.messages;
  }

  return [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function startApiServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      browserReady: activePage !== null
    });
  });

  app.post("/api/send-message", async (req, res) => {
    try {
      const { conversationId, text } = req.body || {};
      if (!isNonEmptyString(conversationId)) {
        return res.status(400).json({ error: "conversationId is required" });
      }
      if (!isNonEmptyString(text)) {
        return res.status(400).json({ error: "text is required" });
      }
      if (!activePage) {
        return res.status(503).json({ error: "Browser session not ready" });
      }

      const threadV2Id = await getThreadV2IdForConversation(conversationId.trim());
      if (!threadV2Id) {
        return res.status(503).json({
          error:
            "Thread ID v2 not yet synced for this conversation. Wait for next scrape cycle and try again."
        });
      }

      const sendResult = await sendDirectMessage(activePage, threadV2Id, text);

      await recordSentMessage({
        conversationId: conversationId.trim(),
        messageText: text.trim(),
        sentAt: sendResult.sent_at,
        instagramMessageId: sendResult.instagram_message_id
      });

      return res.json({
        conversationId: conversationId.trim(),
        instagram_message_id: sendResult.instagram_message_id,
        client_context: sendResult.client_context,
        sent_at: sendResult.sent_at
      });
    } catch (error) {
      logError("POST /api/send-message failed", error);
      return res.status(500).json({ error: error.message });
    }
  });

  const port = Number(process.env.SPARK_PORT) || 3001;
  httpServer = app.listen(port, () => {
    logInfo(`Spark API listening on port ${port}`);
  });
}

async function gracefulShutdown(exitCode = 0) {
  if (shutdownInProgress) {
    return;
  }
  shutdownInProgress = true;
  shouldStop = true;

  if (httpServer) {
    await new Promise((resolve) => {
      httpServer.close(() => resolve());
    }).catch(() => {});
    httpServer = null;
  }

  activePage = null;
  if (browserContext) {
    await browserContext.close().catch(() => {});
    browserContext = null;
  }
  logInfo("Scraper stopped");
  process.exit(exitCode);
}

function setupSignalHandlers() {
  process.on("SIGINT", () => {
    gracefulShutdown(0).catch((error) => {
      logError("Shutdown failed", error);
      process.exit(1);
    });
  });
}

async function runScrapingLoop() {
  const username = process.env.INSTAGRAM_USERNAME || "unknown";
  const minSeconds = parseIntervalSeconds(process.env.SCRAPE_INTERVAL_MIN, 45);
  const maxSeconds = parseIntervalSeconds(process.env.SCRAPE_INTERVAL_MAX, 90);
  const intervalMin = Math.min(minSeconds, maxSeconds);
  const intervalMax = Math.max(minSeconds, maxSeconds);

  console.log("⚡ Spark scraper running");
  console.log(`  Account: ${username}`);
  console.log(`  Interval: ${intervalMin}-${intervalMax}s`);
  console.log("  Press Ctrl+C to stop");

  const { context, page } = await launchBrowser();
  browserContext = context;
  initSupabase();

  let loginFailuresInRow = 0;
  let authenticated = await loginToInstagram(page);
  if (!authenticated) {
    loginFailuresInRow += 1;
  }

  while (!shouldStop && !authenticated && loginFailuresInRow < 3) {
    await randomDelay(1397, 2731);
    authenticated = await loginToInstagram(page);
    if (authenticated) {
      break;
    }
    loginFailuresInRow += 1;
  }

  if (!authenticated) {
    throw new Error(
      "Login failed 3 times in a row. Delete session-data/ and restart the scraper."
    );
  }

  activePage = page;
  const userId = await syncUser(username);

  while (!shouldStop) {
    try {
      if (await pauseForChallenge(page)) {
        continue;
      }

      const sessionValid = await checkSession(page);
      if (!sessionValid) {
        logInfo("Session invalid, attempting re-login");
        let reloginSuccess = false;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          if (await pauseForChallenge(page)) {
            break;
          }

          const ok = await loginToInstagram(page);
          if (ok) {
            reloginSuccess = true;
            loginFailuresInRow = 0;
            break;
          }

          loginFailuresInRow += 1;
          logError(`Re-login failed (${attempt}/3)`);
          await randomDelay(1211, 2197);
        }

        if (!reloginSuccess) {
          throw new Error(
            "Login failed 3 times in a row. Delete session-data/ and restart the scraper."
          );
        }
      }

      const inboxResult = await scrapeDirectMessages(page);
      const conversations = Array.isArray(inboxResult)
        ? inboxResult
        : inboxResult && Array.isArray(inboxResult.conversations)
          ? inboxResult.conversations
          : [];

      const threadIds = conversations
        .map((conversation) => conversation.instagram_thread_id)
        .filter(Boolean);
      const storedPreviews = await getStoredConversationPreviews(threadIds);

      const conversationIdMap = await syncConversations(userId, conversations);

      let totalNewMessages = 0;
      let updatedConversations = 0;

      for (const conversation of conversations) {
        const threadId = conversation.instagram_thread_id;
        if (!threadId) {
          continue;
        }

        const currentPreview = conversation.last_message_preview || null;
        const storedPreview = storedPreviews[threadId];
        if (!hasNewPreview(currentPreview, storedPreview)) {
          continue;
        }

        const conversationId = conversationIdMap[threadId];
        if (!conversationId) {
          continue;
        }

        const threadMessages = await scrapeThreadMessages(page, conversation);
        const insertedCount = await syncMessages(conversationId, threadMessages);
        totalNewMessages += insertedCount;
        if (insertedCount > 0) {
          updatedConversations += 1;
        }
      }

      let contacts = extractContactsFromConversations(conversations);
      if (!contacts.length && typeof scrapeContacts === "function") {
        const scrapedContacts = await scrapeContacts(page, conversations);
        contacts = Array.isArray(scrapedContacts) ? scrapedContacts : [];
      }
      await syncContacts(userId, contacts);

      logInfo(
        `Synced ${totalNewMessages} new messages across ${updatedConversations} conversations`
      );
    } catch (error) {
      const message = String(error && error.message ? error.message : error);
      logError("Cycle failed, skipping to next interval", error);

      if (message.includes("Delete session-data/")) {
        activePage = null;
        if (browserContext) {
          await browserContext.close().catch(() => {});
          browserContext = null;
        }
        throw error;
      }
    }

    const waitSeconds = randomInt(intervalMin, intervalMax);
    logInfo(`Waiting ${waitSeconds}s before next cycle`);
    await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
  }
}

module.exports = {
  runScrapingLoop
};

if (require.main === module) {
  setupSignalHandlers();
  startApiServer();
  runScrapingLoop().catch(async (error) => {
    logError("Fatal scraper error", error);
    await gracefulShutdown(1);
  });
}
