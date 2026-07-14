import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { requireEnv } from "@/lib/env";

/**
 * Auth callback — handles TWO recovery flows that both land here but carry
 * credentials differently:
 *
 * 1. PKCE (the normal "Forgot password?" email path): Supabase redirects
 *    here with a one-time `code` in the QUERY STRING (?code=...). The GET
 *    handler exchanges it for a session via exchangeCodeForSession and
 *    forwards to /reset-password.
 *
 * 2. Implicit (the admin generateLink path, used when the built-in email
 *    sender is rate-limited): GoTrue's /verify redeems the token and
 *    redirects here with access_token + refresh_token in the URL FRAGMENT
 *    (#access_token=...&refresh_token=...). The fragment is never sent to
 *    the server, so a route handler physically cannot see it. The GET
 *    handler (no `code` branch) therefore returns a tiny HTML page whose
 *    inline script reads window.location.hash and POSTs the tokens back to
 *    the POST handler below, which calls setSession server-side and sets
 *    httpOnly session cookies on the response. The script then redirects
 *    to /reset-password.
 *
 * Cookie handling: both branches build a *response-aware* Supabase client
 * (against the NextResponse we return), not the next/headers server client,
 * because both exchangeCodeForSession and setSession mint session cookies
 * that MUST be set on the outgoing response — otherwise the user would land
 * on /reset-password with no persisted session and updateUser() would fail
 * with "no session".
 *
 * This route is exempted from the middleware.ts auth gate so a logged-out
 * user clicking a recovery link can reach it — without that exemption the
 * recovery link bounced to /login and the flow dead-ended, which is the bug
 * this file was added to fix.
 */

function makeClient(request: NextRequest, response: NextResponse) {
  return createServerClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Set on the request so subsequent reads in this handler
            // see the new value, AND on the response so the browser
            // persists it.
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/reset-password";
  const origin = url.origin;

  if (code) {
    // PKCE flow: exchange the query-string code for a session.
    const response = NextResponse.redirect(`${origin}${next}`);
    const supabase = makeClient(request, response);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // Code expired / already used / tampered. Send the user back to
      // login with a generic recovery error rather than leaking the
      // raw Supabase message into the URL.
      return NextResponse.redirect(`${origin}/login?error=recovery`);
    }
    return response;
  }

  // No `code` → implicit flow. The tokens are in the URL fragment, which
  // the server can't read. Return a minimal HTML page whose inline script
  // reads the hash and POSTs the tokens to this same route's POST handler,
  // which calls setSession and sets httpOnly cookies. The script is plain
  // ASCII (no control characters) and constructs no dynamic values into
  // markup, so there's no injection surface.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Resuming sign-in…</title></head><body>\n<script>\n(function () {\n  function bail() { window.location.replace(${JSON.stringify(`${origin}/login?error=recovery`)}); }\n  var h = window.location.hash.replace(/^#/, "");\n  if (!h) { bail(); return; }\n  var p = new URLSearchParams(h);\n  var at = p.get("access_token");\n  var rt = p.get("refresh_token");\n  if (!at || !rt) { bail(); return; }\n  fetch(${JSON.stringify(`${origin}/auth/callback`)}, {\n    method: "POST",\n    headers: { "Content-Type": "application/json" },\n    body: JSON.stringify({ access_token: at, refresh_token: rt })\n  }).then(function (r) { return r.json(); }).then(function (j) {\n    if (j && j.ok) { window.location.replace(${JSON.stringify(`${origin}/reset-password`)}); }\n    else { bail(); }\n  }).catch(function () { bail(); });\n})();\n</script>\n</body></html>`;
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Implicit-flow token consumer. The inline script from GET (no `code`)
 * POSTs { access_token, refresh_token } here. We validate same-origin
 * (the tokens must come from our own callback page, not a cross-origin
 * POST — a cross-origin setSession would force-login the victim into an
 * attacker's account), then call setSession to mint httpOnly session
 * cookies on the JSON response.
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin") ?? "";
  const url = new URL(request.url);
  if (origin !== url.origin) {
    return NextResponse.json({ ok: false, error: "origin" }, { status: 403 });
  }

  let body: { access_token?: string; refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "body" }, { status: 400 });
  }
  const at = body.access_token;
  const rt = body.refresh_token;
  if (!at || !rt) {
    return NextResponse.json({ ok: false, error: "tokens" }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  const supabase = makeClient(request, response);
  const { error } = await supabase.auth.setSession({
    access_token: at,
    refresh_token: rt,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: "setSession" }, { status: 400 });
  }
  return response;
}
