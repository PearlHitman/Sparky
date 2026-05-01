const { createClient } = require("@supabase/supabase-js");
const { logInfo, logError } = require("./utils");

const USERS_TABLE = "spark_users";
const CONTACTS_TABLE = "contacts";
const CONVERSATIONS_TABLE = "conversations";
const MESSAGES_TABLE = "messages";

let supabaseClient = null;

function initSupabase() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_KEY in environment variables");
  }

  supabaseClient = createClient(supabaseUrl, supabaseKey);
  return supabaseClient;
}

async function syncUser(instagramUsername) {
  const username = (instagramUsername || "").trim();
  if (!username) {
    throw new Error("instagramUsername is required");
  }

  const supabase = initSupabase();

  const payload = {
    instagram_username: username,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from(USERS_TABLE)
    .upsert(payload, { onConflict: "instagram_username" })
    .select("id")
    .single();

  if (error) {
    logError("Failed syncing user", error);
    throw error;
  }

  return data.id;
}

async function syncContacts(userId, contacts) {
  const contactList = Array.isArray(contacts) ? contacts : [];
  if (!userId || contactList.length === 0) {
    logInfo("Contacts synced: 0");
    return 0;
  }

  const supabase = initSupabase();
  const now = new Date().toISOString();

  const rows = contactList
    .filter((contact) => contact && contact.instagram_username)
    .map((contact) => ({
      user_id: userId,
      instagram_username: contact.instagram_username,
      full_name: contact.full_name || contact.display_name || null,
      display_name: contact.display_name || contact.full_name || null,
      profile_pic_url: contact.profile_pic_url || null,
      updated_at: now
    }));

  if (rows.length === 0) {
    logInfo("Contacts synced: 0");
    return 0;
  }

  const { error } = await supabase
    .from(CONTACTS_TABLE)
    .upsert(rows, { onConflict: "user_id,instagram_username" });

  if (error) {
    logError("Failed syncing contacts", error);
    throw error;
  }

  logInfo(`Contacts synced: ${rows.length}`);
  return rows.length;
}

async function syncConversations(userId, conversations) {
  const conversationList = Array.isArray(conversations) ? conversations : [];
  if (!userId || conversationList.length === 0) {
    logInfo("Conversations synced: 0");
    return {};
  }

  const supabase = initSupabase();
  const now = new Date().toISOString();

  const rows = conversationList
    .filter((conversation) => conversation && conversation.instagram_thread_id)
    .map((conversation) => ({
      user_id: userId,
      instagram_thread_id: conversation.instagram_thread_id,
      instagram_thread_v2_id: conversation.instagram_thread_v2_id || null,
      last_message_at: conversation.last_message_at || null,
      last_message_preview: conversation.last_message_preview || null,
      participant_usernames: conversation.participant_usernames || null,
      updated_at: now
    }));

  if (rows.length === 0) {
    logInfo("Conversations synced: 0");
    return {};
  }

  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .upsert(rows, { onConflict: "instagram_thread_id" })
    .select("id, instagram_thread_id");

  if (error) {
    logError("Failed syncing conversations", error);
    throw error;
  }

  const mapping = {};
  for (const conversation of data || []) {
    mapping[conversation.instagram_thread_id] = conversation.id;
  }

  logInfo(`Conversations synced: ${rows.length}`);
  return mapping;
}

function getMessageTimestamp(message) {
  const ts =
    message.sent_at ||
    message.timestamp ||
    message.created_at ||
    message.message_created_at ||
    null;

  if (!ts) {
    return null;
  }

  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

async function syncMessages(conversationId, messages) {
  const messageList = Array.isArray(messages) ? messages : [];
  if (!conversationId || messageList.length === 0) {
    logInfo("Messages synced: 0");
    return 0;
  }

  const supabase = initSupabase();

  const { data: latestRow, error: latestError } = await supabase
    .from(MESSAGES_TABLE)
    .select("synced_at")
    .eq("conversation_id", conversationId)
    .order("synced_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    logError("Failed querying latest synced message", latestError);
    throw latestError;
  }

  const latestSyncedAt = latestRow && latestRow.synced_at ? new Date(latestRow.synced_at) : null;
  const nowIso = new Date().toISOString();

  const rows = messageList
    .filter((message) => message && message.instagram_message_id)
    .map((message) => {
      const sentAt = getMessageTimestamp(message);
      return {
        conversation_id: conversationId,
        instagram_message_id: message.instagram_message_id,
        sender_username: message.sender_username || null,
        message_text: message.message_text || null,
        sent_at: sentAt,
        synced_at: nowIso
      };
    })
    .filter((row) => {
      if (!latestSyncedAt) {
        return true;
      }

      if (!row.sent_at) {
        return false;
      }

      return new Date(row.sent_at) > latestSyncedAt;
    });

  if (rows.length === 0) {
    logInfo("Messages synced: 0");
    return 0;
  }

  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .insert(rows, {
      onConflict: "conversation_id,instagram_message_id",
      ignoreDuplicates: true
    })
    .select("id");

  if (error) {
    logError("Failed syncing messages", error);
    throw error;
  }

  const insertedCount = (data || []).length;
  logInfo(`Messages synced: ${insertedCount}`);
  return insertedCount;
}

async function getThreadV2IdForConversation(conversationId) {
  const supabase = initSupabase();
  const { data, error } = await supabase
    .from(CONVERSATIONS_TABLE)
    .select("instagram_thread_v2_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  const raw = data ? data.instagram_thread_v2_id : null;
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = String(raw).trim();
  return trimmed.length ? trimmed : null;
}

async function recordSentMessage({ conversationId, messageText, sentAt, instagramMessageId }) {
  if (!conversationId || !messageText) {
    return null;
  }
  const supabase = initSupabase();
  const senderUsername = process.env.INSTAGRAM_USERNAME || null;
  const row = {
    conversation_id: conversationId,
    instagram_message_id:
      instagramMessageId || `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sender_username: senderUsername,
    message_text: messageText,
    sent_at: sentAt || new Date().toISOString(),
    synced_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from(MESSAGES_TABLE)
    .insert(row, { onConflict: "conversation_id,instagram_message_id", ignoreDuplicates: true })
    .select("id")
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

module.exports = {
  initSupabase,
  syncUser,
  syncContacts,
  syncConversations,
  syncMessages,
  getThreadV2IdForConversation,
  recordSentMessage
};
