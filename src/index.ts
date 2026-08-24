/**
 * dsh-advisors — advisor models for DeepSeek Harness.
 *
 * A background reviewer model watches each top-level agent's completed turns
 * and injects severity-graded review notes back into the session. Controlled
 * entirely through the loader patch config (see cordis.patch.yml); set
 * `config.enabled: false` or disable the `advisors` entry to turn it off.
 */
import type { Context } from '@deepseek-ai/cordis'
import { AdvisorService } from './service.js'
import type { AdvisorsPluginConfig } from './config.js'

export const name = 'advisors'

/** Host services required before activation: LLM calls and the agent registry. */
export const inject = ['llm', 'agents']

export function apply(ctx: Context, config?: AdvisorsPluginConfig): AdvisorService | undefined {
  if (config?.enabled === false) {
    ctx.logger.debug('[advisors] disabled by config')
    return undefined
  }
  return new AdvisorService(ctx, config)
}

export { AdvisorService } from './service.js'
export { normalizeConfig, resolveAdvisorEntry, splitModelSelector } from './config.js'
export type { AdvisorEntryConfig, AdvisorsPluginConfig, ResolvedAdvisor, ResolvedConfig, RouteDefaults } from './config.js'
export { loadRoster, nameSlug, ROSTER_FILENAMES } from './roster.js'
export type { RosterFileResult } from './roster.js'
export { buildTranscript, isGenuineUserMessage, textOf } from './transcript.js'
export { loadGuidance } from './guidance.js'
export { buildSystemPrompt, parseNotes, runReview } from './reviewer.js'
export type { AdvisorNote, NoteSeverity, ReviewOutcome } from './reviewer.js'
export { ADVISOR_TOOL_SCHEMAS, executeAdvisorTool } from './tools.js'
