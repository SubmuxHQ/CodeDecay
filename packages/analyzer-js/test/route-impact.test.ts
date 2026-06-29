import { describe, expect, it } from "vitest";
import { detectRoutesForFile, mergeImpactedRoutes } from "../src/routes/impact";

describe("route impact detection", () => {
  it("detects Next.js API, UI, pages API, and middleware routes", () => {
    expect(
      detectRoutesForFile(
        "src/app/api/users/route.ts",
        "export async function GET() { return Response.json([]); }\nexport const POST = async () => Response.json({ ok: true });"
      )
    ).toEqual([
      expect.objectContaining({
        framework: "nextjs",
        kind: "api-route",
        route: "/api/users",
        methods: ["GET", "POST"],
        risk: "high"
      })
    ]);

    expect(detectRoutesForFile("src/app/(admin)/dashboard/page.tsx", "export default function Page() { return <main />; }")).toEqual([
      expect.objectContaining({
        framework: "nextjs",
        kind: "ui-route",
        route: "/dashboard",
        methods: [],
        risk: "medium"
      })
    ]);

    expect(detectRoutesForFile("src/pages/api/legacy.ts", "export default function handler() {}")).toEqual([
      expect.objectContaining({
        framework: "nextjs",
        kind: "api-route",
        route: "/api/legacy",
        methods: ["*"]
      })
    ]);

    expect(detectRoutesForFile("src/middleware.ts", "export function middleware() {}")).toEqual([
      expect.objectContaining({
        framework: "nextjs",
        kind: "middleware",
        route: "/",
        methods: ["*"]
      })
    ]);
  });

  it("detects Express and Fastify handlers without running project code", () => {
    const content = [
      "router.get('/users/:id', handler);",
      "app.post('/users', createUser);",
      "server.delete('/sessions/:id', deleteSession);",
      "fastify.route({ method: ['GET', 'POST'], url: '/events', handler });"
    ].join("\n");

    expect(detectRoutesForFile("src/routes/users.ts", content)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ framework: "express", route: "/users/:id", methods: ["GET"] }),
        expect.objectContaining({ framework: "express", route: "/users", methods: ["POST"] }),
        expect.objectContaining({ framework: "fastify", route: "/sessions/:id", methods: ["DELETE"] }),
        expect.objectContaining({ framework: "fastify", route: "/events", methods: ["GET", "POST"] })
      ])
    );
  });

  it("merges equivalent route impacts and keeps the higher risk", () => {
    const merged = mergeImpactedRoutes([
      {
        framework: "nextjs",
        kind: "api-route",
        route: "/api/users",
        methods: ["GET"],
        files: ["src/app/api/users/route.ts"],
        risk: "medium",
        reasons: ["first"],
        recommendedTests: ["first test"]
      },
      {
        framework: "nextjs",
        kind: "api-route",
        route: "/api/users",
        methods: ["GET"],
        files: ["src/lib/users.ts"],
        risk: "high",
        reasons: ["second"],
        recommendedTests: ["second test"]
      }
    ]);

    expect(merged).toEqual([
      {
        framework: "nextjs",
        kind: "api-route",
        route: "/api/users",
        methods: ["GET"],
        files: ["src/app/api/users/route.ts", "src/lib/users.ts"],
        risk: "high",
        reasons: ["first", "second"],
        recommendedTests: ["first test", "second test"]
      }
    ]);
  });
});
