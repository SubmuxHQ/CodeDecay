import { describe, expect, it } from "vitest";
import { analyzeJsProject } from "../src/index";
import { change, createTempProject } from "./helpers/integration";

describe("analyzeJsProject route impact integration", () => {
  it("extracts Next.js route and API impacts from changed files", () => {
    const rootDir = createTempProject({
      "src/app/api/users/route.ts": "export async function GET() { return Response.json([]); }\nexport async function POST() { return Response.json({ ok: true }); }\n",
      "src/app/users/[id]/page.tsx": "export default function Page() { return <main />; }\n",
      "src/app/(admin)/dashboard/page.tsx": "export default function Page() { return <main />; }\n",
      "src/pages/api/legacy.ts": "export default function handler() {}\n",
      "src/middleware.ts": "export function middleware() {}\n",
      "src/lib/format.ts": "export function format() { return ''; }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/app/api/users/route.ts", "export async function GET() { return Response.json([]); }"),
        change("src/app/users/[id]/page.tsx", "export default function Page() { return <main />; }"),
        change("src/app/(admin)/dashboard/page.tsx", "export default function Page() { return <main />; }"),
        change("src/pages/api/legacy.ts", "export default function handler() {}"),
        change("src/middleware.ts", "export function middleware() {}"),
        change("src/lib/format.ts", "export function format() { return ''; }")
      ]
    });

    expect(result.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/users",
          methods: ["GET", "POST"],
          risk: "high"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/users/[id]",
          methods: [],
          risk: "medium"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "ui-route",
          route: "/dashboard"
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/legacy",
          methods: ["*"]
        }),
        expect.objectContaining({
          framework: "nextjs",
          kind: "middleware",
          route: "/",
          methods: ["*"]
        })
      ])
    );
    expect(result.impactedRoutes?.some((route) => route.files.includes("src/lib/format.ts"))).toBe(false);
  });

  it("propagates changed utility files to importing route boundaries", () => {
    const rootDir = createTempProject({
      "src/lib/session.ts": "export function loadSession() { return null; }\n",
      "src/server/session-service.ts": "import { loadSession } from '../lib/session';\nexport function getSession() { return loadSession(); }\n",
      "src/app/api/session/route.ts": "import { getSession } from '../../../server/session-service';\nexport async function GET() { return Response.json({ ok: Boolean(getSession()) }); }\n"
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("src/lib/session.ts", "export function loadSession() { return { userId: '1' }; }")]
    });

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "propagated-route-impact",
          file: "src/lib/session.ts"
        })
      ])
    );
    expect(result.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "nextjs",
          kind: "api-route",
          route: "/api/session",
          files: expect.arrayContaining(["src/app/api/session/route.ts", "src/lib/session.ts"]),
          reasons: expect.arrayContaining([
            expect.stringContaining("src/lib/session.ts -> src/server/session-service.ts -> src/app/api/session/route.ts")
          ])
        })
      ])
    );
    expect(result.recommendedTests).toContain(
      "Add or run tests covering src/app/api/session/route.ts because it depends on src/lib/session.ts"
    );
  });

  it("extracts Express and Fastify route impacts from changed route handlers", () => {
    const rootDir = createTempProject({
      "src/routes/users.ts": [
        "router.get('/users/:id', handler);",
        "router.post('/users', createUser);",
        ""
      ].join("\n"),
      "src/api/admin.ts": "app.delete('/admin/users/:id', removeUser);\n",
      "server.ts": [
        "server.get('/ready', async () => ({ ok: true }));",
        "fastify.get('/health', async () => ({ ok: true }));",
        "fastify.route({ method: ['GET', 'POST'], url: '/events', handler });",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [
        change("src/routes/users.ts", "router.get('/users/:id', handler);"),
        change("src/api/admin.ts", "app.delete('/admin/users/:id', removeUser);"),
        change("server.ts", "fastify.get('/health', async () => ({ ok: true }));")
      ]
    });

    expect(result.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "express",
          kind: "route-handler",
          route: "/users/:id",
          methods: ["GET"]
        }),
        expect.objectContaining({
          framework: "express",
          route: "/users",
          methods: ["POST"]
        }),
        expect.objectContaining({
          framework: "express",
          route: "/admin/users/:id",
          methods: ["DELETE"]
        }),
        expect.objectContaining({
          framework: "fastify",
          route: "/ready",
          methods: ["GET"]
        }),
        expect.objectContaining({
          framework: "fastify",
          route: "/health",
          methods: ["GET"]
        }),
        expect.objectContaining({
          framework: "fastify",
          route: "/events",
          methods: ["GET", "POST"]
        })
      ])
    );
  });

  it("extracts Fastify route methods from separator-heavy route objects", () => {
    const rootDir = createTempProject({
      "server.ts": [
        "fastify.route({",
        `  method: [${"method:[".repeat(2000)} 'GET', 'POST'],`,
        "  url: '/redos-safe',",
        "  handler",
        "});",
        ""
      ].join("\n")
    });

    const result = analyzeJsProject({
      rootDir,
      changedFiles: [change("server.ts", "fastify.route({ method: ['GET', 'POST'], url: '/redos-safe', handler });")]
    });

    expect(result.impactedRoutes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          framework: "fastify",
          route: "/redos-safe",
          methods: ["GET", "POST"]
        })
      ])
    );
  });
});
