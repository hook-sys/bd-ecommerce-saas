import path from "node:path";
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      // Next.js's bundler is what makes "server-only" a real boundary
      // check; under plain Node (Vitest) it just throws, so tests use a
      // no-op stand-in instead.
      "server-only": path.resolve(__dirname, "tests/mocks/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      PLATFORM_ROOT_DOMAIN: "myplatform.com",
    },
  },
});
