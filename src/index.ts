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
import { AdvisorService } from './service.js'
import type { AdvisorsPluginConfig } from './config.js'
import { loadPersistedConfig, mergePersisted, persistConfig } from './persist.js'
import { installAdvisorsRpc } from './rpc.js'
import { configToSettings, installAdvisorsSettings } from './settings.js'

export const name = 'advisors'

/**
 * Host services required before activation.
 * `connection` (+ optional `webServer`) power the settings-page RPC channel;
 * `llm` / `agents` power reviews. `settings` is soft-injected via
 * installSettingsSection and is not required to boot.
 */
export const inject = ['llm', 'agents', 'connection']

/** Soft-read a host service Cordis may not have declared on this fiber. */
function serviceOf(ctx: Context, key: string): unknown {
  try {
    return (ctx as unknown as { get: (name: string) => unknown }).get(key)
  } catch {
    return undefined
  }
}

export function apply(ctx: Context, config?: AdvisorsPluginConfig): AdvisorService {
  const effective = mergePersisted(config, loadPersistedConfig())
  const service = new AdvisorService(ctx, effective)

  const connection = serviceOf(ctx, 'connection') as
    | { rpc?: { handle: (...args: never[]) => unknown } }
    | undefined

  installAdvisorsRpc(
    connection?.rpc as Parameters<typeof installAdvisorsRpc>[0],
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
export { normalizeConfig, resolveAdvisorEntry, splitModelSelector } from './config.js'
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
