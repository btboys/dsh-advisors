/**
 * Settings namespace for dsh-advisors.
 *
 * Registered on the host plane so the Web settings page (and any other
 * settings consumers) can read/write the same section the loader patch seeds
 * as the composition `base` layer. The browser UI currently talks over the
 * `/dsh-advisors` RPC channel; this registration keeps the section visible to
 * `ctx.settings.describe()` and lets future settingsScope cards share state.
 */
import type { Context } from '@deepseek-ai/cordis'
// Type-only: loads the `Context.settings` augmentation (peer dep is optional).
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { AdvisorsPluginConfig } from './config.js'

/**
 * Settings namespace owned by this plugin. dsh-settings ≥ 0.1.2 dropped the
 * `settingsNamespace()` helper — a lowercase-hyphenated literal is validated
 * by `SettingsProvider.installSection` (type- and runtime-level).
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
 * Register the advisors settings namespace when possible.
 * Soft-depends on `settings` so headless profiles without a settings provider
 * still boot — `ctx.inject` waits for the service, and `installSection` falls
 * back to the composition entry if the provider later detaches.
 *
 * dsh-settings ≥ 0.1.2: `installSettingsSection` moved onto the provider as
 * `ctx.settings.installSection(owner, ns, schema, entry, hooks)`. The
 * `setSource` thunk is the authoritative read path — `onChange` re-reads it
 * instead of poking `ctx.settings.get` through a cast.
 */
export function installAdvisorsSettings(
  ctx: Context,
  entry: AdvisorsSettings,
  hooks: AdvisorsSettingsHooks,
): void {
  let source: () => AdvisorsSettings = () => entry
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, ADVISORS_SETTINGS_NAMESPACE, ADVISORS_SETTINGS_SCHEMA, entry, {
      setSource: (current) => {
        source = current
      },
      onChange: () => {
        hooks.apply(settingsToConfig(source()))
      },
    })
  })
}
