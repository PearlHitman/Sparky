// check-data.js — run with: node check-data.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function check() {
  console.log("\n═══════════════════════════════════════");
  console.log("  SPARK SCRAPER — DATA CHECK");
  console.log("═══════════════════════════════════════\n");

  // 1. spark_users
  const { data: users, error: ue } = await supabase.from("spark_users").select("*");
  if (ue) console.log("❌ spark_users error:", ue.message);
  else {
    console.log(`👤 spark_users: ${users.length} row(s)`);
    users.forEach((u) => console.log(`   - ${u.instagram_username || u.id}`));
  }

  // 2. conversations
  const { data: convos, error: ce } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false });
  if (ce) console.log("❌ conversations error:", ce.message);
  else {
    console.log(`\n💬 conversations: ${convos.length} row(s)`);
    const withPreview = convos.filter((c) => c.last_message_preview);
    const withParticipants = convos.filter((c) => c.participant_usernames);
    console.log(`   - with last_message_preview: ${withPreview.length}`);
    console.log(`   - with participant_usernames: ${withParticipants.length}`);
    console.log(`\n   Latest 5:`);
    convos.slice(0, 5).forEach((c) => {
      const preview = (c.last_message_preview || "(empty)").substring(0, 50);
      const participants = c.participant_usernames || "(null)";
      console.log(`   - [${c.instagram_thread_id?.substring(0, 12)}...] "${preview}" | participants: ${participants}`);
    });
  }

  // 3. messages
  const { data: msgs, error: me } = await supabase
    .from("messages")
    .select("*")
    .order("sent_at", { ascending: false })
    .limit(50);
  if (me) console.log("❌ messages error:", me.message);
  else {
    // total count
    const { count } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true });
    console.log(`\n📩 messages: ${count} total row(s)`);
    const withText = msgs.filter((m) => m.message_text);
    const withSender = msgs.filter((m) => m.sender_username);
    console.log(`   - with message_text (of last 50): ${withText.length}`);
    console.log(`   - with sender_username (of last 50): ${withSender.length}`);
    console.log(`\n   Latest 5 messages:`);
    msgs.slice(0, 5).forEach((m) => {
      const text = (m.message_text || "(empty/media)").substring(0, 60);
      const sender = m.sender_username || "(unknown)";
      const time = m.sent_at || "(no timestamp)";
      console.log(`   - [${sender}] "${text}" @ ${time}`);
    });
  }

  // 4. contacts
  const { data: contacts, error: coe } = await supabase.from("contacts").select("*");
  if (coe) console.log("❌ contacts error:", coe.message);
  else {
    console.log(`\n📇 contacts: ${contacts.length} row(s)`);
    const withName = contacts.filter((c) => c.full_name);
    console.log(`   - with full_name: ${withName.length}`);
    console.log(`\n   Sample (first 5):`);
    contacts.slice(0, 5).forEach((c) => {
      console.log(`   - @${c.instagram_username || "(null)"} — ${c.full_name || "(no name)"}`);
    });
  }

  console.log("\n═══════════════════════════════════════\n");
}

check().catch((e) => console.error("Script error:", e));
