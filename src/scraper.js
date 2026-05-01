const fs = require("fs/promises");
const path = require("path");

const INSTAGRAM_INBOX_URL = "https://www.instagram.com/direct/inbox/";
const INSTAGRAM_BASE_URL = "https://www.instagram.com";
const INBOX_API_PATH = "/api/v1/direct_v2/inbox/";
const THREADS_API_PATH = "/api/v1/direct_v2/threads/";

function toIsoFromMicroseconds(timestamp) {
  if (!timestamp) {
    return null;
  }

  const parsed = Number.parseInt(String(timestamp), 10);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed / 1000).toISOString();
}

function isOkJsonResponse(response) {
  if (!response.ok()) {
    return false;
  }

  const contentType = response.headers()["content-type"] || "";
  return contentType.toLowerCase().includes("application/json");
}

function buildUserLookup(thread) {
  const users = Array.isArray(thread && thread.users) ? thread.users : [];
  const inviter = thread && thread.inviter ? thread.inviter : null;
  const allUsers = inviter ? [...users, inviter] : users;

  const userMap = new Map();
  for (const user of allUsers) {
    if (!user || !user.pk) {
      continue;
    }

    const key = String(user.pk);
    if (!userMap.has(key)) {
      userMap.set(key, user);
    }
  }

  return userMap;
}

function resolveInstagramThreadV2Id(thread) {
  if (!thread) {
    return null;
  }
  const raw =
    thread.thread_v2_id ??
    thread.thread_v2_id_str ??
    thread.viewer_id ??
    null;
  if (raw === null || raw === undefined) {
    return null;
  }
  const s = String(raw).trim();
  return s.length ? s : null;
}

function mapThreadToConversation(thread) {
  const userMap = buildUserLookup(thread);
  const participants = Array.from(userMap.values())
    .map((user) => ({
      instagram_username: user && user.username ? user.username : "",
      full_name: user && user.full_name ? user.full_name : "",
      profile_pic_url: user && user.profile_pic_url ? user.profile_pic_url : ""
    }))
    .filter((user) => user.instagram_username);

  const participantUsernames = participants
    .map((participant) => participant.instagram_username)
    .filter(Boolean)
    .join(",");

  return {
    instagram_thread_id: thread.thread_id,
    instagram_thread_v2_id: resolveInstagramThreadV2Id(thread),
    last_message_preview: (thread.last_permanent_item && thread.last_permanent_item.text) || "",
    last_message_at: toIsoFromMicroseconds(
      thread.last_permanent_item && thread.last_permanent_item.timestamp
    ),
    participant_usernames: participantUsernames,
    participants
  };
}

function mapThreadItemsToMessages(threadData) {
  const thread = threadData && threadData.thread ? threadData.thread : {};
  const items = Array.isArray(thread.items) ? thread.items : [];
  const userMap = buildUserLookup(thread);

  return items
    .filter((item) => item && item.item_id)
    .map((item) => {
      const sender = item.user_id ? userMap.get(String(item.user_id)) : null;
      return {
        instagram_message_id: item.item_id,
        message_text: item.text || "",
        sender_username: sender && sender.username ? sender.username : null,
        sent_at: toIsoFromMicroseconds(item.timestamp)
      };
    });
}

async function fetchInboxViaEvaluate(page) {
  return page.evaluate(async ({ baseUrl, appId }) => {
    const response = await fetch(`${baseUrl}/api/v1/direct_v2/inbox/?limit=20`, {
      method: "GET",
      headers: {
        "x-ig-app-id": appId,
        "x-requested-with": "XMLHttpRequest"
      },
      credentials: "include"
    });

    if (!response.ok) {
      throw new Error(`Inbox fetch failed with status ${response.status}`);
    }

    return response.json();
  }, { baseUrl: INSTAGRAM_BASE_URL, appId: "936619743392459" });
}

async function fetchThreadViaEvaluate(page, threadId) {
  return page.evaluate(async ({ baseUrl, appId, tid }) => {
    const response = await fetch(
      `${baseUrl}/api/v1/direct_v2/threads/${tid}/?visual_message_return_type=unsupported`,
      {
        method: "GET",
        headers: {
          "x-ig-app-id": appId,
          "x-requested-with": "XMLHttpRequest"
        },
        credentials: "include"
      }
    );

    if (!response.ok) {
      throw new Error(`Thread fetch failed with status ${response.status}`);
    }

    return response.json();
  }, { baseUrl: INSTAGRAM_BASE_URL, appId: "936619743392459", tid: threadId });
}

async function scrapeConversations(page) {
  let inboxData = null;
  let inboxResolver;
  let inboxRejecter;
  const inboxPromise = new Promise((resolve, reject) => {
    inboxResolver = resolve;
    inboxRejecter = reject;
  });

  const onResponse = async (response) => {
    try {
      const url = response.url();
      if (!url.includes(INBOX_API_PATH)) {
        return;
      }

      if (!isOkJsonResponse(response)) {
        return;
      }

      const json = await response.json();
      if (!inboxData) {
        inboxData = json;
        inboxResolver(json);
      }
    } catch (error) {
      inboxRejecter(error);
    }
  };

  try {
    if (!page) {
      throw new Error("A Playwright page is required");
    }

    page.on("response", onResponse);
    await page.goto(INSTAGRAM_INBOX_URL, {
      waitUntil: "domcontentloaded",
      timeout: 60000
    });
    await page.waitForTimeout(10000);

    const screenshotPath = path.resolve(process.cwd(), "debug-inbox.png");
    const htmlPath = path.resolve(process.cwd(), "debug-inbox.html");

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const html = await page.content();
    await fs.writeFile(htmlPath, html, "utf8");
    console.log("Debug files saved — check debug-inbox.png and debug-inbox.html");

    if (!inboxData) {
      inboxData = await Promise.race([
        inboxPromise,
        page.waitForTimeout(1500).then(() => null)
      ]);
    }

    if (!inboxData) {
      inboxData = await fetchInboxViaEvaluate(page);
    }

    const threads =
      inboxData &&
      inboxData.inbox &&
      Array.isArray(inboxData.inbox.threads)
        ? inboxData.inbox.threads
        : [];

    const mapped = threads
      .filter((thread) => thread && thread.thread_id)
      .map(mapThreadToConversation);

    if (
      mapped.length > 0 &&
      mapped.every((conversation) => !conversation.instagram_thread_v2_id)
    ) {
      console.log(
        "[scraper] Every thread in inbox scrape is missing instagram_thread_v2_id; check API payload field names."
      );
    }

    return mapped;
  } catch (error) {
    console.error("[scraper] scrapeConversations failed:", error);
    return [];
  } finally {
    page.off("response", onResponse);
  }
}

async function scrapeDirectMessages(page, options = {}) {
  try {
    const mode = options.mode || "inbox";
    if (mode === "thread") {
      if (!page) {
        throw new Error("A Playwright page is required");
      }

      const conversation = options.conversation || {};
      const threadId = conversation.instagram_thread_id;
      if (!threadId) {
        return [];
      }

      let threadData = null;
      let threadResolver;
      let threadRejecter;
      const threadPromise = new Promise((resolve, reject) => {
        threadResolver = resolve;
        threadRejecter = reject;
      });

      const onResponse = async (response) => {
        try {
          const url = response.url();
          if (!url.includes(`${THREADS_API_PATH}${threadId}/`)) {
            return;
          }

          if (!isOkJsonResponse(response)) {
            return;
          }

          const json = await response.json();
          if (!threadData) {
            threadData = json;
            threadResolver(json);
          }
        } catch (error) {
          threadRejecter(error);
        }
      };

      page.on("response", onResponse);
      try {
        await page.goto(`${INSTAGRAM_BASE_URL}/direct/t/${threadId}/`, {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
        await page.waitForTimeout(8000);

        if (!threadData) {
          threadData = await Promise.race([
            threadPromise,
            page.waitForTimeout(1500).then(() => null)
          ]);
        }

        if (!threadData) {
          threadData = await fetchThreadViaEvaluate(page, threadId);
        }

        return mapThreadItemsToMessages(threadData);
      } finally {
        page.off("response", onResponse);
      }
    }

    return scrapeConversations(page);
  } catch (error) {
    console.error("[scraper] scrapeDirectMessages failed:", error);
    return [];
  }
}

function scrapeContacts(_page, conversations = []) {
  try {
    const byUsername = new Map();
    const list = Array.isArray(conversations) ? conversations : [];

    for (const conversation of list) {
      const participants = Array.isArray(conversation && conversation.participants)
        ? conversation.participants
        : [];

      for (const participant of participants) {
        const username = participant && participant.instagram_username;
        if (!username) {
          continue;
        }

        byUsername.set(username, {
          instagram_username: username,
          full_name: participant.full_name || "",
          profile_pic_url: participant.profile_pic_url || ""
        });
      }
    }

    return Array.from(byUsername.values());
  } catch (error) {
    console.error("[scraper] scrapeContacts failed:", error);
    return [];
  }
}

module.exports = {
  scrapeConversations,
  scrapeDirectMessages,
  scrapeContacts
};
