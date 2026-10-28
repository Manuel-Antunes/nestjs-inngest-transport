# Contributing

Thanks for taking the time. Issues and pull requests are welcome.

## Setup

```bash
corepack enable
pnpm install
```

Node.js 22.12+ and pnpm 10 (pinned in `package.json`). Docker is needed for the end-to-end suite only.

## The checks

| command | what it runs |
|---|---|
| `pnpm lint` | Biome — formatting, imports and lint rules (`pnpm lint:fix` writes the fixes) |
| `pnpm typecheck` | `tsc` over the library and over the specs |
| `pnpm test` | **unit** — `src/**/*.spec.ts`, no network, no Docker |
| `pnpm test:integration` | **integration** — `test/integration`: a real Nest application on Express and on Fastify, functions run in process with `@inngest/test` |
| `pnpm test:e2e` | **end to end** — `test/e2e`: the real Inngest dev server in Docker (Testcontainers) calling back into the application |
| `pnpm test:package` | **package** — builds, packs, and loads the tarball from a CommonJS and an ES module consumer |
| `pnpm check:exports` | `publint` and `@arethetypeswrong/cli` over the built package |
| `pnpm docs:dev` | the documentation site, live |

CI runs all of them, on Node 22 and 24, against NestJS 11 and 12.

## Commits

[Conventional Commits](https://www.conventionalcommits.org) — `feat:`, `fix:`, `docs:`, `test:`,
`chore:` … — checked by commitlint in a git hook. A breaking change says so with `!` or a
`BREAKING CHANGE:` footer.

## Documentation

The guide lives in `docs/` as MDX and is built by the Docusaurus site in `website/`. A change in
behaviour comes with the change in `docs/` in the same pull request. The build fails on a broken
link or anchor, so `pnpm docs:build` before pushing is worth it.

## Releasing (maintainers)

1. Move the `Unreleased` section of `CHANGELOG.md` under the new version's heading,
   `## [x.y.z] - YYYY-MM-DD`.
2. `npm version x.y.z --no-git-tag-version`, commit (`chore(release): vx.y.z`), and tag `vx.y.z`.
3. Push the tag. The `Release` workflow builds, tests, publishes to npm with provenance (trusted
   publishing — no token in the repository) and creates the GitHub release from the changelog
   section.
