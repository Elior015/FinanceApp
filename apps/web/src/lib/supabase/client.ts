import { createBrowserClient } from "@supabase/ssr";
import { requireEnv } from "../env.js";

/**
 * Browser-side Supabase client. Only ever holds the public anon key —
 * every query is scoped by RLS via the signed-in user's JWT. See the
 * architecture doc: this app never has access to the service-role key
 * used by the home-box agent.
 */
export function createClient() {
  return createBrowserClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}
