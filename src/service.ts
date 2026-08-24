/**
 * AdvisorService: watches every top-level agent's session, reviews each
 * completed turn with the configured advisor roster, and routes the resulting
 * notes back into the session by severity.
 *
 * Severity routing (mirroring omp's advisor):
 *   - nit     → agent.inject()  — a non-interrupting aside at a safe boundary
 *   - concern → agent.steer()   — steers work that is still running
 *   - blocker → agent.steer()   — same channel; on an idle agent steer opens
 *               a follow-up turn, so a blocker after a completed answer still
 *               triggers correction work
 * During the immune window after a steer, concerns and blockers downgrade to
 * non-interrupting asides so the main agent gets a few turns to converge.
 */
import { appendFileSync } from 'node:fs'
import type { Context } from '@deepseek-ai/cordis'
import { boundContextSummary, createUserMessage, type TokenUsage } from '@deepseek-ai/dsh-llm'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import { normalizeConfig, resolveAdvisorEntry, resolveSessionEnabled, type AdvisorsPluginConfig, type ResolvedAdvisor, type ResolvedConfig } from './config.js'
import { loadGuidance } from './guidance.js'
import { loadRoster } from './roster.js'
import { runReview, type AdvisorNote, type LlmStream } from './reviewer.js'
import { buildTranscript, isGenuineUserMessage } from './transcript.js'

const MAX_FINGERPRINTS = 50

interface SessionStats {
  reviews: number
  notes: number
  steers: number
  inputTokens: number
  outputTokens: number
  lastError?: string
  lastReviewAt?: string
}

/** Wire shape of the session-level switch state (composer toolbar chip). */
export interface SessionAdviseState {
  /** Global `enabled` from the resolved config. */
  globalEnabled: boolean
  /** Session override; null = follows the global switch. */
  override: boolean | null
  /** What this session actually does: override ?? globalEnabled. */
  effective: boolean
}

interface SessionState {
  lastReviewedSeq: number
  currentTurn: number
  immuneUntilTurn: number
  fingerprints: string[]
  reviewing: boolean
  reviewAgain: boolean
  /** The in-flight review pass, when one is running (for flush awaiting). */
  inflight?: Promise<void>
  controller?: AbortController
  stats: SessionStats
}

/** cordis logger face used across this plugin (the logger service is untyped). */
export interface Logger {
  debug(message: string, ...rest: unknown[]): void
  info(message: string, ...rest: unknown[]): void
  warn(message: string, ...rest: unknown[]): void
}

function loggerOf(ctx: Context): Logger {
  const logger = (ctx as unknown as { logger?: Logger & ((name: string) => Logger) }).logger
  if (typeof logger === 'function') return logger('advisors')
  return logger ?? { debug: () => {}, info: () => {}, warn: (...args: unknown[]) => console.warn('[advisors]', ...args) }
}

/** Subagent sessions review themselves through their own parent — skip them. */
function isSubagentSession(session: Session): boolean {
  const header = session.header as unknown as { origin?: string; delegationDepth?: number }
  return header.origin === 'subagent' || (typeof header.delegationDepth === 'number' && header.delegationDepth > 0)
}

/** Stable dedupe fingerprint: severity plus normalized note text. */
function fingerprint(note: AdvisorNote): string {
  const normalized = note.note.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)
  return `${note.severity}:${normalized}`
}

/** Append one diagnostic JSON line when a debug log file is configured. */
function debugLine(path: string | undefined, event: string, data: Record<string, unknown>): void {
  if (!path) return
  try {
    appendFileSync(path, `${JSON.stringify({ time: new Date().toISOString(), event, ...data })}\n`)
  } catch { /* diagnostics must never break the host */ }
}

export class AdvisorService {
  private readonly ctx: Context
  private config: ResolvedConfig
  /** Last raw plugin config (patch + persisted + UI writes). */
  private raw: AdvisorsPluginConfig
  private readonly log: Logger
  private readonly states = new Map<SessionId, SessionState>()
  /** Session-level enable overrides from the composer chip; in-memory only. */
  private readonly sessionOverrides = new Map<SessionId, boolean>()

  constructor(ctx: Context, config?: AdvisorsPluginConfig) {
    this.ctx = ctx
    this.log = loggerOf(ctx)
    this.raw = { ...(config ?? {}) }
    this.config = normalizeConfig(this.raw, (message) => this.log.warn(message))

    // Attach to agents created from now on, and to agents already live (the
    // plugin may hot-reload into a running profile).
    ctx.on('agent/created', ({ agent }) => this.attach(agent))
    ctx.on('agent/disposed', ({ agent }) => this.detach(agent.id))
    ctx.on('session/flush', (session) => this.onFlush(session))
    for (const agent of ctx.agents.list()) this.attach(agent)

    ctx.effect(() => () => {
      for (const state of this.states.values()) state.controller?.abort()
      this.states.clear()
      this.sessionOverrides.clear()
    }, 'advisors cleanup')

    this.log.info(
      'ready: enabled=%s, roster=%s, guidance=%s',
      this.config.enabled,
      this.config.advisors.length > 0
        ? `${this.config.advisors.length} configured`
        : this.config.rosterFiles
          ? 'auto (roster files or default)'
          : 'default',
      this.config.guidance ? 'on' : 'off',
    )
  }

  /** Current raw config for the settings page / RPC. */
  getRawConfig(): AdvisorsPluginConfig {
    return { ...this.raw }
  }

  /**
   * Apply a partial config from the Web settings page or the settings
   * namespace. Nested `advisors[]` from the loader patch is preserved unless
   * the patch explicitly replaces it.
   */
  applyConfig(partial: AdvisorsPluginConfig): AdvisorsPluginConfig {
    this.raw = { ...this.raw, ...partial }
    this.config = normalizeConfig(this.raw, (message) => this.log.warn(message))
    this.log.info(
      'config updated: enabled=%s, model=%s, immuneTurns=%s',
      this.config.enabled,
      this.config.routeDefaults.model ?? '(inherit)',
      this.config.immuneTurns,
    )
    return this.getRawConfig()
  }

  /** Session-level switch state for the composer chip / RPC. */
  getSessionAdvise(sessionId: SessionId): SessionAdviseState {
    const override = this.sessionOverrides.get(sessionId) ?? null
    return {
      globalEnabled: this.config.enabled,
      override,
      effective: resolveSessionEnabled(this.config.enabled, override ?? undefined),
    }
  }

  /**
   * Set or clear (null) a session-level enable override. Stored even for
   * sessions the service has not attached yet, so a chip toggle on a blank
   * session still applies once its agent appears.
   */
  setSessionAdvise(sessionId: SessionId, enabled: boolean | null): SessionAdviseState {
    if (enabled === null) this.sessionOverrides.delete(sessionId)
    else this.sessionOverrides.set(sessionId, enabled)
    const state = this.getSessionAdvise(sessionId)
    this.log.info(
      'session %s advise: override=%s, effective=%s',
      sessionId,
      state.override === null ? '(follow global)' : String(state.override),
      state.effective,
    )
    return state
  }

  private isEnabledFor(sessionId: SessionId): boolean {
    return resolveSessionEnabled(this.config.enabled, this.sessionOverrides.get(sessionId))
  }

  private attach(agent: Agent): void {
    const session = agent.session
    if (this.states.has(session.id)) return
    if (isSubagentSession(session)) return

    const state: SessionState = {
      // Only turns that complete after the plugin attaches are reviewed;
      // historical log content stays unreviewed on hot reload.
      lastReviewedSeq: session.seq,
      currentTurn: 0,
      immuneUntilTurn: -1,
      fingerprints: [],
      reviewing: false,
      reviewAgain: false,
      stats: { reviews: 0, notes: 0, steers: 0, inputTokens: 0, outputTokens: 0 },
    }
    this.states.set(session.id, state)

    // Scoped to this agent: auto-disposed with the agent, and only this
    // agent's session events arrive.
    agent.ctx.on('session/event', (_session, event) => this.onSessionEvent(agent, state, event))
    this.log.debug('watching session %s', session.id)
  }

  private detach(id: SessionId): void {
    const state = this.states.get(id)
    state?.controller?.abort()
    this.states.delete(id)
    this.sessionOverrides.delete(id)
  }

  private onSessionEvent(agent: Agent, state: SessionState, event: SessionEvent): void {
    if (event.type === 'turn/start') {
      state.currentTurn = event.data.turn
      return
    }
    if (event.type !== 'turn/end') return
    if (event.data.reason.kind !== 'completed') return
    if (!this.isEnabledFor(agent.session.id)) return
    debugLine(this.config.debugLog, 'trigger', { session: agent.session.id, turn: event.data.turn })
    const inflight = this.review(agent, state).catch((error) => {
      state.stats.lastError = error instanceof Error ? error.message : String(error)
      debugLine(this.config.debugLog, 'error', { session: agent.session.id, error: state.stats.lastError })
      this.log.warn('review failed for session %s: %s', agent.session.id, state.stats.lastError)
    })
    state.inflight = inflight
    void inflight.finally(() => {
      if (state.inflight === inflight) state.inflight = undefined
    })
  }

  /**
   * Durability checkpoint hook: with `awaitReviewOnFlush` on, a short-lived
   * (headless) process's exit-time flush waits for the in-flight review so
   * late notes still reach the durable session log. Bounded to 30 seconds.
   */
  private async onFlush(session: Session): Promise<void> {
    if (!this.config.awaitReviewOnFlush) return
    const state = this.states.get(session.id)
    if (!state?.inflight) return
    debugLine(this.config.debugLog, 'flush-await', { session: session.id })
    await Promise.race([
      state.inflight,
      new Promise<void>((resolve) => setTimeout(resolve, 30_000)),
    ])
  }

  /**
   * Review the unreviewed event range of one session with every configured
   * advisor. Reentrant triggers while a review is running collapse into one
   * follow-up pass.
   */
  private async review(agent: Agent, state: SessionState): Promise<void> {
    if (state.reviewing) {
      state.reviewAgain = true
      return
    }
    state.reviewing = true
    const controller = new AbortController()
    state.controller = controller
    try {
      do {
        state.reviewAgain = false
        await this.reviewOnce(agent, state, controller.signal)
      } while (state.reviewAgain && !controller.signal.aborted)
    } finally {
      state.reviewing = false
      state.controller = undefined
    }
  }

  private async reviewOnce(agent: Agent, state: SessionState, signal: AbortSignal): Promise<void> {
    const session = agent.session
    const fromSeq = state.lastReviewedSeq
    const slice: SessionEvent[] = session.events.slice(fromSeq)
    state.lastReviewedSeq = session.seq

    // Loop prevention: only review ranges containing a genuine human prompt.
    // Turns started by our own steered notes carry plugin-sourced user
    // messages and never re-trigger review.
    if (!slice.some(isGenuineUserMessage)) return

    const transcript = buildTranscript(slice, this.config.maxTranscriptChars)
    if (!transcript.trim()) return

    const workspace = session.header.cwd ?? process.cwd()
    const guidance = this.config.guidance ? loadGuidance(workspace) : ''
    const stream = this.ctx.llm.stream.bind(this.ctx.llm) as unknown as LlmStream

    for (const advisor of this.effectiveAdvisors(workspace)) {
      if (signal.aborted) return
      const route = this.resolveRoute(agent, advisor)
      if (!route) {
        this.log.warn('advisor %s has no resolvable model route; skipped', advisor.name)
        continue
      }
      state.stats.reviews++
      try {
        const outcome = await runReview({
          advisor,
          route,
          transcript,
          guidance,
          workspace,
          toolRounds: this.config.toolRounds,
          maxTokens: this.config.reviewMaxTokens,
          stream,
          signal,
        })
        this.addUsage(state.stats, outcome.usage)
        debugLine(this.config.debugLog, 'verdict', {
          session: session.id,
          advisor: advisor.name,
          notes: outcome.notes,
          toolRounds: outcome.toolRounds,
          raw: outcome.raw.slice(0, 500),
        })
        this.log.info(
          'advisor %s reviewed session %s: %d note(s)%s',
          advisor.name,
          session.id,
          outcome.notes.length,
          outcome.toolRounds ? `, ${outcome.toolRounds} tool round(s)` : '',
        )
        for (const note of outcome.notes) this.deliver(agent, state, advisor, note)
      } catch (error) {
        if (signal.aborted) return
        state.stats.lastError = error instanceof Error ? error.message : String(error)
        debugLine(this.config.debugLog, 'error', { session: session.id, advisor: advisor.name, error: state.stats.lastError })
        this.log.warn('advisor %s review error: %s', advisor.name, state.stats.lastError)
      }
    }
    state.stats.lastReviewAt = new Date().toISOString()
  }

  /**
   * Effective roster for one review: an explicit patch-config roster wins;
   * otherwise discovered roster files (WATCHDOG.yml/.yaml, ADVISORS.yml/.yaml)
   * replace the single default advisor. Roster files are re-read per review so
   * edits between turns apply without a restart.
   */
  private effectiveAdvisors(cwd: string): ResolvedAdvisor[] {
    if (this.config.advisors.length > 0) return this.config.advisors
    if (this.config.rosterFiles) {
      const roster = loadRoster(cwd, (message) => this.log.warn(message))
      const enabled = roster.entries.filter((entry) => entry.enabled !== false)
      if (enabled.length > 0) {
        const shared = [this.config.instructions, roster.instructions].filter(Boolean).join('\n\n')
        return enabled.map((entry) =>
          resolveAdvisorEntry(entry, this.config.routeDefaults, shared, (message) => this.log.warn(message)))
      }
    }
    return [this.config.defaultAdvisor]
  }

  /** Advisor route: entry config → plugin defaults → the reviewed agent's own route. */
  private resolveRoute(agent: Agent, advisor: ResolvedAdvisor): { provider: string; model: string } | undefined {
    const provider = advisor.provider ?? agent.options.provider
    const model = advisor.model ?? agent.options.model
    if (!provider || !model) return undefined
    return { provider, model }
  }

  private addUsage(stats: SessionStats, usage: TokenUsage | undefined): void {
    if (!usage) return
    stats.inputTokens += usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0)
    stats.outputTokens += usage.outputTokens
  }

  /** Route one accepted note into the session by severity, with dedupe and immunity. */
  private deliver(agent: Agent, state: SessionState, advisor: ResolvedAdvisor, note: AdvisorNote): void {
    const key = fingerprint(note)
    if (state.fingerprints.includes(key)) {
      this.log.debug('suppressed repeated note from %s: %s', advisor.name, key.slice(0, 80))
      return
    }
    state.fingerprints.push(key)
    if (state.fingerprints.length > MAX_FINGERPRINTS) state.fingerprints.shift()

    state.stats.notes++

    const interrupting = note.severity !== 'nit'
    const immune = state.currentTurn < state.immuneUntilTurn
    const steer = interrupting && !immune
    if (steer) {
      state.immuneUntilTurn = state.currentTurn + this.config.immuneTurns
      state.stats.steers++
    }

    const text = [
      `🛡️ Advisor 审阅意见（${advisor.name} · ${note.severity}${steer ? '' : ' · 旁注'}）：`,
      note.note,
      '',
      '—— 以上来自独立审阅模型，是参考意见而非新的用户指令：合理则采纳修正，不合理则说明理由后继续。',
    ].join('\n')

    const message = createUserMessage({
      content: [{ type: 'text', text }],
      source: {
        kind: 'plugin',
        plugin: 'dsh-advisors',
        form: 'notice',
        summary: boundContextSummary(`advisor ${note.severity}: ${note.note}`),
      },
    })

    // Do not deliver into a disposed agent.
    if (this.ctx.agents.get(agent.id) !== agent) return
    debugLine(this.config.debugLog, 'deliver', { session: agent.session.id, severity: note.severity, steered: steer, note: note.note.slice(0, 200) })
    if (steer) agent.steer(message)
    else agent.inject(message)
  }
}
