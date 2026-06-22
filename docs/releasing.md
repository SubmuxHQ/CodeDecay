# Releasing

CodeDecay publishes one npm package for v1:

```text
@submux/codedecay
```

The package source is `packages/cli`, and the installed binary remains
`codedecay`.

## Patch Release Checklist

Before opening the release PR, bump the published version in:

- `packages/cli/package.json`
- `packages/core/src/index.ts`

Run from a clean `main` branch after the release PR is merged:

```bash
pnpm install
pnpm run lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @submux/codedecay pack --dry-run
```

Inspect the tarball before publishing:

```bash
pnpm --filter @submux/codedecay pack
tar -tzf submux-codedecay-<version>.tgz
```

The tarball must include:

```text
package/LICENSE
package/README.md
package/package.json
package/dist/index.js
package/dist/index.d.ts
```

Publish the scoped package with public access:

```bash
pnpm --filter @submux/codedecay publish --access public
```

If npm requires a one-time password in a non-interactive shell, publish from the
package directory:

```bash
cd packages/cli
npm publish --access public --otp <otp>
```

After publishing, verify the public install path:

```bash
tmpdir=$(mktemp -d)
cd "$tmpdir"
npm install @submux/codedecay@<version>
node_modules/.bin/codedecay --help
```
