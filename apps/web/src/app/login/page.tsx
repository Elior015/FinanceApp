import { login, requestReset } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <form action={login} className="space-y-4">
          <h1 className="text-xl font-semibold">Sign in</h1>

          {error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error === "recovery"
                ? "The password-reset link was invalid or expired. Please request a new one."
                : "Invalid email or password."}
            </p>
          )}

          {reset === "sent" && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              If an account exists for that email, a password-reset link is on
              its way.
            </p>
          )}

          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
          >
            Sign in
          </button>
        </form>

        <details className="text-sm">
          <summary className="cursor-pointer text-neutral-600">
            Forgot password?
          </summary>
          <form action={requestReset} className="mt-3 space-y-3">
            <p className="text-neutral-600">
              Enter your email and we&apos;ll send a link to set a new one.
            </p>
            <input
              id="reset-email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="w-full rounded-md border border-black px-3 py-2 text-sm font-medium text-black"
            >
              Send reset link
            </button>
          </form>
        </details>
      </div>
    </main>
  );
}
