# Spark Web

Next.js 16 (App Router) frontend for the Spark Instagram inbox. Reads directly
from Supabase and posts outbound messages to the Express backend at the repo
root.

## Quick start

From the repo root:

```bash
cd web
npm run dev
```

The dev server runs on [http://localhost:3000](http://localhost:3000).

The Express API (`node src/index.js` from the repo root) **must** be running on
[http://localhost:3001](http://localhost:3001) for sending messages to work. The
frontend POSTs to `/api/send-message` on that backend.

## Required env vars

Create `web/.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SPARK_API_URL=http://localhost:3001
```

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are read by the
  browser Supabase client at `src/lib/supabase.ts`. The app will throw at import
  time if either is missing.
- `NEXT_PUBLIC_SPARK_API_URL` points at the Express backend (default
  `http://localhost:3001`).

---

This project was bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started (template defaults)

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
