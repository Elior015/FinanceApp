import { resetPassword } from "./actions";

/**
 * Password-set page, reached after /auth/callback exchanges the recovery
 * code for a session. The user is authenticated at this point (the callback
 * set the session cookies), so the form's server action can call
 * `supabase.auth.updateUser({ password })` directly.
 */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const message =
    error === "weak"
      ? "Password must be at least 8 characters."
      : error === "mismatch"
        ? "Passwords do not match."
        : error === "failed"
          ? "Could not update password. The reset link may have expired — request a new one."
          : null;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <form action={resetPassword} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="text-sm text-neutral-600">
          Choose a password for your household finance account.
        </p>

        {message && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {message}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            New password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="confirm" className="text-sm font-medium">
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white"
        >
          Set password
        </button>
      </form>
    </main>
  );
}