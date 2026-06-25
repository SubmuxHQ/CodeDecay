# Releasing

CodeDecay publishes one npm package for v1:

```text
@submuxhq/codedecay
```

The package source is `packages/cli`, and the installed binary remains
`codedecay`.

CodeDecay also publishes an optional GitHub Packages npm mirror with the same
package name. GitHub Packages scopes packages by GitHub user or organization
owner, and this repository is owned by `SubmuxHQ`, so every release from v0.2.0
onward uses `@submuxhq/codedecay` for both npmjs and the GitHub Packages mirror.

npmjs is the default public install path for users:

```bash
npm install -D @submuxhq/codedecay
```

GitHub Packages is an authenticated mirror for GitHub-based workflows and
requires registry authentication for installs.

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
pnpm --filter @submuxhq/codedecay pack --dry-run
```

Inspect the tarball before publishing:

```bash
pnpm --filter @submuxhq/codedecay pack
tar -tzf submuxhq-codedecay-<version>.tgz
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
pnpm --filter @submuxhq/codedecay publish --access public
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
npm install @submuxhq/codedecay@<version>
node_modules/.bin/codedecay --help
```

Create the GitHub release for the same tag and verify the release surfaces stay
in sync:

```bash
git show --no-patch --decorate --oneline v<version>
gh release view v<version>
npm view @submuxhq/codedecay version dist-tags --json
```

The package version, npm `latest` dist-tag, Git tag, and GitHub release should
all refer to the same released version before the release is considered done.

## GitHub Packages Mirror

The GitHub Packages mirror is published from the same built CLI package. It uses
the same package name, `@submuxhq/codedecay`, and sets the registry to
`https://npm.pkg.github.com`.

Use npmjs for public end-user installs. Use GitHub Packages only when a workflow
or organization policy specifically needs a GitHub-hosted package mirror.

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

Install from GitHub Packages by adding the GitHub owner scope and an
authenticated token to `.npmrc`:

```text
@submuxhq:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<classic-pat-with-read:packages>
```

Then install:

```bash
npm install -D @submuxhq/codedecay@<version>
node_modules/.bin/codedecay version
```

GitHub Packages requires a personal access token classic with `read:packages`
for local installs. GitHub Actions can use `GITHUB_TOKEN` when the package is
associated with this repository and the workflow has package access.

If local verification fails with `403 permission_denied`, check the token scope
before changing package metadata. The default public npmjs install path should
still work without GitHub authentication:

```bash
npm install -D @submuxhq/codedecay
```
