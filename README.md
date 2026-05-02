# Sparky

**Your Instagram DMs. Your way. Your server.**

Sparky is a self-hosted Instagram DM client. It scrapes your inbox using browser automation, stores everything in your own Supabase database, and gives you a clean messaging UI to read and reply — no Instagram app required.

No Meta API. No third-party servers. No algorithm. Just your conversations, in a UI you control.

---

## Why

Instagram's DM experience is buried inside an app designed to keep you scrolling. There's no desktop-first client, no way to export your messages, and no open API for your own data.

Sparky flips that. You run it, you own the data, you read and reply from a minimal interface that gets out of the way.

---

## What It Does

```
Instagram Web (your account)
          │
          ▼
  Playwright browser session
  (login + inbox scraping)
          │
          ▼
    Supabase PostgreSQL
(conversations · messages · contacts)
          │
          ▼
    Spark Web UI
  (inbox · thread view · send)
```

- Logs into Instagram with your credentials and keeps a persistent session
- Scrapes your inbox on a configurable interval (default: 45–90 min)
- Syncs conversations, messages, and contacts to Supabase
- Serves a real-time web UI where you can read threads and send replies
- Sends messages back through the same Playwright session

---

## Stack

| Layer | Tech |
|-------|------|
| Scraper | Node.js + Playwright |
| Database | Supabase (PostgreSQL + Realtime) |
| Web UI | Next.js (App Router) + Tailwind |
| Backend API | Express |

---

## Setup

### 1. Clone

```bash
git clone https://github.com/PearlHitman/Sparky.git
cd Sparky
```

### 2. Install dependencies

```bash
npm install
cd web && npm install && cd ..
```

### 3. Create your Supabase tables

Run this SQL in your Supabase SQL editor:

```sql
create table if not exists public.spark_users (
  id uuid primary key default gen_random_uuid(),
  instagram_username text not null unique,
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.spark_users(id) on delete cascade,
  instagram_username text not null,
  display_name text,
  profile_pic_url text,
  updated_at timestamptz not null default now(),
  unique (user_id, instagram_username)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.spark_users(id) on delete cascade,
  instagram_thread_id text not null unique,
  last_message_at timestamptz,
  last_message_preview text,
  participant_usernames text,
  updated_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  instagram_message_id text not null,
  sender_username text,
  message_text text,
  sent_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (conversation_id, instagram_message_id)
);

create index if not exists idx_messages_conversation_id on public.messages(conversation_id);
create index if not exists idx_messages_synced_at on public.messages(synced_at desc);
```

### 4. Configure environment

Root scraper — copy and fill in `.env`:

```bash
cp .env.example .env
```

```env
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your_supabase_anon_key
SCRAPE_INTERVAL_MIN=45
SCRAPE_INTERVAL_MAX=90
```

Web UI — create `web/.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_SPARK_API_URL=http://localhost:3001
NEXT_PUBLIC_INSTAGRAM_USERNAME=your_instagram_username
```

### 5. First run

Start the scraper (opens a visible browser on first launch so you can log in):

```bash
npm start
```

Complete any Instagram login prompts. After that, sessions are saved and the scraper runs headlessly in the background.

### 6. Start the web UI

In a second terminal:

```bash
cd web && npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Running 24/7

For always-on use, run on a VPS and keep processes alive with PM2 or systemd:

```bash
npm install -g pm2
pm2 start src/index.js --name sparky-scraper
pm2 start "npm run start" --name sparky-web --cwd ./web
pm2 save
```

Oracle Cloud Always Free tier works well for this. Keep in mind Instagram may trigger periodic login challenges from unfamiliar IPs.

---

## Troubleshooting

**CAPTCHA or challenge screen** — the scraper pauses and retries. Run headed (`HEADLESS=false`) and solve manually if it keeps happening.

**Session expired** — delete `session-data/` and restart. This forces a fresh login.

**Inbox elements not found** — Instagram changed their DOM. Update selectors in `src/auth.js` and `src/scraper.js`. Run headed to inspect.

---

## Legal

This tool accesses your own Instagram account and your own data. Depending on your jurisdiction this may relate to data portability rights (e.g. GDPR Art. 20). You are responsible for complying with Instagram's Terms of Service and applicable law.

---

## License

MIT
