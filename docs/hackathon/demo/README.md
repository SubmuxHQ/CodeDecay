# Three-minute Codex demo

This directory is the reproducibility pack for hackathon issue
[#696](https://github.com/SubmuxHQ/CodeDecay/issues/696). The final video must
show a genuine Codex plan, CodeDecay evidence, an endpoint-level regression
test, the implementation repair, approved checks, and a second CodeDecay pass.

The fixture is deliberately dependency-free. Its risky commit contains a
passing unit test while an anonymous `GET /api/users` request receives an admin
response with HTTP `200`.

## Prepare the fixture

From a clean CodeDecay checkout:

```bash
pnpm install --frozen-lockfile
pnpm build:packages
node scripts/hackathon-demo/setup.mjs
cd .codedecay/local/hackathon-demo/repo
npm test
npm run probe:anonymous
```

The last command is expected to fail before the repair because it receives
`200` instead of `401`.

## Create the grounded task bundle

Replace `<CODEDECAY_CHECKOUT>` with the absolute checkout path:

```bash
node <CODEDECAY_CHECKOUT>/packages/cli/dist/index.js ai \
  --cwd . \
  --base HEAD^ \
  --with-checks \
  --format markdown \
  --output codedecay-ai-before.md
```

This executes only the `npm test` command explicitly allowlisted in the
fixture. The command should show that the narrow test passes while the changed
auth/API path lacks endpoint-level proof.

## Give the repair to Codex

Run Codex inside the isolated fixture with workspace write access:

```bash
codex exec --sandbox workspace-write --color always \
  "Read codedecay-ai-before.md. State a short plan. Reproduce the anonymous GET /api/users failure. Add an endpoint-level Node test that starts the real server and requires 401 for a missing Authorization header. Run it before fixing the implementation so the failure is visible. Restore fail-closed behavior, add the real test to .codedecay/config.yml, run all approved checks, rerun CodeDecay with --base HEAD^ --with-checks into codedecay-ai-after.md, inspect the diff, and report remaining limitations. Do not claim zero risk."
```

Codex may choose different file names while preserving the behavior. The proof
is valid only when the test starts `createApp()` and makes a real HTTP request;
a mocked route test does not satisfy the demo.

## Revalidate manually

```bash
npm test
npm run test:real
npm run probe:anonymous
node <CODEDECAY_CHECKOUT>/packages/cli/dist/index.js ai \
  --cwd . \
  --base HEAD^ \
  --with-checks \
  --format markdown \
  --output codedecay-ai-after.md
git diff --check
git diff -- src test .codedecay/config.yml
```

The expected repaired runtime result is HTTP `401`. CodeDecay should record
both configured checks as executed evidence. Static findings about the
high-risk auth/API diff can remain; the demo must describe that honestly rather
than claim guaranteed safety.

## Recording rules

- Maximum final runtime: 180 seconds.
- Record at 1920×1080 or better with readable terminal text.
- Use the exact tagged release and fixture commit displayed in the video.
- Remove private paths, tokens, account details, notifications, and unrelated
  windows.
- Captions must be available, and intentional timing cuts must be disclosed.
- Verify the final public URL without credentials.
- Ask an independent viewer to identify the broken flow, weak proof, repair,
  and stronger post-fix evidence before closing #696.
