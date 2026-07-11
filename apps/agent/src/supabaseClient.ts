import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { registerSecret } from "./log/logger.js";

let client: SupabaseClient | undefined;

/**
 * The agent is the single trusted writer and uses the service-role
 * key, which bypasses RLS entirely by design (see architecture in the
 * plan). This key must never reach the web app or any client bundle.
 */
export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }

  registerSecret(serviceRoleKey);

  client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
