/**
 * Read-only investigative tools an advisor may be granted: read / grep / glob,
 * rooted at the reviewed session's workspace directory.
 *
 * These are deliberately small reimplementations over node:fs — the advisor
 * runs outside the main agent's tool runtime, and tool grants here are a
 * security boundary: only these three read-only tools exist, and every path
 * is confined to the workspace root.
 */
import { promises as fs } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import type { AdvisorToolName } from './config.js'

const READ_MAX_LINES = 400
const READ_MAX_CHARS = 20000
const GREP_MAX_MATCHES = 50
const GLOB_MAX_RESULTS = 100
const WALK_MAX_ENTRIES = 20000
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.cache', 'coverage'])

export interface AdvisorToolContext {
  /** Absolute workspace root the advisor is confined to. */
  cwd: string
  signal?: AbortSignal
}

/** Resolve a caller-supplied path inside the workspace root. */
function confine(ctx: AdvisorToolContext, path: string): string {
  const absolute = resolve(ctx.cwd, path)
  if (absolute !== ctx.cwd && !absolute.startsWith(ctx.cwd + sep)) {
    throw new Error(`path escapes the workspace root: ${path}`)
  }
  return absolute
}

async function advisorRead(ctx: AdvisorToolContext, args: { path: string; offset?: number; limit?: number }): Promise<string> {
  const target = confine(ctx, args.path)
  const raw = await fs.readFile(target, 'utf8')
  const lines = raw.split('\n')
  const offset = Math.max(0, (args.offset ?? 1) - 1)
  const limit = Math.min(args.limit ?? READ_MAX_LINES, READ_MAX_LINES)
  const slice = lines.slice(offset, offset + limit)
  let out = slice.map((line, index) => `${offset + index + 1}\t${line}`).join('\n')
  if (out.length > READ_MAX_CHARS) out = `${out.slice(0, READ_MAX_CHARS)}\n… [truncated]`
  const more = offset + slice.length < lines.length ? `\n(${lines.length - offset - slice.length} more lines)` : ''
  return out + more
}

interface WalkOptions {
  maxEntries: number
  includeFiles: boolean
  includeDirs: boolean
}

async function* walk(root: string, options: WalkOptions, state = { seen: 0 }): AsyncGenerator<string> {
  if (state.seen >= options.maxEntries) return
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (state.seen >= options.maxEntries) return
    state.seen++
    const full = join(root, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      if (options.includeDirs) yield full
      yield* walk(full, options, state)
    } else if (entry.isFile()) {
      if (options.includeFiles) yield full
    }
  }
}

/** Translate a glob pattern (`**`, `*`, `?`) into a RegExp over relative paths. */
function globToRegExp(pattern: string): RegExp {
  let source = ''
  let index = 0
  while (index < pattern.length) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*'
        index += 2
        if (pattern[index] === '/') index++
        continue
      }
      source += '[^/]*'
    } else if (char === '?') {
      source += '[^/]'
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
    index++
  }
  return new RegExp(`^${source}$`)
}

async function advisorGlob(ctx: AdvisorToolContext, args: { pattern: string; path?: string }): Promise<string> {
  const root = args.path ? confine(ctx, args.path) : ctx.cwd
  const matcher = globToRegExp(args.pattern)
  const results: string[] = []
  for await (const full of walk(root, { maxEntries: WALK_MAX_ENTRIES, includeFiles: true, includeDirs: false })) {
    const rel = relative(ctx.cwd, full)
    const relToRoot = relative(root, full)
    if (matcher.test(relToRoot) || matcher.test(rel) || matcher.test(basename(full))) {
      results.push(rel)
      if (results.length >= GLOB_MAX_RESULTS) break
    }
  }
  return results.length ? results.join('\n') : '(no matches)'
}

async function advisorGrep(ctx: AdvisorToolContext, args: { pattern: string; path?: string; maxResults?: number }): Promise<string> {
  const root = args.path ? confine(ctx, args.path) : ctx.cwd
  let regex: RegExp
  try {
    regex = new RegExp(args.pattern, 'i')
  } catch {
    throw new Error(`invalid regular expression: ${args.pattern}`)
  }
  const maxResults = Math.min(args.maxResults ?? GREP_MAX_MATCHES, GREP_MAX_MATCHES)
  const matches: string[] = []
  outer: for await (const full of walk(root, { maxEntries: WALK_MAX_ENTRIES, includeFiles: true, includeDirs: false })) {
    let text: string
    try {
      const stat = await fs.stat(full)
      if (stat.size > 512 * 1024) continue
      text = await fs.readFile(full, 'utf8')
    } catch {
      continue
    }
    const lines = text.split('\n')
    for (let index = 0; index < lines.length; index++) {
      if (regex.test(lines[index])) {
        matches.push(`${relative(ctx.cwd, full)}:${index + 1}: ${lines[index].slice(0, 200)}`)
        if (matches.length >= maxResults) break outer
      }
    }
  }
  return matches.length ? matches.join('\n') : '(no matches)'
}

/** JSON-Schema tool descriptions offered to the advisor model. */
export const ADVISOR_TOOL_SCHEMAS: Record<AdvisorToolName, ToolSchema> = {
  read: {
    name: 'read',
    description: 'Read a UTF-8 text file inside the workspace. Returns numbered lines.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the workspace root (or absolute within it).' },
        offset: { type: 'number', description: '1-based first line to read. Defaults to 1.' },
        limit: { type: 'number', description: `Maximum lines to read (capped at ${READ_MAX_LINES}).` },
      },
      required: ['path'],
    },
  },
  grep: {
    name: 'grep',
    description: 'Search file contents with a case-insensitive regular expression. Returns path:line: text matches.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regular expression to search for.' },
        path: { type: 'string', description: 'Subdirectory to search. Defaults to the workspace root.' },
        maxResults: { type: 'number', description: `Maximum matches (capped at ${GREP_MAX_MATCHES}).` },
      },
      required: ['pattern'],
    },
  },
  glob: {
    name: 'glob',
    description: 'Find files whose path matches a glob pattern (supports **, *, ?).',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "src/**/*.ts".' },
        path: { type: 'string', description: 'Subdirectory to search. Defaults to the workspace root.' },
      },
      required: ['pattern'],
    },
  },
}

/** Execute one granted advisor tool by name with parsed JSON arguments. */
export async function executeAdvisorTool(
  ctx: AdvisorToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case 'read':
      return advisorRead(ctx, args as { path: string; offset?: number; limit?: number })
    case 'grep':
      return advisorGrep(ctx, args as { pattern: string; path?: string; maxResults?: number })
    case 'glob':
      return advisorGlob(ctx, args as { pattern: string; path?: string })
    default:
      throw new Error(`unknown advisor tool: ${name}`)
  }
}
