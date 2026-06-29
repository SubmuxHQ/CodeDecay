import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCodeDecayConfig } from "../src/index";
import { createTempDir, writeFile } from "./helpers/config";

describe("CodeDecay config product targets", () => {
  it("resolves preview product target URLs from environment without running commands", () => {
    const root = createTempDir();
    const marker = join(root, "should-not-exist");
    const previousPreviewUrl = process.env.CODEDECAY_TEST_PREVIEW_URL;
    process.env.CODEDECAY_TEST_PREVIEW_URL = "https://preview.example.test";
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    preview:",
        "      previewUrlEnv: CODEDECAY_TEST_PREVIEW_URL",
        `      startCommand: node -e \"require('fs').writeFileSync('${marker}', 'ran')\"`,
        "      healthCheck: https://preview.example.test/health",
        ""
      ].join("\n")
    );

    try {
      const loaded = loadCodeDecayConfig({ cwd: root });

      expect(existsSync(marker)).toBe(false);
      expect(loaded.config.productTesting.targets.preview).toMatchObject({
        id: "preview",
        previewUrlEnv: "CODEDECAY_TEST_PREVIEW_URL",
        healthCheck: "https://preview.example.test/health",
        timeoutMs: 60000,
        readiness: {
          status: "ready",
          mode: "preview-url-env",
          effectiveBaseUrl: "https://preview.example.test",
          commandsAllowed: false,
          willRunCommands: false
        }
      });
    } finally {
      if (previousPreviewUrl === undefined) {
        delete process.env.CODEDECAY_TEST_PREVIEW_URL;
      } else {
        process.env.CODEDECAY_TEST_PREVIEW_URL = previousPreviewUrl;
      }
    }
  });

  it("marks start-command product targets as needing command approval when commands are disallowed", () => {
    const root = createTempDir();
    writeFile(
      root,
      ".codedecay/config.yml",
      [
        "version: 1",
        "productTesting:",
        "  targets:",
        "    local:",
        "      startCommand: pnpm dev",
        "      healthCheck: http://127.0.0.1:3000/health",
        ""
      ].join("\n")
    );

    const loaded = loadCodeDecayConfig({ cwd: root });

    expect(loaded.config.productTesting.targets.local?.readiness).toMatchObject({
      status: "needs-command-approval",
      mode: "start-command",
      commandsRequired: ["pnpm dev"],
      commandsAllowed: false,
      willRunCommands: false
    });
  });
});
