"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
