import { createServerClient, type SetAllCookies } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server-side Supabase client for Server Components / Server
 * Functions / Route Handlers. `cookies()` is async in this Next.js
 * version (unchanged from 15). Cookie writes here can be a no-op when
 * called from a Server Component that can't set cookies (Next will
 * throw if you try) — that's fine as long as proxy.ts is refreshing
 * the session on every request, which is what actually keeps auth
 * alive.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component with no way to set
            // cookies — safe to ignore as long as proxy.ts is also
            // refreshing the session.
          }
        },
      },
    },
  );
}
