import { resetPassword } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

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
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-lg">
            <ShieldCheck className="size-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Set your password</h1>
          <p className="text-muted-foreground">Choose a secure password for your account</p>
        </div>

        <Card className="card-shadow">
          <CardHeader className="text-center">
            <CardTitle>New password</CardTitle>
            <CardDescription>Make it at least 8 characters</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {message && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {message}
              </p>
            )}

            <form action={resetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" className="w-full gradient-primary">
                Set password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
