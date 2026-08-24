/**
 * ADVISORS.md guidance discovery.
 *
 * Reviewer-only project guidance, mirroring omp's WATCHDOG.md discovery:
 *   1. the user-level file: `$DSH_HOME/ADVISORS.md` (or `~/.dsh/ADVISORS.md`);
 *   2. `ADVISORS.md` and `.dsh/ADVISORS.md` in the workspace directory;
 *   3. the same two locations in each parent directory up to the Git root
 *      (or the home directory when there is no Git root).
 *
 * All readable files participate: user-level guidance is broad, project files
 * apply from outer directories toward the workspace so the narrowest guidance
 * reads last (most prominent).
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const GUIDANCE_FILENAME = 'ADVISORS.md'
const MAX_FILE_CHARS = 8000
const MAX_TOTAL_CHARS = 20000

function readGuidanceFile(path: string): string | undefined {
  try {
    const text = readFileSync(path, 'utf8').trim()
    if (!text) return undefined
    return text.length > MAX_FILE_CHARS ? `${text.slice(0, MAX_FILE_CHARS)}\n… [truncated]` : text
  } catch {
    return undefined
  }
}

/** True when the directory marks a Git root (file or directory). */
function isGitRoot(dir: string): boolean {
  return existsSync(join(dir, '.git'))
}

/**
 * Collect every readable ADVISORS.md on the discovery path for `cwd`.
 * Returns the accumulated guidance text, or an empty string when none exists.
 */
export function loadGuidance(cwd: string): string {
  const sections: string[] = []
  const seen = new Set<string>()

  const add = (path: string, label: string) => {
    const canonical = resolve(path)
    if (seen.has(canonical)) return
    const text = readGuidanceFile(canonical)
    if (text === undefined) return
    seen.add(canonical)
    sections.push(`### ${label}\n${text}`)
  }

  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  add(join(dshHome, GUIDANCE_FILENAME), `User guidance (${dshHome}/${GUIDANCE_FILENAME})`)

  // Workspace files from the outermost ancestor inward. The walk stops after
  // the Git root (inclusive), or at the filesystem root / home directory when
  // the workspace is not inside a Git tree.
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
    add(join(ancestor, GUIDANCE_FILENAME), `Project guidance (${ancestor}/${GUIDANCE_FILENAME})`)
    add(join(ancestor, '.dsh', GUIDANCE_FILENAME), `Project guidance (${ancestor}/.dsh/${GUIDANCE_FILENAME})`)
  }

  let total = 0
  const kept: string[] = []
  for (const section of sections) {
    if (total + section.length > MAX_TOTAL_CHARS) break
    kept.push(section)
    total += section.length
  }
  return kept.join('\n\n')
}
