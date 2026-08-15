# Third-party notices

## herdr (Apache License 2.0)

The agent-state detection rule data and engine semantics under
`src/lib/agent-state/` are ported (with modifications) from
[herdr](https://github.com/herdr-sh/herdr) — engine
`src/detect/manifest.rs`, rule manifests `src/detect/manifests/{claude,codex,opencode}.toml`.

herdr is licensed under the Apache License, Version 2.0
(http://www.apache.org/licenses/LICENSE-2.0); the full license text is
shipped in this repository at [`licenses/Apache-2.0.txt`](licenses/Apache-2.0.txt).
The ported files are distributed as part of Swarmterm under GPL-3.0
(Apache-2.0 → GPL-3.0 is a one-way compatible combination); each derived
file carries a header noting its origin and that it has been modified.

The rule data and engine semantics above are a **port snapshot** taken at a
point in time, not a live mirror of herdr. Future re-syncs must diff against
the current herdr repository (rules, priorities, region semantics) rather
than assuming this port is still current — herdr's manifests can change
upstream without any signal reaching this repo.
