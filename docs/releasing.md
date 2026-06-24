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

After the release PR is merged, release only from a clean `main` branch at the
commit that will be tagged and published. Do not publish npm contents from a
different commit than the Git tag.

Run:

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

Create the GitHub release for the same tag and verify the release surfaces stay
in sync:

```bash
git show --no-patch --decorate --oneline v<version>
gh release view v<version>
npm view @submux/codedecay version dist-tags --json
```

The package version, npm `latest` dist-tag, Git tag, and GitHub release should
all refer to the same released version before the release is considered done.
