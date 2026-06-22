# Framework-Aware Route/API Impact Map

Status: proposal

Issue: [#35](https://github.com/SubmuxHQ/CodeDecay/issues/35)

## Goal

CodeDecay should make regression risk more actionable by translating changed
JavaScript and TypeScript files into affected routes, API endpoints, and request
surfaces where that can be done deterministically.

The first implementation should focus on Next.js and Node API projects because
they are common adoption paths for CodeDecay and are already represented by the
example projects.

## Non-Goals

- No LLM, model, cloud, telemetry, or API-key dependency.
- No runtime tracing or server startup.
- No attempt to prove whether a change was AI-generated.
- No broad generic code review comments.
- No scoring change until the extracted impact map is covered by fixtures and
  report tests.

## Proposed Report Field

Add an optional top-level field to the JSON report:

```ts
interface ImpactedRoute {
  framework: "nextjs" | "express" | "fastify" | "node";
  kind: "ui-route" | "api-route" | "middleware" | "route-handler";
  route: string;
  methods: string[];
  files: string[];
  risk: "low" | "medium" | "high";
  reasons: string[];
  recommendedTests: string[];
}
```

Example:

```json
{
  "impactedRoutes": [
    {
      "framework": "nextjs",
      "kind": "api-route",
      "route": "/api/users",
      "methods": ["GET"],
      "files": ["src/app/api/users/route.ts"],
      "risk": "high",
      "reasons": ["API route changed", "No nearby test changed"],
      "recommendedTests": ["Add or run tests covering src/app/api/users/route.ts"]
    }
  ]
}
```

Markdown reports should add a compact section after `Likely Impacted Areas`:

```markdown
### Likely Impacted Routes And APIs

- High `GET /api/users` (Next.js API route): `src/app/api/users/route.ts`
- Medium `/dashboard` (Next.js UI route): `src/app/dashboard/page.tsx`
```

SARIF should stay minimal for now. It can continue emitting file/line findings;
route data can be added later through SARIF `properties` only if GitHub code
scanning handles it cleanly.

## Supported Patterns

### Next.js

Supported first:

- `app/**/page.{js,jsx,ts,tsx}` -> UI route
- `src/app/**/page.{js,jsx,ts,tsx}` -> UI route
- `app/api/**/route.{js,ts}` -> API route
- `src/app/api/**/route.{js,ts}` -> API route
- `pages/api/**/*.{js,ts}` -> API route
- `src/pages/api/**/*.{js,ts}` -> API route
- `middleware.{js,ts}` and `src/middleware.{js,ts}` -> middleware

Route normalization:

- Remove `src/`, `app/`, and `pages/` prefixes.
- Remove `page`, `route`, and file extensions.
- Convert route groups like `(admin)` to no path segment.
- Preserve dynamic segments such as `[id]` and `[...slug]`.
- Convert `index` pages to the parent route.
- For `app/api/users/route.ts`, report `/api/users`.
- For `app/dashboard/page.tsx`, report `/dashboard`.

HTTP methods:

- For Next.js route handlers, detect exported functions named `GET`, `POST`,
  `PUT`, `PATCH`, `DELETE`, `HEAD`, or `OPTIONS`.
- If no method is found, use `["*"]`.
- UI routes should use an empty method list.

### Express

Supported first:

- `app.get("/path", ...)`
- `app.post("/path", ...)`
- `router.get("/path", ...)`
- `router.post("/path", ...)`
- equivalent `put`, `patch`, `delete`, `head`, and `options`

File patterns to inspect:

- `src/routes/**/*.{js,ts}`
- `src/api/**/*.{js,ts}`
- `src/controllers/**/*.{js,ts}`
- `routes/**/*.{js,ts}`
- `api/**/*.{js,ts}`
- `server.{js,ts}`
- `app.{js,ts}`

The extractor should use AST parsing where practical and fall back to simple
literal-string matching only for route call expressions. It should not execute
application code.

### Fastify

Supported first:

- `fastify.get("/path", ...)`
- `fastify.post("/path", ...)`
- `server.get("/path", ...)`
- `server.route({ method: "GET", url: "/path" })`
- array methods in route objects, for example `method: ["GET", "POST"]`

Use the same file patterns as Express.

## Risk Mapping

Route/API impact risk should derive from existing deterministic signals:

- API route changed -> high
- auth/session/security file changed and route imports or lives near auth code
  -> high
- database/schema file changed and route imports DB/model code -> high
- UI route changed -> medium
- middleware changed -> high
- route changed with no nearby tests -> add reason, do not duplicate the
  existing `missing-nearby-tests` finding

The first implementation should not add new score weights. It should make the
report more specific while preserving the current scoring behavior.

## Required Tests

Analyzer fixtures:

- Next.js App Router UI route: `src/app/dashboard/page.tsx`
- Next.js App Router API route with exported `GET`
- Next.js dynamic route: `src/app/users/[id]/page.tsx`
- Next.js route group: `src/app/(admin)/dashboard/page.tsx`
- Next.js Pages API route: `src/pages/api/users.ts`
- Express router method calls for `GET` and `POST`
- Fastify shorthand calls and `server.route({ method, url })`
- No false route for non-route utility files

Report tests:

- JSON includes `impactedRoutes` when present.
- Markdown renders the route/API impact section.
- SARIF remains valid when route impact data exists.

CLI tests:

- Existing CLI output remains backward compatible.
- Snapshot or assertion covers a fixture PR with route impact data.

Example fixtures:

- Extend `examples/nextjs-risk-demo` expected summary once implemented.
- Extend `examples/node-api-risk-demo` expected summary once implemented.

## Implementation Plan

1. Add optional `impactedRoutes` types to `packages/core`.
2. Render `impactedRoutes` in JSON and Markdown reports.
3. Add Next.js deterministic route extraction in `packages/analyzer-js`.
4. Add Express and Fastify route extraction in `packages/analyzer-js`.
5. Add fixtures and tests before changing any scoring behavior.
6. Update sample reports and example README summaries.

## Open Questions

- Should dynamic routes stay as framework-native paths like `/users/[id]`, or
  should CodeDecay normalize them to `/users/:id`?
- Should route impact eventually influence scoring, or remain explanatory only?
- Should imports be analyzed deeply enough to connect DB/auth changes to routes,
  or should v1 keep that relationship path-based?
