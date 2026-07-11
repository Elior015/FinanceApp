import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase auth session on every request. Named `proxy`
 * (not `middleware`) and living at src/proxy.ts — Next.js renamed the
 * middleware.ts file convention to proxy.ts as of v16 (middleware.ts
 * is deprecated); see node_modules/next/dist/docs/01-app/03-api-
 * reference/03-file-conventions/proxy.md. The Supabase logic itself
 * (cookie-forwarding createServerClient + getUser()) is unchanged from
 * the classic middleware pattern.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Required: this call refreshes the session and must not be
  // removed or optimized away, even though its return value looks
  // unused here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Public routes that must be reachable without a session:
  //  - /login: the auth page itself
  //  - /auth/callback: the PKCE recovery/verify redirect target. It is
  //    hit by a *logged-out* user clicking the password-reset email
  //    link; the route handler exchanges the `code` for a session there.
  //    If we gated it, the recovery link would bounce to /login and the
  //    code would never be exchanged — which is exactly the dead-end the
  //    password-reset flow used to hit before this exemption existed.
  const isAuthRoute =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/auth/callback");

  if (!user && !isAuthRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
