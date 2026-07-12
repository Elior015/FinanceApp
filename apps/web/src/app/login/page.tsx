import { login, requestReset } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet } from "lucide-react";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; reset?: string }>;
}) {
  const { error, reset } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-background to-muted p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-lg">
            <Wallet className="size-7" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Household Finance</h1>
          <p className="text-muted-foreground">Private finance tracker for your household</p>
        </div>

        <Card className="card-shadow">
          <CardHeader className="text-center">
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Enter your email and password to continue</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error === "recovery"
                  ? "The password-reset link was invalid or expired. Please request a new one."
                  : "Invalid email or password."}
              </p>
            )}

            {reset === "sent" && (
              <p className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                If an account exists for that email, a password-reset link is on its way.
              </p>
            )}

            <form action={login} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
              </div>

              <Button type="submit" className="w-full gradient-primary">
                Sign in
              </Button>
            </form>

            <details className="group text-sm">
              <summary className="cursor-pointer list-none text-center text-muted-foreground transition-colors hover:text-foreground">
                <span className="underline underline-offset-4">Forgot password?</span>
              </summary>
              <form action={requestReset} className="mt-4 space-y-3 border-t pt-4">
                <p className="text-muted-foreground">
                  Enter your email and we&apos;ll send a link to set a new one.
                </p>
                <Input
                  id="reset-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                />
                <Button type="submit" variant="outline" className="w-full">
                  Send reset link
                </Button>
              </form>
            </details>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
