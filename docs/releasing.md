# Releasing

CodeDecay publishes one npm package for v1:

```text
@submux/codedecay
```

The package source is `packages/cli`, and the installed binary remains
`codedecay`.

CodeDecay also publishes an optional GitHub Packages npm mirror under the
GitHub repository owner namespace:

```text
@submuxhq/codedecay
```

The GitHub Packages name is intentionally different from the npmjs name.
GitHub Packages scopes packages by GitHub user or organization owner, and this
repository is owned by `SubmuxHQ`. Keep the npmjs package as
`@submux/codedecay`; use `@submuxhq/codedecay` only for the GitHub Packages
mirror.

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

## GitHub Packages Mirror

The GitHub Packages mirror is published from the same built CLI package, but the
staged package metadata changes the package name to `@submuxhq/codedecay` and
sets the registry to `https://npm.pkg.github.com`.

Prepare the mirror package locally after `pnpm build:packages`:

```bash
pnpm package:github --out /tmp/codedecay-ghpkg
cd /tmp/codedecay-ghpkg
npm pack --dry-run
```

The dry run should include:

```text
package/LICENSE
package/README.md
package/package.json
package/dist/index.js
package/dist/index.d.ts
```

Publish through the `Publish GitHub Packages` workflow. It uses the repository
`GITHUB_TOKEN` with `packages: write` permission and skips publishing if the
same mirror version already exists.

Use the exact release tag as the workflow `ref`. Do not publish from `main`
after unreleased commits have landed, because that can create a GitHub Packages
version whose contents differ from the npmjs package with the same version.

Manual dispatch:

```bash
gh workflow run publish-github-packages.yml -f ref=v<version>
```

Install from GitHub Packages by adding the GitHub owner scope to `.npmrc`:

```text
@submuxhq:registry=https://npm.pkg.github.com
```

Then install:

```bash
npm install -D @submuxhq/codedecay
```

GitHub Packages may require authentication for installs depending on package
visibility and access settings. The public npmjs package remains the default
recommended install path:

```bash
npm install -D @submux/codedecay
```
