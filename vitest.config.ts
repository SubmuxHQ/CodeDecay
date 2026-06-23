import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts"],
    globals: true
  },
  resolve: {
    alias: {
      "@submuxhq/codedecay-core": fromRoot("./packages/core/src/index.ts"),
      "@submuxhq/codedecay-config": fromRoot("./packages/config/src/index.ts"),
      "@submuxhq/codedecay-adapters": fromRoot("./packages/adapters/src/index.ts"),
      "@submuxhq/codedecay-git": fromRoot("./packages/git/src/index.ts"),
      "@submuxhq/codedecay-analyzer-js": fromRoot("./packages/analyzer-js/src/index.ts"),
      "@submuxhq/codedecay-report": fromRoot("./packages/report/src/index.ts")
    }
  }
});
