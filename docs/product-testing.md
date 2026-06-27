# Product Testing

CodeDecay is adding a local-first product verification layer so UI/API failures
can be handed to humans, PR comments, and coding agents as concrete evidence.

This is the foundation for replacing hosted autonomous testing workflows without
giving up CodeDecay's default safety model.

## Target Model

Product targets live in `productTesting.targets` inside CodeDecay config.

```yaml
version: 1

productTesting:
  targets:
    web:
      baseUrl: http://127.0.0.1:3000
      healthCheck: http://127.0.0.1:3000/api/health
      timeoutMs: 60000
```

`codedecay config --format markdown` shows each target's readiness:

- `ready`: CodeDecay can use `baseUrl` or a resolved `previewUrlEnv`.
- `command-required`: a start command exists and commands are allowed, but it
  still requires an explicit product verification command to run.
- `needs-command-approval`: a start command exists, but
  `safety.allowCommands` is false.
- `missing-preview-url`: `previewUrlEnv` is configured but not available.
- `unresolved`: the target has no usable URL or startup command.

Config inspection never executes product target commands.

## Run Product Target Checks

Use `codedecay product` to verify configured live app targets.

```bash
npx codedecay product --format markdown
npx codedecay product --target web --format json
```

The command performs only the steps declared in config:

- run `authSetupCommand` if present,
- start `startCommand` if present and commands are allowed,
- poll `healthCheck`, resolved `previewUrlEnv`, or `baseUrl`,
- stop the managed startup process,
- run `teardownCommand` if configured.

Targets with only `baseUrl` or `previewUrlEnv` can be checked without running
commands. This is useful for already-running local apps and PR preview URLs.

```yaml
version: 1

productTesting:
  targets:
    preview:
      previewUrlEnv: VERCEL_URL
      timeoutMs: 60000
```

Startup remains opt-in. If `startCommand` is configured but
`safety.allowCommands` is false, `codedecay product` reports the target as
blocked and does not run the command.

```yaml
version: 1

productTesting:
  targets:
    local:
      startCommand: pnpm dev
      healthCheck: http://127.0.0.1:3000/api/health
      teardownCommand: pnpm stop
      timeoutMs: 60000

safety:
  allowCommands: true
```

## Playwright Flow Explorer

Use `codedecay product --explore` to crawl configured product targets and write a
stable flow map artifact.

```bash
npx codedecay product --target web --explore --max-pages 5 --format markdown
```

The explorer is intentionally conservative:

- it runs only when `safety.allowCommands: true`,
- it loads `playwright` from the target project,
- it does not install Playwright packages or browser binaries,
- it crawls same-origin links from the product target URL,
- it records page URLs, titles, links, forms, buttons, inputs, selectors, and
  accessible names,
- it records screenshots when the project Playwright driver can provide them,
- it blocks potentially destructive forms and actions unless
  `--allow-destructive-actions` is passed,
- it obeys `--max-pages` and `--max-actions`.

Flow maps are written under:

```text
.codedecay/local/product-flow-maps/<target-id>/flow-map.json
```

The JSON schema lives at
[`schemas/product-flow-map.schema.json`](schemas/product-flow-map.schema.json).

Markdown and JSON product reports link to the flow-map artifact so agents and
humans can reuse the discovered product surface as test-generation input.

## Generated UI Regression Tests

Use `codedecay product --generate-tests` to turn a flow map into reviewable
Playwright regression tests.

```bash
npx codedecay product --target web --generate-tests --format markdown
```

Generated tests are written under:

```text
.codedecay/local/generated-tests/<target-id>/product.generated.spec.ts
.codedecay/local/generated-tests/<target-id>/manifest.json
```

The manifest marks the tests as generated, stores the source flow-map path, and
requires review before promotion. Its JSON schema lives at
[`schemas/product-generated-test-manifest.schema.json`](schemas/product-generated-test-manifest.schema.json).

Generated tests are deterministic review artifacts:

- CodeDecay never commits generated tests automatically,
- generated tests prefer role, label, placeholder, text, and accessibility-first
  locators before selector fallbacks,
- generated tests cover route loads, same-origin link navigation, safe input
  state, and safe form visibility,
- destructive or mutating actions blocked in the flow map are not converted into
  submit/click tests,
- tests touched by the current PR blast radius are marked higher priority when
  CodeDecay can infer route impact.

Run generated tests explicitly with:

```bash
npx codedecay product --target web --generate-tests --run-generated-tests --format markdown
```

Execution uses the target repository's local Playwright CLI from
`node_modules/playwright`, `node_modules/@playwright/test`, or
`node_modules/.bin/playwright`. CodeDecay does not install Playwright or browser
binaries.

When a generated test fails, the product report includes:

- failing generated test title,
- failing step,
- error message,
- exact generated test source,
- source path,
- rerun command.

Review/promote workflow:

1. Run `codedecay product --target web --explore --generate-tests`.
2. Inspect `.codedecay/local/generated-tests/<target-id>/product.generated.spec.ts`.
3. Edit weak selectors or sample data if needed.
4. Run `codedecay product --target web --run-generated-tests`.
5. Copy reviewed tests into your real test suite, for example
   `tests/e2e/codedecay-product.spec.ts`.
6. Commit only the reviewed promoted tests, not the `.codedecay/local/`
   generated artifacts.

## Generated API Regression Tests

Use `codedecay product --generate-api-tests` to turn an OpenAPI schema into
reviewable Playwright API request tests.

```yaml
version: 1

toolAdapters:
  schemathesis:
    schema: docs/openapi.yaml
    baseUrl: http://127.0.0.1:3000

productTesting:
  targets:
    api:
      baseUrl: http://127.0.0.1:3000
      healthCheck: http://127.0.0.1:3000/health

safety:
  allowCommands: true
```

```bash
npx codedecay product --target api --generate-api-tests --format markdown
npx codedecay product --target api --generate-api-tests --run-generated-api-tests --format markdown
```

CodeDecay reads local OpenAPI JSON/YAML files from
`toolAdapters.schemathesis.schema`. If no schema is configured, it looks for
common local filenames such as `openapi.yaml`, `docs/openapi.yaml`, or
`api/openapi.yaml`. HTTP(S) schema URLs are not fetched by the product command
yet; provide a local schema file to keep generation deterministic and
local-first.

You can also define reviewable API scenarios directly on a product target:

```yaml
productTesting:
  targets:
    api:
      baseUrl: http://127.0.0.1:3000
      healthCheck: http://127.0.0.1:3000/health
      apiEndpoints:
        - id: list-users
          method: GET
          path: /api/users
          expectedStatuses: [200, 401]
          headers:
            x-codedecay-scenario: list-users
        - method: POST
          path: /api/users
          expectedStatuses: [201, 400]
          body:
            email: codedecay@example.com
```

Manual `apiEndpoints` and OpenAPI-generated operations can be used together.
Endpoint `path` values may be absolute paths or full HTTP(S) URLs.

Generated API tests are written under:

```text
.codedecay/local/generated-api-tests/<target-id>/api.generated.spec.ts
.codedecay/local/generated-api-tests/<target-id>/manifest.json
```

The same manifest schema is used for UI and API generated tests:
[`schemas/product-generated-test-manifest.schema.json`](schemas/product-generated-test-manifest.schema.json).

Generated API tests are conservative by default:

- safe methods (`GET`, `HEAD`, `OPTIONS`) run normally,
- mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) are generated as
  `test.skip` review cases unless `--allow-destructive-actions` is passed,
- required path and query parameters are filled with deterministic sample
  values,
- request bodies are sampled from OpenAPI examples, defaults, enums, required
  object fields, and primitive schema types when available,
- checks pass for documented non-5xx statuses and fail unexpected server errors
  or undocumented responses,
- generated failures include request method/URL, expected behavior, actual
  error, impacted files when available, source path, exact generated source,
  and rerun command.

Review/promote workflow:

1. Run `codedecay product --target api --generate-api-tests`.
2. Inspect `.codedecay/local/generated-api-tests/<target-id>/api.generated.spec.ts`.
3. Replace sample IDs, auth setup, fixtures, or destructive test skips as
   needed.
4. Run `codedecay product --target api --run-generated-api-tests`.
5. Copy reviewed tests into your real test suite, for example
   `tests/api/codedecay-api.spec.ts`.
6. Commit only the reviewed promoted tests, not the `.codedecay/local/`
   generated artifacts.

## Failure Bundle Schema

Product verification failures are represented as versioned bundles on
`CodeDecayReport.productFailureBundles`.

The JSON schema lives at
[`schemas/product-failure-bundle.schema.json`](schemas/product-failure-bundle.schema.json).

Each bundle includes:

- failing check ID and priority,
- target and environment,
- failing step plus neighboring steps,
- screenshot, trace, video, DOM, console, network, test-source, or
  request/response-diff artifacts,
- expected and actual behavior,
- likely impacted files,
- root-cause hypothesis when available,
- suggested fix tasks,
- exact rerun command,
- failure classification.

Failure classifications are:

- `confirmed-regression`
- `likely-flaky`
- `environment-failure`
- `auth-or-test-data-failure`
- `generated-test-weakness`
- `unknown`

## Agent And PR Output

Markdown reports render a **Product Failure Bundles** section. SARIF output adds
product verification results and links them to impacted files when available.

Agent task bundles include the same product failure bundles in machine-readable
JSON and Markdown, so agents can fix and rerun a specific failed check instead
of guessing from a dashboard screenshot.

## Current Limits

This release defines the target model, live health-check runner, Playwright flow
map explorer, generated UI regression tests, generated OpenAPI/API request
tests, and failure evidence contract.

The next implementation pieces are:

- MCP run-fix-rerun tools,
- retained product-test memory,
- flake/setup/real-regression classification,
- PR preview verification and scheduled monitoring.
