# README images

The shot-list files below currently exist as **high-fidelity mockups** — HTML
recreations of the real UI (staged around a fictional project, "beacon"),
rendered with headless Chrome from `marketing/mockups/src/` (`./build.sh` there
regenerates any of them). They are honest to the app's actual chrome, colors
and labels, but they are *not* captures of a running app.

To replace one with a **real screenshot**: capture per the shot list and drop
it in this folder under the exact same file name — nothing else needs to
change. Paths referenced from the README are **relative to the repository
root** (`docs/images/hero.png`), not `./hero.png`.

## Shot list

`logo-dark.png` and `logo-light.png` are **not** on this list — they are
generated. Run `npm run logo` to rebuild them along with every other logo asset;
editing them by hand gets overwritten. The README picks between the two with a
`<picture>` element so the mark contrasts in either GitHub theme.

| File | Suggested size | What should be in frame |
|---|---|---|
| `hero.gif` (or `hero.png`) | 1600×900 | The whole app: navbar, three or four agent panes mid-work, right panel open. This is the shot that sells it — and an animated ~20 s tour (create workspace → agents typing → preview opens → War Room message) sells it far better than a still, which is why the big terminal projects (Zellij, Atuin, lazygit) all lead with a GIF. **Current `hero.png` is the mockup** (1600×900 1× to stay under the size budget); the older text banner is regenerable with `node scripts/gen-banner.mjs` if ever wanted back. |
| `composer.png` | 1200×750 | The Welcome screen: folder chosen, recent folders visible, agent steppers set, layout preview, worktree toggle on. |
| `split-panes.png` | 1200×750 | A split layout with broadcast active — banner visible and the selected panes highlighted. |
| `war-room.png` | 1200×750 | The War Room panel: several room tabs, a transcript containing both a probe and an execute entry, member chips, moderator composer. |
| `git-worktrees.png` | 1200×750 | The Git tab: worktree selector showing `swarm/*` branches with their agents, changed files, inline diff. |
| `web-preview.png` | 1200×750 | The Preview tab: an agent pane on the left, its dev server page on the right. |
| `settings.png` | 1200×750 | Settings → Terminal (font, ligatures, live preview) or Appearance. |

## Tips

- Shoot in dark mode — the app ships a single VS Code Dark Modern style, so the
  set stays consistent.
- A 1600×900 or 1280×920 (default) window is plenty. Retina 2× captures are
  fine; the README sizes images with `width="100%"`.
- Blur or rename anything personal in the titlebar, navbar and shell prompt
  before committing.
- Compress before committing (`pngquant`, `oxipng`, TinyPNG) and keep each file
  under ~500 KB so clones stay small.
- Animations work too: drop a `.gif` or `.webp` in here and point the `src` at
  it — GitHub renders both.
