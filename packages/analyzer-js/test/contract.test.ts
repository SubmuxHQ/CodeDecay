import { describe, expect, it } from "vitest";
import type { DesignContract } from "@submuxhq/codedecay-core";
import { analyzeJsProject } from "../src/index";
import { change, createTempProject } from "./helpers/integration";

describe("design contract analysis", () => {
  it("flags active scope fence violations", () => {
    const rootDir = createTempProject({
      "src/auth/session.ts": "export function session() { return true; }\n",
      "src/api/users.ts": "export function users() { return []; }\n"
    });
    const contract: DesignContract = {
      version: 1,
      activeScopeFence: "auth-only",
      scopeFences: [
        {
          id: "auth-only",
          allowedAreas: ["auth"]
        }
      ]
    };

    const result = analyzeJsProject({
      rootDir,
      designContract: contract,
      changedFiles: [
        change("src/auth/session.ts", "export function session() { return true; }"),
        change("src/api/users.ts", "export function users() { return []; }")
      ]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-scope-fence",
          category: "scope",
          severity: "high",
          file: "src/api/users.ts"
        })
      ])
    );
  });

  it("flags disallowed boundary combinations", () => {
    const rootDir = createTempProject({
      "src/app/page.tsx": "export default function Page() { return null; }\n",
      "src/db/schema.prisma": "model User { id String @id }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      designContract: {
        version: 1,
        boundaryRules: [
          {
            id: "ui-cannot-touch-db",
            from: { areas: ["ui"] },
            disallow: { areas: ["database"] }
          }
        ]
      },
      changedFiles: [
        change("src/app/page.tsx", "export default function Page() { return <main />; }"),
        change("src/db/schema.prisma", "model User { id String @id email String }")
      ]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-boundary-violation",
          file: "src/db/schema.prisma"
        })
      ])
    );
  });

  it("flags newly introduced UI imports into persistence with ownership and rewrite evidence", () => {
    const rootDir = createTempProject({
      ".github/CODEOWNERS": [
        "src/app/** @frontend-team",
        "src/persistence/** @data-platform",
        ""
      ].join("\n"),
      "src/app/page.tsx": [
        "import { saveUser } from '../persistence/user-repository';",
        "export default function Page() { saveUser(); return null; }",
        ""
      ].join("\n"),
      "src/persistence/user-repository.ts": "export function saveUser() { return true; }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      designContract: {
        version: 1,
        boundaryRules: [
          {
            id: "ui-through-service-adapter",
            from: { files: ["src/app/**"] },
            disallow: { files: ["src/persistence/**"] },
            rewrite: "Move this through the service adapter instead of importing persistence from UI."
          }
        ]
      },
      changedFiles: [
        change("src/app/page.tsx", "import { saveUser } from '../persistence/user-repository';")
      ]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-import-boundary-violation",
          file: "src/app/page.tsx",
          line: 1,
          description: expect.stringContaining("Changed file: src/app/page.tsx.")
        })
      ])
    );
    const finding = result.findings.find((item) => item.ruleId === "contract-import-boundary-violation");
    expect(finding?.description).toContain("Imported target: src/persistence/user-repository.ts.");
    expect(finding?.description).toContain("Rule source: designContract.boundaryRules[id=ui-through-service-adapter].");
    expect(finding?.description).toContain("changed file owners @frontend-team");
    expect(finding?.description).toContain("imported target owners @data-platform");
    expect(finding?.description).toContain("Rewrite direction: Move this through the service adapter instead of importing persistence from UI.");
  });

  it("flags service imports that bypass bounded context boundaries", () => {
    const rootDir = createTempProject({
      "src/services/billing/invoice.ts": [
        "import { findUser } from '../identity/users';",
        "export function invoice() { return findUser(); }",
        ""
      ].join("\n"),
      "src/services/identity/users.ts": "export function findUser() { return { id: 'u1' }; }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      designContract: {
        version: 1,
        boundaryRules: [
          {
            id: "billing-via-identity-client",
            from: { files: ["src/services/billing/**"] },
            disallow: { files: ["src/services/identity/**"] },
            rewrite: "Use the identity client adapter instead of importing identity internals directly."
          }
        ]
      },
      changedFiles: [
        change("src/services/billing/invoice.ts", "import { findUser } from '../identity/users';")
      ]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-import-boundary-violation",
          description: expect.stringContaining("Imported target: src/services/identity/users.ts.")
        })
      ])
    );
  });

  it("does not flag allowlisted adapter imports inside a forbidden boundary", () => {
    const rootDir = createTempProject({
      "src/app/page.tsx": [
        "import { saveUser } from '../persistence/adapters/user-repository';",
        "export default function Page() { saveUser(); return null; }",
        ""
      ].join("\n"),
      "src/persistence/adapters/user-repository.ts": "export function saveUser() { return true; }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      designContract: {
        version: 1,
        boundaryRules: [
          {
            id: "ui-persistence-adapter-only",
            from: { files: ["src/app/**"] },
            disallow: { files: ["src/persistence/**"] },
            allow: { files: ["src/persistence/adapters/**"] }
          }
        ]
      },
      changedFiles: [
        change("src/app/page.tsx", "import { saveUser } from '../persistence/adapters/user-repository';")
      ]
    });

    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("contract-import-boundary-violation");
    expect(result.findings.map((finding) => finding.ruleId)).not.toContain("contract-boundary-violation");
  });

  it("flags dependency allowlist and banned import violations", () => {
    const rootDir = createTempProject({
      "src/auth/session.ts": [
        "import { query } from '../db/client';",
        "import lodash from 'lodash';",
        "import { verify } from './jwt';",
        "export const session = verify;",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      designContract: {
        version: 1,
        dependencyRules: [
          {
            id: "auth-imports",
            files: ["src/auth/**"],
            allowedImports: ["./*"],
            bannedImports: ["../db/*"]
          }
        ]
      },
      changedFiles: [change("src/auth/session.ts", "import lodash from 'lodash';")]
    });

    expect(result.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["contract-banned-import", "contract-import-allowlist"])
    );
  });

  it("flags banned API usage", () => {
    const rootDir = createTempProject({
      "src/auth/token.ts": "export function token() { return Math.random().toString(); }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      designContract: {
        version: 1,
        bannedApis: [
          {
            id: "stable-token",
            files: ["src/auth/**"],
            apis: ["Math.random"]
          }
        ]
      },
      changedFiles: [change("src/auth/token.ts", "return Math.random().toString();")]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-banned-api",
          file: "src/auth/token.ts",
          line: 1
        })
      ])
    );
  });

  it("flags pattern conformance gaps as low-severity scope findings", () => {
    const rootDir = createTempProject({
      "src/api/users.ts": "export function users() { return []; }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      designContract: {
        version: 1,
        patternRules: [
          {
            id: "api-errors",
            files: ["src/api/**"],
            required: ["handleApiError"]
          }
        ]
      },
      changedFiles: [change("src/api/users.ts", "export function users() { return []; }")]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "contract-pattern-violation",
          severity: "low",
          category: "scope",
          file: "src/api/users.ts"
        })
      ])
    );
  });
});
