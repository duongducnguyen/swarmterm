# Contributing to Swarmterm

Thanks for your interest! This page covers everything you need to go from
`git clone` to a merged pull request.

## Getting set up

Install the prerequisites from the [README](README.md#requirements), then:

```bash
npm install
npm run tauri dev   # full app: Vite HMR frontend + auto-rebuilding Rust backend
```

[`CLAUDE.md`](CLAUDE.md) is the architecture guide — the renderer/backend
split, module boundaries, and a list of non-obvious gotchas (pty lifecycle,
focus handling, UTF-8 chunking). Read it before touching anything beyond the
UI; it will save you a round of review.

## Before you open a PR

CI runs all of this on every pull request; save yourself a push by running it
locally first:

| Check | Command |
|---|---|
| Frontend unit tests | `npm test` |
| TypeScript (strict) | `npx tsc --noEmit` |
| Rust tests | `cargo test` *(from `src-tauri/`)* |
| Rust formatting | `cargo fmt --check` *(from `src-tauri/`)* |
| Rust lints | `cargo clippy --all-targets -- -D warnings` *(from `src-tauri/`)* |

For changes that touch terminal lifecycle, focus, the War Room, or worktrees,
also walk the relevant section of
[`docs/manual-smoke-tests.md`](docs/manual-smoke-tests.md) — much of this app
lives at boundaries (pty, window manager, tray) that unit tests can't reach.

## How we work

- **Business logic is TDD'd in `src/lib/`.** Pure, framework-free modules with
  a `*.test.ts` beside each. Write or extend the test first; components and
  stores stay thin (see CLAUDE.md's module-boundaries section).
- **Comments explain *why*, not *what*.** The codebase leans on dense
  rationale comments for platform/lifecycle decisions — match that bar.
- **Cross-platform:** macOS, Linux and Windows are all first-class. Gate
  platform code behind `#[cfg(...)]` (Rust) or runtime checks (TS); never
  hard-code one platform's behavior.
- **Commit messages** follow Conventional Commits (`feat(scope): …`,
  `fix: …`, `docs: …`) — mirror the existing history.

## Proposing changes

- **Bug fixes and small improvements:** open a PR directly.
- **New features or behavior changes:** open an issue first describing the
  problem and your proposed design. Features here start life as a short design
  doc before any code — agreeing on the design first is the fastest path to a
  merged PR.
- Keep PRs focused: one concern per PR, tests included, CI green.

## License and contributor agreement

Swarmterm is licensed under [GPL-3.0](LICENSE). By submitting a contribution
you agree that:

1. Your contribution is your own work and you have the right to license it.
2. Your contribution is licensed under GPL-3.0 like the rest of the project.
3. You grant the project maintainer a perpetual, worldwide, non-exclusive,
   royalty-free, irrevocable right to relicense your contribution — including
   under other license terms — as part of Swarmterm. This keeps future
   dual-licensing possible (for example paid companion apps) without having to
   track down every past contributor.

If you can't agree to these terms, please open an issue instead of a PR so the
change can be reimplemented independently.

## Conduct

Be kind and assume good faith. Harassment or personal attacks aren't tolerated
anywhere in the project's spaces.
