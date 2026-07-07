/**
 * Friendly random branch names for worktree-per-pane. Each agent pane gets a
 * `swarm/<adjective>-<noun>` branch (Docker/Heroku style) — pleasant and
 * readable instead of the old `swarm/<agent>-<n>`.
 *
 * Random-per-creation, NOT hash-derived: truncated-hash schemes silently reused
 * a stale worktree when the same input recurred (Claude Code #51596). A fresh
 * random pick each spawn — kept unique within the batch here, and bumped on
 * collision with an existing worktree in `provisionWorktrees` — can never
 * silently reuse one. The `~17k`-combination word space keeps in-batch and
 * cross-session collisions rare. The `swarm/` prefix namespaces these throwaway
 * machine branches away from the user's real branches in `git branch`.
 */
import { DEFAULT_TEMPLATE_ID } from '@/lib/templates'

export const ADJECTIVES: readonly string[] = [
  'amber', 'ancient', 'azure', 'bold', 'brave', 'breezy', 'bright', 'brisk', 'calm',
  'chill', 'clever', 'cobalt', 'cosmic', 'cozy', 'crimson', 'crisp', 'curious', 'daring',
  'dawn', 'deft', 'dewy', 'dreamy', 'dusky', 'eager', 'early', 'easy', 'ember', 'fabled',
  'fair', 'fancy', 'fast', 'feisty', 'fiery', 'fleet', 'fluffy', 'fond', 'frosty', 'gentle',
  'giddy', 'glad', 'gleaming', 'golden', 'grand', 'hardy', 'hazel', 'hazy', 'hidden',
  'humble', 'icy', 'ideal', 'idle', 'indigo', 'jade', 'jolly', 'jovial', 'keen', 'kind',
  'lively', 'lofty', 'lucid', 'lucky', 'lunar', 'lush', 'mellow', 'merry', 'mighty', 'milky',
  'mint', 'misty', 'modest', 'mossy', 'nimble', 'noble', 'ochre', 'olive', 'opal', 'pearl',
  'placid', 'plucky', 'polar', 'prime', 'proud', 'quaint', 'quick', 'quiet', 'radiant',
  'rapid', 'rare', 'ready', 'regal', 'rosy', 'royal', 'ruddy', 'rustic', 'sage', 'sandy',
  'scarlet', 'serene', 'shady', 'sharp', 'shiny', 'silent', 'silky', 'silver', 'sleek',
  'slick', 'snowy', 'soft', 'solar', 'spry', 'stark', 'steady', 'stellar', 'still', 'stormy',
  'sunny', 'swift', 'tame', 'teal', 'tender', 'tidal', 'tidy', 'tiny', 'true', 'twin',
  'umber', 'vast', 'velvet', 'vivid', 'warm', 'wild', 'windy', 'winter', 'wise', 'witty',
  'woven', 'young', 'zany', 'zesty', 'zippy'
]

export const NOUNS: readonly string[] = [
  'acorn', 'alder', 'anchor', 'arbor', 'ash', 'aspen', 'aurora', 'badger', 'bay', 'beacon',
  'birch', 'bison', 'bloom', 'bluff', 'breeze', 'brook', 'canyon', 'cedar', 'cliff', 'cloud',
  'clover', 'comet', 'coral', 'cove', 'crane', 'creek', 'crest', 'delta', 'dew', 'dune',
  'eagle', 'ember', 'fable', 'falcon', 'fawn', 'fern', 'field', 'finch', 'fjord', 'flame',
  'fox', 'frost', 'garden', 'geode', 'glade', 'glen', 'grove', 'gull', 'harbor', 'hawk',
  'haven', 'heath', 'hollow', 'isle', 'ivy', 'jasper', 'kestrel', 'lagoon', 'lake', 'lark',
  'leaf', 'ledge', 'lily', 'linden', 'lotus', 'lynx', 'maple', 'marsh', 'meadow', 'mesa',
  'mist', 'moor', 'moss', 'moth', 'oak', 'ocean', 'orchard', 'otter', 'owl', 'palm', 'peak',
  'pebble', 'pine', 'plume', 'pond', 'poplar', 'prairie', 'quail', 'quartz', 'rain', 'raven',
  'reed', 'reef', 'ridge', 'river', 'robin', 'sable', 'sail', 'sand', 'sequoia', 'shade',
  'shell', 'shore', 'sky', 'slope', 'spring', 'spruce', 'star', 'stone', 'storm', 'stream',
  'summit', 'swan', 'thistle', 'tide', 'timber', 'trail', 'tundra', 'vale', 'valley', 'vine',
  'violet', 'wave', 'willow', 'wolf', 'wren'
]

function pick(list: readonly string[], rng: () => number): string {
  const idx = Math.min(Math.floor(rng() * list.length), list.length - 1)
  return list[idx] ?? ''
}

/** One friendly branch name, e.g. `swarm/brave-otter`. */
export function randomWorktreeName(rng: () => number = Math.random): string {
  return `swarm/${pick(ADJECTIVES, rng)}-${pick(NOUNS, rng)}`
}

/**
 * One branch name per pane, in pane order; null for plain terminal panes. Names
 * are unique within the returned batch — an in-batch duplicate is re-rolled (the
 * guard bounds it so a pathologically unlucky rng can't loop forever).
 */
export function planWorktreeBranches(
  agentIds: string[],
  rng: () => number = Math.random
): (string | null)[] {
  const used = new Set<string>()
  return agentIds.map((id) => {
    if (id === DEFAULT_TEMPLATE_ID) return null
    let name = randomWorktreeName(rng)
    for (let guard = 0; used.has(name) && guard < 50; guard++) {
      name = randomWorktreeName(rng)
    }
    used.add(name)
    return name
  })
}

/** Collision retry name: swarm/brave-otter -> swarm/brave-otter-2. */
export function bumpBranch(branch: string, attempt: number): string {
  return `${branch}-${attempt}`
}

/** Result of provisioning one pane's worktree; null = pane falls back to repo root. */
export type ProvisionedWorktree = { path: string; branch: string } | null

/**
 * Serially provision one worktree per planned branch. Serial on purpose:
 * concurrent `git worktree add` on one repo contends on git's internal
 * lock files, and a transient lock failure would burn a pane's isolation.
 * Retries with a numeric bump ONLY on "already exists" (up to 5 names);
 * any other error falls back to null — provisioning must never throw.
 */
export async function provisionWorktrees(
  plan: (string | null)[],
  create: (branch: string) => Promise<{ path: string; branch: string }>
): Promise<ProvisionedWorktree[]> {
  const results: ProvisionedWorktree[] = []
  for (const branch of plan) {
    if (branch === null) {
      results.push(null)
      continue
    }
    let provisioned: ProvisionedWorktree = null
    for (let attempt = 1; attempt <= 5; attempt++) {
      const name = attempt === 1 ? branch : bumpBranch(branch, attempt)
      try {
        provisioned = await create(name)
        break
      } catch (e) {
        if (attempt === 5 || !String(e).includes('already exists')) {
          console.warn(`worktree for ${branch} failed, pane falls back to repo root:`, e)
          break
        }
      }
    }
    results.push(provisioned)
  }
  return results
}
