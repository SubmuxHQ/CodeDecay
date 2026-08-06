import { describe, expect, it } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { runRuntimeEvidenceTool } from "../src/index";
import { createRepo } from "./helpers/mcp";

describe("MCP runtime_evidence tool", () => {
  it("returns redacted local evidence with zero network calls", async () => {
    const repo = createRepo({ "README.md": "# fixture\n" });
    mkdirSync(join(repo, ".codedecay", "runtime"), { recursive: true });
    writeFileSync(
      join(repo, ".codedecay", "runtime", "traces.json"),
      JSON.stringify({
        resourceSpans: [{
          resource: {
            attributes: [
              { key: "service.name", value: { stringValue: "api" } },
              { key: "service.version", value: { stringValue: "head" } }
            ]
          },
          scopeSpans: [{
            spans: [{
              name: "GET /users",
              spanId: "1",
              flags: 0,
              startTimeUnixNano: "0",
              endTimeUnixNano: "1000000",
              attributes: [
                { key: "http.route", value: { stringValue: "/users" } },
                { key: "user.email", value: { stringValue: "person@example.com" } }
              ]
            }]
          }]
        }]
      }),
      "utf8"
    );

    const output = await runRuntimeEvidenceTool(
      { cwd: repo },
      { format: "json", telemetry: ".codedecay/runtime/traces.json", headRevision: "head" }
    );
    expect(output).not.toContain("person@example.com");
    const report = JSON.parse(output) as {
      canProveCurrentTree: boolean;
      provider: { kind: string };
      safety: { networkCalled: boolean };
      operations: Array<{ route?: string }>;
    };
    expect(report.provider.kind).toBe("local-artifact");
    expect(report.canProveCurrentTree).toBe(false);
    expect(report.safety.networkCalled).toBe(false);
    expect(report.operations[0]?.route).toBe("/users");
  });
});
