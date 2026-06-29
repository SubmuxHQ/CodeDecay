import { existsSync } from "node:fs";
import { join } from "node:path";
import { escapeRegExp, shellQuote } from "../strings";
import type { PlaywrightCommandResult } from "./types";

export function resolveProjectPlaywrightTestCommand(
  rootDir: string,
  sourcePath: string,
  grepTitle?: string | undefined
): PlaywrightCommandResult {
  const absoluteSourcePath = join(rootDir, sourcePath);
  const grepArgs = grepTitle ? ` --grep ${shellQuote(`^${escapeRegExp(grepTitle)}$`)}` : "";
  const candidates = [
    join(rootDir, "node_modules", "playwright", "cli.js"),
    join(rootDir, "node_modules", "@playwright", "test", "cli.js")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return {
        ok: true,
        command: `${shellQuote(process.execPath)} ${shellQuote(candidate)} test ${shellQuote(absoluteSourcePath)} --reporter=json${grepArgs}`
      };
    }
  }

  const bin = join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "playwright.cmd" : "playwright");
  if (existsSync(bin)) {
    return {
      ok: true,
      command: `${shellQuote(bin)} test ${shellQuote(absoluteSourcePath)} --reporter=json${grepArgs}`
    };
  }

  return {
    ok: false,
    error: "Could not find a project-local Playwright CLI in node_modules/playwright, node_modules/@playwright/test, or node_modules/.bin."
  };
}
