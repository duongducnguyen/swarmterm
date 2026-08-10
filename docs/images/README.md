# README images

The README currently uses **placeholders** from [placehold.co](https://placehold.co).
To replace them: take the screenshots below, save them in this folder under the
exact file names, and update the `src` of the matching `<img>` tag in
`README.md`. Every tag has a comment above it naming the file that replaces it.

```diff
-<img src="https://placehold.co/1600x900/1e1e1e/6b7280/png?text=Hero+screenshot" ... >
+<img src="docs/images/hero.png" alt="Swarmterm overview" width="100%">
```

> Paths in the README are **relative to the repository root**
> (`docs/images/hero.png`), not `./hero.png`.

## Shot list

`logo-dark.png` and `logo-light.png` are **not** on this list — they are
generated. Run `npm run logo` to rebuild them along with every other logo asset;
editing them by hand gets overwritten. The README picks between the two with a
`<picture>` element so the mark contrasts in either GitHub theme.

| File | Suggested size | What should be in frame |
|---|---|---|
| `hero.png` | 1600×900 | The whole app: navbar, three or four agent panes mid-work, right panel open. This is the shot that sells it — catch the agents while their output looks good. |
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
