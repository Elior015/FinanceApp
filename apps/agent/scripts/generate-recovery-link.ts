/**
 * One-off: generates a password-recovery link for Elior's auth account via
 * the Supabase admin API and opens it directly in the default browser.
 *
 * WHY THIS EXISTS:
 * Supabase's free-tier built-in email sender is rate-limited
 * (429 `over_email_send_rate_limit`). The normal "Forgot password?" flow
 * (`POST /recover`) sends an email, so once the rate limit is hit no reset
 * email is dispatched and the user is stuck. `admin.generateLink` returns
 * the *same* recovery link in the API response without triggering
 * `mail.send`, so it bypasses the email rate limit entirely.
 *
 * WHAT THIS DOES NOT DO:
 * It does NOT mint a session and does NOT set a password. It only produces
 * the one-time recovery link and opens it. Clicking the link runs the real
 * recovery flow, but NOTE the flow is IMPLICIT, not PKCE: GoTrue /verify
 * redeems the token and redirects to /auth/callback with access_token +
 * refresh_token in the URL *fragment* (#access_token=...), not a ?code=
 * query param. /auth/callback's GET handler (no `code` branch) returns a
 * tiny HTML page whose inline script reads the hash and POSTs the tokens
 * to the callback's POST handler, which calls setSession server-side and
 * sets httpOnly cookies, then forwards to /reset-password — where the user
 * picks their own password via `updateUser({ password })`. The actual
 * credential is still set by the user through the real UI; this script
 * only substitutes for the rate-limited email *delivery* channel.
 * (Auth logs confirmed `login_method: implicit` on the /verify 303, which
 * is why the PKCE-only callback originally dropped the fragment and the
 * flow dead-ended — see /auth/callback/route.ts for the dual-flow fix.)
 *
 * The action_link is a one-time bearer token, so we never print it to
 * stdout (which would land it in the conversation log); we hand it
 * straight to `open` so the browser consumes it immediately.
 *
 * Run: `pnpm exec tsx scripts/generate-recovery-link.ts`
 */
try {
  process.loadEnvFile();
} catch {
  // no .env file present
}

import { execFileSync } from "node:child_process";
import { getSupabaseClient } from "../src/supabaseClient.js";

const ELIOR_EMAIL = "elior015@gmail.com";
const REDIRECT_TO = "http://localhost:3000/auth/callback";

async function main() {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email: ELIOR_EMAIL,
    options: { redirectTo: REDIRECT_TO },
  });

  if (error) {
    console.error(`generateLink failed: ${error.message}`);
    process.exit(1);
  }

  const actionLink = data.properties?.action_link;
  if (!actionLink) {
    console.error("generateLink returned no action_link");
    process.exit(1);
  }

  // Sanity-check the link structure WITHOUT printing the token: confirm it
  // targets our project's /verify endpoint and carries a redirect back to
  // the local callback. This is the diagnostic that tells us whether the
  // link will route through /auth/callback (PKCE code exchange) as expected.
  const parsed = new URL(actionLink);
  const params = [...parsed.searchParams.keys()];
  console.log(
    `link host: ${parsed.host}${parsed.pathname} | params: ${params.join(",")} | redirect_to=${parsed.searchParams.get("redirect_to") ?? "(none)"}`,
  );

  if (process.argv.includes("--print")) {
    // Escape hatch: explicitly opt into printing the raw link (e.g. if
    // `open` can't launch a browser). Off by default to keep the bearer
    // token out of logs.
    console.log(`\naction_link:\n${actionLink}`);
  } else {
    // darwin: `open <url>` launches the default browser at the URL.
    // execFileSync (not execSync) so the URL is passed as a single argv
    // element with no shell — no risk of shell metacharacters in the link
    // being interpreted, even though the link comes from Supabase's API.
    execFileSync("open", [actionLink], { stdio: "ignore" });
    console.log(
      `\nOpened the recovery link in your default browser.\n` +
        `It should redirect through Supabase /verify → http://localhost:3000/auth/callback\n` +
        `and land on /reset-password, where you can set your password.\n` +
        `If nothing happens, re-run with --print to get the raw link.`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});