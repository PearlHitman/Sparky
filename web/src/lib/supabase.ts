import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL. Add it to web/.env.local before starting the app."
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. Add it to web/.env.local before starting the app."
  );
}

declare global {
  // eslint-disable-next-line no-var
  var __sparkSupabase: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
  globalThis.__sparkSupabase ??
  (globalThis.__sparkSupabase = createClient(supabaseUrl, supabaseAnonKey));
