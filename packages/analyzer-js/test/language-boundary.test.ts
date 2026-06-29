import { describe, expect, it } from "vitest";
import { analyzeJsProject } from "../src/index";
import { classifyLanguageSupport } from "../src/language/support";
import { change, createTempProject } from "./helpers/integration";

describe("analyzer-js language boundary", () => {
  it("classifies JS/TS files as parser-supported and Python files as limited", () => {
    expect(classifyLanguageSupport("src/api/users.ts")).toEqual(
      expect.objectContaining({
        language: "typescript",
        status: "supported",
        parser: "typescript-estree"
      })
    );
    expect(classifyLanguageSupport("src/auth.py")).toEqual(
      expect.objectContaining({
        language: "python",
        status: "limited",
        parser: "none"
      })
    );
  });

  it("reports limited source files without sending them through JS/TS parser-backed scanners", () => {
    const rootDir = createTempProject({
      "src/api/proxy.ts": "export async function GET(req) { return fetch(req.query.url); }",
      "src/auth.py": "def refresh_token(token):\n    return token\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/api/proxy.ts", "export async function GET(req) { return fetch(req.query.url); }"),
        change("src/auth.py", "def refresh_token(token):")
      ]
    });

    expect(result.languageAnalysis?.supportedFiles).toEqual(["src/api/proxy.ts"]);
    expect(result.languageAnalysis?.limitedFiles).toEqual(["src/auth.py"]);
    expect(result.securityAnalysis?.scannedFiles).toEqual(["src/api/proxy.ts"]);
    expect(result.securityCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "security-ssrf",
          file: "src/api/proxy.ts"
        })
      ])
    );
    expect(result.securityCandidates ?? []).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "src/auth.py"
        })
      ])
    );
  });
});
