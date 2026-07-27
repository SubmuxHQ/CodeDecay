import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

describe("demo scripts", () => {
  it("accepts pnpm-style argument separators for the end-user harness", () => {
    const output = execFileSync("node", ["scripts/end-user-demo.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/end-user-demo.mjs");
  });

  it("accepts pnpm-style argument separators for the published-package harness", () => {
    const output = execFileSync("node", ["scripts/published-package-demo.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/published-package-demo.mjs");
  });

  it("documents the installed child-repository E2E harness", () => {
    const output = execFileSync("node", ["scripts/child-repo-e2e.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/child-repo-e2e.mjs");
    expect(output).toContain("independent git repository");
    expect(output).toContain("real execution, browser, MCP, Action, differential, and repair-loop paths");
  });

  it("accepts pnpm-style argument separators for the PR safety eval harness", () => {
    const output = execFileSync("node", ["scripts/pr-safety-eval.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/pr-safety-eval.mjs");
  });

  it("documents the opt-in real OSS adapter E2E harness", () => {
    const output = execFileSync("node", ["scripts/real-oss-adapter-e2e.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/real-oss-adapter-e2e.mjs");
    expect(output).toContain("Playwright");
    expect(output).toContain("Schemathesis");
    expect(output).toContain("This is opt-in");
  });

  it("documents the isolated hackathon auth fixture", () => {
    const output = execFileSync("node", ["scripts/hackathon-demo/setup.mjs", "--", "--help"], {
      cwd: repoRoot,
      encoding: "utf8"
    });

    expect(output).toContain("Usage: node scripts/hackathon-demo/setup.mjs");
    expect(output).toContain("isolated git repository");
  });

  it("refuses to reset a hackathon fixture path outside its dedicated local directory", () => {
    const root = mkdtempSync(join(tmpdir(), "codedecay-demo-output-"));
    const sentinel = join(root, "keep.txt");
    writeFileSync(sentinel, "keep\n");

    try {
      const result = spawnSync(
        "node",
        ["scripts/hackathon-demo/setup.mjs", "--output-dir", root],
        { cwd: repoRoot, encoding: "utf8" }
      );

      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "The fixture output must be a child of .codedecay/local/hackathon-demo/."
      );
      expect(readFileSync(sentinel, "utf8")).toBe("keep\n");
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("redacts private checkout and fixture paths from the Codex transcript", () => {
    const root = mkdtempSync(join(tmpdir(), "codedecay-transcript-"));
    const checkout = join(root, "private-checkout");
    const demoRepo = join(checkout, ".codedecay", "local", "demo");
    const input = join(root, "raw.jsonl");
    const output = join(root, "sanitized.jsonl");
    writeFileSync(
      input,
      `${JSON.stringify({ checkout, demoRepo, file: join(demoRepo, "src", "server.js") })}\n`
    );

    try {
      execFileSync(
        "node",
        [
          "scripts/hackathon-demo/sanitize-transcript.mjs",
          "--input",
          input,
          "--output",
          output,
          "--checkout",
          checkout,
          "--demo-repo",
          demoRepo
        ],
        { cwd: repoRoot }
      );

      const sanitized = readFileSync(output, "utf8");
      expect(sanitized).toContain("<CODEDECAY_CHECKOUT>");
      expect(sanitized).toContain("<DEMO_REPO>");
      expect(sanitized).not.toContain(root);
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it("ships the verified captioned hackathon video artifacts", () => {
    const metadata = JSON.parse(
      readFileSync("docs/hackathon/demo/generated/video-metadata.json", "utf8")
    ) as {
      durationSeconds: number;
      dimensions: string;
      audioCodec: string;
      release: string;
    };
    const captions = readFileSync(
      "judge-lab/public/demo/codedecay-codex-repair.vtt",
      "utf8"
    );

    expect(metadata.release).toBe("v0.4.0");
    expect(metadata.durationSeconds).toBeLessThanOrEqual(180);
    expect(metadata.dimensions).toBe("1920x1080");
    expect(metadata.audioCodec).toBe("aac");
    expect(captions).toContain("WEBVTT");
    expect(captions).toContain("00:00:00.000");
    expect(statSync("judge-lab/public/demo/codedecay-codex-repair.mp4").size).toBeGreaterThan(
      1_000_000
    );
    expect(
      statSync("judge-lab/public/demo/codedecay-codex-repair-poster.png").size
    ).toBeGreaterThan(100_000);
  });
});
