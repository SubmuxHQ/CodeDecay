import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildReverseImportGraph,
  extractLocalImportSpecifiers,
  findReverseImportChains,
  resolveLocalImportSpecifier
} from "../src/imports/graph";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("analyzer-js import graph", () => {
  it("extracts local static, re-export, require, and dynamic import specifiers", () => {
    const specifiers = extractLocalImportSpecifiers(
      [
        "import { session } from './session';",
        "export { adapter } from '../db/adapter';",
        "export * from './events';",
        "const config = require('./config');",
        "const lazy = import('./lazy');",
        "import express from 'express';",
        ""
      ].join("\n")
    );

    expect(specifiers).toEqual(["./session", "../db/adapter", "./events", "./config", "./lazy"]);
  });

  it("resolves extensionless and index local imports against repo source files", () => {
    const repoSourceSet = new Set([
      "src/lib/session.ts",
      "src/lib/config/index.ts",
      "src/lib/events.ts"
    ]);

    expect(resolveLocalImportSpecifier("src/app/api/session/route.ts", "../../../lib/session", repoSourceSet)).toBe(
      "src/lib/session.ts"
    );
    expect(resolveLocalImportSpecifier("src/app/api/session/route.ts", "../../../lib/config", repoSourceSet)).toBe(
      "src/lib/config/index.ts"
    );
    expect(resolveLocalImportSpecifier("src/app/api/session/route.ts", "express", repoSourceSet)).toBeUndefined();
  });

  it("builds a reverse import graph from repo files while ignoring tests and build output", () => {
    const rootDir = createTempProject({
      "src/lib/session.ts": "export function loadSession() { return null; }\n",
      "src/server/session-service.ts": "import { loadSession } from '../lib/session';\nexport const getSession = loadSession;\n",
      "src/app/api/session/route.ts": "import { getSession } from '../../../server/session-service';\nexport async function GET() { return Response.json(getSession()); }\n",
      "src/app/api/session/route.test.ts": "import './route';\n",
      "dist/server/session-service.js": "import '../src/lib/session';\n"
    });

    expect(buildReverseImportGraph(rootDir)).toEqual(
      new Map([
        ["src/lib/session.ts", ["src/server/session-service.ts"]],
        ["src/server/session-service.ts", ["src/app/api/session/route.ts"]]
      ])
    );
  });

  it("finds bounded reverse import chains without looping through cycles", () => {
    const graph = new Map([
      ["src/lib/session.ts", ["src/server/session-service.ts"]],
      ["src/server/session-service.ts", ["src/app/api/session/route.ts", "src/lib/session.ts"]],
      ["src/app/api/session/route.ts", ["src/app/root.ts"]]
    ]);

    expect(findReverseImportChains("src/lib/session.ts", graph)).toEqual([
      ["src/lib/session.ts", "src/server/session-service.ts"],
      ["src/lib/session.ts", "src/server/session-service.ts", "src/app/api/session/route.ts"],
      ["src/lib/session.ts", "src/server/session-service.ts", "src/app/api/session/route.ts", "src/app/root.ts"]
    ]);
  });
});

function createTempProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "codedecay-import-graph-"));
  tempRoots.push(root);

  for (const [path, contents] of Object.entries(files)) {
    const fullPath = join(root, path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents, "utf8");
  }

  return root;
}
