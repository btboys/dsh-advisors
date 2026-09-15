/**
 * dsh-advisors — advisor models for DeepSeek Harness.
 *
 * A background reviewer model watches each top-level agent's completed turns
 * and injects severity-graded review notes back into the session. Controlled
 * through the loader patch config (see cordis.patch.yml) and the Web settings
 * page (设置 → 顾问). Set `config.enabled: false` or disable the `advisors`
 * entry to turn reviews off; the plugin still mounts so the settings page works.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session'
import { AdvisorService } from './service.js'
import type { AdvisorsPluginConfig } from './config.js'
import { loadPersistedConfig, mergePersisted, persistConfig } from './persist.js'
import { installAdvisorsRpc } from './rpc.js'
import { configToSettings, installAdvisorsSettings } from './settings.js'

export const name = 'advisors'

/**
 * Host services required before activation.
 * `llm` / `agents` power reviews. `connection` + `webServer` power the
 * settings-page RPC channel and are soft-injected via ctx.inject in
 * installAdvisorsRpc (dsh-client-connection 0.1.5 no longer provides
 * `rpc.handle` to callers — see src/rpc.ts), so neither is required to boot.
 * `settings` is likewise soft-injected in installAdvisorsSettings.
 */
export const inject = ['llm', 'agents']

export function apply(ctx: Context, config?: AdvisorsPluginConfig): AdvisorService {
  const effective = mergePersisted(config, loadPersistedConfig())
  const service = new AdvisorService(ctx, effective)

  installAdvisorsRpc(
    ctx,
    {
      read: () => service.getRawConfig(),
      write: (partial) => {
        const next = service.applyConfig(partial as AdvisorsPluginConfig)
        try {
          persistConfig(next)
        } catch (error) {
          ctx.logger.warn('[advisors] Failed to persist config:', error)
        }
        return next
      },
      readSession: (sessionId) => service.getSessionAdvise(sessionId as SessionId),
      writeSession: (sessionId, enabled) => service.setSessionAdvise(sessionId as SessionId, enabled),
    },
    ctx.logger,
  )

  // Keep a settings-namespace registration for consumers / future cards.
  try {
    installAdvisorsSettings(ctx, configToSettings(effective), {
      apply: (section) => {
        service.applyConfig(section)
      },
    })
  } catch (error) {
    ctx.logger.warn('[advisors] Failed to register settings namespace:', error)
  }

  return service
}

export { AdvisorService } from './service.js'
export type { SessionAdviseState } from './service.js'
export { normalizeConfig, resolveAdvisorEntry, resolveSessionEnabled, splitModelSelector } from './config.js'
export type { AdvisorEntryConfig, AdvisorsPluginConfig, ResolvedAdvisor, ResolvedConfig, RouteDefaults } from './config.js'
export { loadRoster, nameSlug, ROSTER_FILENAMES } from './roster.js'
export type { RosterFileResult } from './roster.js'
export { buildTranscript, isGenuineUserMessage, textOf } from './transcript.js'
export { loadGuidance } from './guidance.js'
export { buildSystemPrompt, parseNotes, runReview } from './reviewer.js'
export type { AdvisorNote, NoteSeverity, ReviewOutcome } from './reviewer.js'
export { ADVISOR_TOOL_SCHEMAS, executeAdvisorTool } from './tools.js'
export {
  ADVISORS_SETTINGS_NAMESPACE,
  ADVISORS_SETTINGS_SCHEMA,
  configToSettings,
  settingsToConfig,
} from './settings.js'
export type { AdvisorsSettings } from './settings.js'
export { ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS } from './rpc.js'
