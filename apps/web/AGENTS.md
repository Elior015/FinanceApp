<!-- BEGIN:nextjs-agent-rules -->
# Next.js conventions used in this app

- Global edge middleware lives at `src/middleware.ts` and exports a
  `middleware` function. Vercel only recognizes `middleware.ts` (or
  `src/middleware.ts`); other file names are ignored.
- Server-side Supabase client creation uses `cookies()` from
  `next/headers`, which is async in Next.js 15+.
- Before relying on training-data knowledge, verify against the
  installed `node_modules/next/dist/docs/` files for this project.
<!-- END:nextjs-agent-rules -->
