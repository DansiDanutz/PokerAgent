/**
 * Browser-side Supabase client — used only to kick off OAuth sign-in
 * (`signInWithOAuth`). The app's own session cookie (see `lib/auth/session`)
 * is what actually gates access afterward; this client never touches app data.
 */

import { createBrowserClient } from "@supabase/ssr";

export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }
  return createBrowserClient(url, key);
}
