"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/env";

export async function login(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Deliberately generic — never echo back the raw Supabase error
    // (which can include details useful for account enumeration) into
    // a URL query string.
    redirect("/login?error=1");
  }

  redirect("/");
}

/**
 * Triggers Supabase's password-reset-via-email flow. Supabase sends a
 * recovery email to the given address; the link in it points back to
 * /auth/callback (PKCE), which exchanges the code for a session and
 * forwards to /reset-password where the user picks a new password.
 *
 * The redirect URL is derived from NEXT_PUBLIC_APP_URL (Vercel / production)
 * or the current request origin (local dev fallback), so the link works on
 * any deployed domain instead of being hard-coded to localhost.
 *
 * We redirect to /login?reset=sent regardless of whether the email
 * actually exists in auth.users — Supabase's resetPasswordForEmail is
 * intentionally non-revealing (it does not confirm whether the address
 * is registered), and we match that behavior on our side so the form
 * can't be used to enumerate accounts.
 */
export async function requestReset(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");

  const headersList = await headers();
  const origin =
    requireEnv("NEXT_PUBLIC_APP_URL") ??
    headersList.get("origin") ??
    "http://localhost:3000";

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback`,
  });

  redirect("/login?reset=sent");
}
