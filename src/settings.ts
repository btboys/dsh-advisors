/**
 * Settings page/section policy for dsh-advisors.
 *
 * dsh-settings ≥ 0.2.0 derives settings forms from each Loader entry's own
 * `Config` schema (`SettingsForms.describe/update/replace/mutate`); the old
 * `SettingsProvider.installSection` namespace registration no longer exists.
 * This plugin ships its own Web page over the `/dsh-advisors` RPC channel, so
 * it only registers that page policy (`auto: false`) and keeps the rest of the
 * config surface in YAML / roster files.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: loads the `Context.settings` augmentation (peer dep is optional).
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { AdvisorsPluginConfig } from './config.js'

/**
 * Namespace literal kept for the profile entry id (`- id: advisors` in
 * cordis.patch.yml) and for the RPC/exports surface. dsh-settings ≥ 0.2.0
 * addresses sections by that entry id, not by a registered namespace.
 */
export const ADVISORS_SETTINGS_NAMESPACE = 'advisors'

/**
 * Flat section the Web UI edits. Nested `advisors[]` roster stays in YAML /
 * roster files — too awkward for a simple form and already has file discovery.
 */
export interface AdvisorsSettings {
  enabled: boolean
  provider: string
  model: string
  reasoningEffort: string
  instructions: string
  guidance: boolean
  immuneTurns: number
  maxTranscriptChars: number
  toolRounds: number
  reviewMaxTokens: number
  debugLog: string
  awaitReviewOnFlush: boolean
  roster: boolean
}

/** Schema of the advisors settings section (schemastery). */
export const ADVISORS_SETTINGS_SCHEMA = z.object({
  enabled: z.boolean().default(true),
  provider: z.string().default(''),
  model: z.string().default(''),
  reasoningEffort: z.string().default(''),
  instructions: z.string().default(''),
  guidance: z.boolean().default(true),
  immuneTurns: z.number().default(3),
  maxTranscriptChars: z.number().default(12_000),
  toolRounds: z.number().default(2),
  reviewMaxTokens: z.number().default(4096),
  debugLog: z.string().default(''),
  awaitReviewOnFlush: z.boolean().default(false),
  roster: z.boolean().default(true),
})

/** Map a stored settings section onto a plugin config fragment. */
export function settingsToConfig(settings: AdvisorsSettings): AdvisorsPluginConfig {
  return {
    enabled: settings.enabled,
    provider: settings.provider || undefined,
    model: settings.model || undefined,
    reasoningEffort: settings.reasoningEffort || undefined,
    instructions: settings.instructions || undefined,
    guidance: settings.guidance,
    immuneTurns: settings.immuneTurns,
    maxTranscriptChars: settings.maxTranscriptChars,
    toolRounds: settings.toolRounds,
    reviewMaxTokens: settings.reviewMaxTokens,
    debugLog: settings.debugLog || undefined,
    awaitReviewOnFlush: settings.awaitReviewOnFlush,
    roster: settings.roster,
  }
}

/** Map a plugin composition config onto a settings section (the `base` layer). */
export function configToSettings(config: AdvisorsPluginConfig | undefined): AdvisorsSettings {
  const entry = config ?? {}
  return {
    enabled: entry.enabled !== false,
    provider: entry.provider ?? '',
    model: entry.model ?? '',
    reasoningEffort: entry.reasoningEffort ?? '',
    instructions: entry.instructions ?? '',
    guidance: entry.guidance !== false,
    immuneTurns: entry.immuneTurns ?? 3,
    maxTranscriptChars: entry.maxTranscriptChars ?? 12_000,
    toolRounds: entry.toolRounds ?? 2,
    reviewMaxTokens: entry.reviewMaxTokens ?? 4096,
    debugLog: entry.debugLog ?? '',
    awaitReviewOnFlush: entry.awaitReviewOnFlush === true,
    roster: entry.roster !== false,
  }
}

export interface AdvisorsSettingsHooks {
  /** Apply a resolved section to the running service. */
  apply: (config: AdvisorsPluginConfig) => void
}

/**
 * Register this plugin's settings-page policy when a settings provider exists.
 *
 * dsh-settings ≥ 0.2.0 replaced `installSection(owner, ns, schema, entry, hooks)`
 * with schema-derived forms: `SettingsForms.describe()` reads the active
 * Loader entry's own schema, and `update` / `replace` / `mutate` write through
 * it. This plugin ships its own Web page over the `/dsh-advisors` RPC channel,
 * so it only opts out of the auto-generated form (`auto: false`) and keeps its
 * custom page; the `entry`/`hooks` arguments remain for source compatibility
 * with the composition-level call site.
 *
 * Soft-depends on `settings` so headless profiles without a settings provider
 * still boot.
 */
export function installAdvisorsSettings(
  ctx: Context,
  _entry: AdvisorsSettings,
  _hooks: AdvisorsSettingsHooks,
): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(
      () => settingsCtx.settings.configure({ auto: false }, ctx.fiber),
      'advisors settings page policy',
    )
  })
}
