"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Sets a new password from the /reset-password form. This action is only
 * reachable after /auth/callback has exchanged the recovery code for a
 * session, so by the time we get here the server client has a real user
 * and `updateUser({ password })` writes the new credential.
 *
 * Errors are mapped to short, generic query codes (not raw Supabase
 * messages) to avoid leaking account state into the URL.
 */
export async function resetPassword(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    redirect("/reset-password?error=weak");
  }
  if (password !== confirm) {
    redirect("/reset-password?error=mismatch");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    redirect("/reset-password?error=failed");
  }

  // Password changed + session is valid → straight into the app.
  redirect("/");
}