/**
 * Plugin configuration types and normalization.
 *
 * Configuration arrives from the loader patch row's `config:` field (see
 * `cordis.patch.yml`). Everything is optional; the defaults give one advisor
 * that inherits the reviewed agent's own provider/model route.
 */

/** Built-in investigative tools an advisor may be granted (read-only). */
export const ADVISOR_TOOL_NAMES = ['read', 'grep', 'glob'] as const
export type AdvisorToolName = (typeof ADVISOR_TOOL_NAMES)[number]

/** One roster entry — a specialist reviewer. */
export interface AdvisorEntryConfig {
  /** Required display name; also the dedupe identity across config reloads. */
  name: string
  /** Per-advisor switch. Defaults to true. */
  enabled?: boolean
  /**
   * Model selector: `"provider/model"` in one string, or a bare model id
   * combined with {@link provider}. Falls back to the plugin-level route,
   * then to the reviewed agent's own route.
   */
  model?: string
  /** Provider route used together with a bare {@link model} id. */
  provider?: string
  /** Adapter-owned reasoning effort id for the advisor model. */
  reasoningEffort?: string
  /** This advisor's specialization guidance. */
  instructions?: string
  /**
   * Investigative tool grants. Omitted grants read/grep/glob; an empty array
   * (or false) grants none — the advisor reviews the transcript alone.
   */
  tools?: AdvisorToolName[] | false
}

export interface AdvisorsPluginConfig {
  /** Master switch. false = the plugin loads but never reviews. */
  enabled?: boolean
  /** Plugin-level default route; each roster entry may override. */
  provider?: string
  /** Plugin-level default model (accepts "provider/model" too). */
  model?: string
  /** Plugin-level default reasoning effort. */
  reasoningEffort?: string
  /** Shared guidance added to every advisor's system prompt. */
  instructions?: string
  /** Load ADVISORS.md guidance files (user + workspace ancestors). Default true. */
  guidance?: boolean
  /** Specialist roster; empty/absent = one default advisor. */
  advisors?: AdvisorEntryConfig[]
  /**
   * Main-agent turns after an interrupt during which further concerns and
   * blockers downgrade to non-interrupting asides. Default 3.
   */
  immuneTurns?: number
  /** Transcript size cap fed to the advisor per review. Default 12000. */
  maxTranscriptChars?: number
  /** Maximum investigative tool rounds per advisor review. Default 3. */
  toolRounds?: number
  /** Output token cap per advisor request. Default 2048. */
  reviewMaxTokens?: number
  /**
   * Diagnostic log file path. When set, review lifecycle events (trigger,
   * verdict, delivery, errors) are appended as JSON lines. Useful for
   * headless/short-lived profiles where host logs are hard to see.
   */
  debugLog?: string
  /**
   * Let `session/flush` await an in-flight review (bounded to 30s). Enable in
   * short-lived (headless) profiles so a final review lands before process
   * exit. Leave off in long-running profiles: flushes happen per model
   * request and would otherwise wait on the reviewer. Default false.
   */
  awaitReviewOnFlush?: boolean
  /**
   * Discover roster files (WATCHDOG.yml/.yaml, ADVISORS.yml/.yaml) in the
   * workspace and its ancestors. Default true. Roster files participate only
   * when the patch config declares no explicit `advisors` roster.
   */
  roster?: boolean
}

/** A roster entry with every field resolved against plugin-level defaults. */
export interface ResolvedAdvisor {
  name: string
  provider?: string
  model?: string
  reasoningEffort?: string
  instructions: string
  tools: AdvisorToolName[]
}

/** Plugin-level route defaults that roster entries fall back to. */
export interface RouteDefaults {
  provider?: string
  model?: string
  reasoningEffort?: string
}

export interface ResolvedConfig {
  enabled: boolean
  instructions: string
  guidance: boolean
  rosterFiles: boolean
  immuneTurns: number
  maxTranscriptChars: number
  toolRounds: number
  reviewMaxTokens: number
  debugLog?: string
  awaitReviewOnFlush: boolean
  routeDefaults: RouteDefaults
  /** Explicit patch-config roster; empty when not configured. */
  advisors: ResolvedAdvisor[]
  /** Used when neither the patch roster nor roster files yield entries. */
  defaultAdvisor: ResolvedAdvisor
}

/** Split a `"provider/model"` selector into its two route parts. */
export function splitModelSelector(selector: string): { provider?: string; model?: string } {
  const slash = selector.indexOf('/')
  if (slash <= 0 || slash === selector.length - 1) return { model: selector || undefined }
  return { provider: selector.slice(0, slash), model: selector.slice(slash + 1) }
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Resolve one roster entry (from patch config or a roster file) against
 * plugin-level route defaults. `shared` is the shared instruction text
 * (patch-level plus accumulated roster-file instructions) prepended to the
 * entry's own instructions.
 */
export function resolveAdvisorEntry(
  entry: AdvisorEntryConfig,
  defaults: RouteDefaults,
  shared: string,
  warn?: (message: string) => void,
): ResolvedAdvisor {
  const selector = splitModelSelector(clean(entry.model) ?? '')
  let tools: AdvisorToolName[]
  if (entry.tools === false) {
    tools = []
  } else if (Array.isArray(entry.tools)) {
    tools = []
    for (const tool of entry.tools) {
      if ((ADVISOR_TOOL_NAMES as readonly string[]).includes(tool)) {
        tools.push(tool as AdvisorToolName)
      } else {
        warn?.(`unknown advisor tool "${String(tool)}" on entry "${entry.name}" — dropped`)
      }
    }
  } else {
    tools = [...ADVISOR_TOOL_NAMES]
  }
  return {
    name: entry.name.trim(),
    provider: clean(entry.provider) ?? selector.provider ?? defaults.provider,
    model: selector.model ?? defaults.model,
    reasoningEffort: clean(entry.reasoningEffort) ?? defaults.reasoningEffort,
    instructions: [clean(shared), clean(entry.instructions)].filter(Boolean).join('\n\n'),
    tools,
  }
}

/** Normalize raw patch config into a fully defaulted internal shape. */
export function normalizeConfig(raw: AdvisorsPluginConfig | undefined, warn?: (message: string) => void): ResolvedConfig {
  const config = raw ?? {}
  const routeDefaults: RouteDefaults = {
    provider: clean(config.provider) ?? splitModelSelector(clean(config.model) ?? '').provider,
    model: splitModelSelector(clean(config.model) ?? '').model,
    reasoningEffort: clean(config.reasoningEffort),
  }
  const shared = clean(config.instructions) ?? ''

  const roster = Array.isArray(config.advisors) ? config.advisors : []
  const advisors = roster
    .filter((entry) => entry && entry.name?.trim() && entry.enabled !== false)
    .map((entry) => resolveAdvisorEntry(entry, routeDefaults, shared, warn))

  return {
    enabled: config.enabled !== false,
    instructions: shared,
    guidance: config.guidance !== false,
    rosterFiles: config.roster !== false,
    immuneTurns: Math.max(0, config.immuneTurns ?? 3),
    maxTranscriptChars: Math.max(2000, config.maxTranscriptChars ?? 12000),
    toolRounds: Math.max(0, config.toolRounds ?? 3),
    reviewMaxTokens: Math.max(256, config.reviewMaxTokens ?? 2048),
    debugLog: clean(config.debugLog),
    awaitReviewOnFlush: config.awaitReviewOnFlush === true,
    routeDefaults,
    advisors,
    defaultAdvisor: resolveAdvisorEntry({ name: 'Advisor' }, routeDefaults, shared, warn),
  }
}
