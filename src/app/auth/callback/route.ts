/**
 * Google OAuth callback (Supabase Auth PKCE flow).
 *
 * Exchanges the auth code for a Supabase session just long enough to read the
 * signed-in Google identity (email, name), then finds-or-creates the matching
 * app user and sets our own `pa_session` cookie — the rest of the app never
 * touches Supabase Auth directly.
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getRepository } from "@/lib/data";
import { setSession } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";

function usernameFromEmail(email: string): string {
  const local = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 16) || "player";
  return `${local}${randomBytes(2).toString("hex")}`;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    const email = data.user?.email;

    if (!error && email) {
      const fullName =
        (data.user!.user_metadata?.full_name as string | undefined) ??
        (data.user!.user_metadata?.name as string | undefined) ??
        email.split("@")[0];

      const repo = getRepository();
      let user = await repo.findUserByEmail(email);
      if (!user) {
        // Google-authenticated accounts never use password login — lock it
        // with a hash of a random secret nobody knows.
        user = await repo.createAccount({
          username: usernameFromEmail(email),
          fullName,
          email,
          passwordHash: hashPassword(randomBytes(32).toString("hex")),
        });
      }
      await setSession(user.id);
      return NextResponse.redirect(new URL("/dashboard", url.origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=oauth", url.origin));
}
