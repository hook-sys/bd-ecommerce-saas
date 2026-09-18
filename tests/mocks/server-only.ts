// no-op stand-in for the "server-only" package under Vitest's plain Node
// environment. Next.js's bundler is what actually enforces the
// server/client boundary in the real app; this only exists so unit tests
// can import server-side modules without Next's build step.
export {};
