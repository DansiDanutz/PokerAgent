/**
 * No-op shim for the `server-only` package under Vitest.
 *
 * `server-only` isn't a real npm dependency in this project — Next.js's
 * bundler resolves it via a build-time alias to enforce that a module is
 * never imported from client code. Vite/Vitest has no equivalent alias by
 * default, so importing modules that `import "server-only"` (e.g.
 * src/lib/auth/rateLimit.ts, src/lib/auth/cron.ts) fails to resolve in
 * tests. This shim is aliased in vitest.config.ts so those modules load
 * normally under test while the real Next.js build keeps its client/server
 * boundary enforcement untouched.
 */
export {};
