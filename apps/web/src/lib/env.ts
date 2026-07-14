export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Make sure it is set in .env.local (local dev) or in the Vercel dashboard (production).`,
    );
  }
  return value;
}
