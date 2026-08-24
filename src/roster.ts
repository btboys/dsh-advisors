/**
 * Roster file discovery: WATCHDOG.yml / WATCHDOG.yaml / ADVISORS.yml /
 * ADVISORS.yaml declare a specialist advisor roster, mirroring omp's
 * WATCHDOG.yml mechanism.
 *
 * Discovery locations (all readable files participate):
 *   1. user level: `$DSH_HOME/` (`~/.dsh/`);
 *   2. the workspace directory and each parent up to the Git root (or the
 *      home directory without a Git root), both plain and `.dsh/` variants.
 *
 * Merge semantics:
 *   - top-level `instructions` accumulate across every discovered file
 *     (user-level first, then outer → inner project files);
 *   - advisor entries are keyed by a normalized name slug — an entry from a
 *     more specific (inner) file replaces a same-named ancestor/user entry;
 *   - once any roster entries are discovered, the roster replaces the single
 *     default-advisor arrangement (but never an explicit patch-config roster);
 *   - invalid YAML or an invalid shape is reported and that file is skipped.
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { load as parseYaml } from 'js-yaml'
import type { AdvisorEntryConfig } from './config.js'

/** Basenames recognized as roster files, in same-directory precedence order. */
export const ROSTER_FILENAMES = ['WATCHDOG.yml', 'WATCHDOG.yaml', 'ADVISORS.yml', 'ADVISORS.yaml'] as const

export interface RosterFileResult {
  /** Accumulated shared top-level instructions across all files. */
  instructions: string
  /** Merged roster entries; inner files win same-name conflicts. */
  entries: AdvisorEntryConfig[]
  /** Every readable roster file that participated, in application order. */
  files: string[]
}

/** Normalize an entry name to its dedupe slug: lowercase, punctuation → '-'. */
export function nameSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-+|-+$/g, '')
}

interface RosterFileShape {
  instructions?: unknown
  advisors?: unknown
}

function isGitRoot(dir: string): boolean {
  return existsSync(join(dir, '.git'))
}

function readRosterFile(path: string, warn: (message: string) => void): RosterFileShape | undefined {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  if (!text.trim()) return undefined
  let parsed: unknown
  try {
    parsed = parseYaml(text)
  } catch (error) {
    warn(`invalid YAML in ${path}: ${error instanceof Error ? error.message : String(error)} — file skipped`)
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    warn(`invalid roster shape in ${path}: top level must be a mapping — file skipped`)
    return undefined
  }
  return parsed as RosterFileShape
}

function validEntry(candidate: unknown): candidate is AdvisorEntryConfig {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return false
  const name = (candidate as { name?: unknown }).name
  return typeof name === 'string' && name.trim().length > 0
}

/**
 * Discover and merge every roster file on the path for `cwd`.
 * Returns empty results when no roster file exists.
 */
export function loadRoster(cwd: string, warn: (message: string) => void): RosterFileResult {
  const result: RosterFileResult = { instructions: '', entries: [], files: [] }
  const bySlug = new Map<string, AdvisorEntryConfig>()
  const instructionParts: string[] = []

  const applyFile = (path: string) => {
    const shape = readRosterFile(path, warn)
    if (!shape) return
    result.files.push(path)
    if (typeof shape.instructions === 'string' && shape.instructions.trim()) {
      instructionParts.push(shape.instructions.trim())
    }
    if (shape.advisors === undefined) return
    if (!Array.isArray(shape.advisors)) {
      warn(`invalid roster shape in ${path}: "advisors" must be a list — entries skipped`)
      return
    }
    for (const candidate of shape.advisors) {
      if (!validEntry(candidate)) {
        warn(`invalid advisor entry in ${path}: every entry needs a non-empty "name" — entry skipped`)
        continue
      }
      const slug = nameSlug(candidate.name)
      if (!slug) {
        warn(`invalid advisor name "${candidate.name}" in ${path} — entry skipped`)
        continue
      }
      bySlug.set(slug, { ...candidate, name: candidate.name.trim() })
    }
  }

  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  for (const filename of ROSTER_FILENAMES) applyFile(join(dshHome, filename))

  // Project files apply from the outermost ancestor toward the workspace, so
  // the narrowest entry wins same-name conflicts.
  const home = homedir()
  const ancestors: string[] = []
  let dir = resolve(cwd)
  for (;;) {
    ancestors.push(dir)
    if (isGitRoot(dir) || dir === home) break
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  for (const ancestor of ancestors.reverse()) {
    for (const filename of ROSTER_FILENAMES) applyFile(join(ancestor, filename))
    for (const filename of ROSTER_FILENAMES) applyFile(join(ancestor, '.dsh', filename))
  }

  result.instructions = instructionParts.join('\n\n')
  result.entries = [...bySlug.values()]
  return result
}
