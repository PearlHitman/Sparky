# Spark Scraper

A self-hosted tool that syncs your Instagram DMs to a Supabase database.
You run it on your own machine, it logs into **your** Instagram account, and reads **your** conversations.
No Instagram API keys needed. Fully open source.

## What It Does

Spark Scraper automates this flow:

```text
Instagram Web (your account)
          |
          v
 Playwright browser session
 (login + inbox scraping)
          |
          v
   Spark Scraper loop
 (conversations/messages/contacts)
          |
          v
   Supabase PostgreSQL
 (spark_users, conversations, messages, contacts)
```

In plain terms, it:
- logs in to Instagram with your credentials
- keeps a persistent session so you usually do not need to log in every run
- reads your inbox conversations and messages
- syncs data into Supabase tables on a recurring interval

## Requirements

- Node.js `18+`
- npm (comes with Node.js)
- A Supabase account/project
- An Instagram account you control

## Setup (Beginner Friendly)

### 1) Clone the repo

```bash
git clone <your-repo-url>
cd spark-scraper
```

### 2) Install dependencies

```bash
npm install
```

### 3) Create your environment file

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Then edit `.env`:

```env
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_KEY=your_supabase_anon_or_service_role_key
SCRAPE_INTERVAL_MIN=45
SCRAPE_INTERVAL_MAX=90
```

### 4) Set up Supabase tables

Run this SQL in your Supabase SQL editor:

```sql
-- Users (one row per Instagram account running the scraper)
create table if not exists public.spark_users (
  id uuid primary key default gen_random_uuid(),
  instagram_username text not null unique,
  updated_at timestamptz not null default now()
);

-- Contacts in the account's DM graph
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.spark_users(id) on delete cascade,
  instagram_username text not null,
  display_name text,
  profile_pic_url text,
  updated_at timestamptz not null default now(),
  unique (user_id, instagram_username)
);

-- DM threads
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.spark_users(id) on delete cascade,
  instagram_thread_id text not null unique,
  last_message_at timestamptz,
  last_message_preview text,
  updated_at timestamptz not null default now()
);

-- Messages in each thread
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

create index if not exists idx_messages_conversation_id
  on public.messages(conversation_id);

create index if not exists idx_messages_synced_at
  on public.messages(synced_at desc);
```

### 5) Start the scraper

```bash
npm start
```

### 6) Browser opens: log into Instagram

On first run, browser launches in visible mode so you can log in and complete prompts.

### 7) It keeps running automatically

After the first successful session, the scraper reuses `session-data/` and runs in the background loop.

## Run It 24/7

If you want this always-on:
- run it on a VPS and keep it as a long-running process (PM2, systemd, Docker, etc.)
- a common low-cost path is the **Oracle Cloud Always Free** VPS tier
- keep in mind Instagram may still trigger periodic checkpoints, especially from new server IPs

## Troubleshooting

### CAPTCHA or challenge screen appears

- The scraper pauses and retries later.
- If it keeps happening, run in headed mode and complete challenge manually.
- Avoid aggressive scrape intervals.

### Session expired / repeated login failures

- Delete the `session-data/` folder and restart:
  - this forces a clean login session
- confirm `INSTAGRAM_USERNAME` and `INSTAGRAM_PASSWORD` in `.env`

### Scraper suddenly stops finding inbox elements

- Instagram likely changed DOM selectors.
- Update selectors in `src/auth.js` / `src/scraper.js`.
- Run headed mode to inspect current UI and adjust locators.

## Legal Note

This tool is intended for accessing **your own Instagram data** using your own account.
Depending on your jurisdiction, this can relate to data portability and access rights (for example, GDPR access rights).
You are responsible for complying with Instagram Terms and local laws when using this software.

## Contributing

Contributions are welcome:
- open an issue for bugs or feature requests
- open a PR with a clear description and testing notes
- keep changes focused and easy to review

## License

MIT
