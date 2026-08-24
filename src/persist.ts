/**
 * Persistence for advisors configuration edited from the Web settings page.
 *
 * The page writes through `/dsh-advisors` RPC, which applies the new config to
 * the running service and persists it under DSH_HOME so the choice survives
 * restarts. Loader-patch values remain the composition base; persisted keys
 * win on merge.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import type { AdvisorsPluginConfig } from './config.js'

const CONFIG_REL = join('advisors', 'config.json')

/** Resolve DSH_HOME, falling back to ~/.dsh. */
export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME
  return fromEnv && fromEnv.length > 0 ? fromEnv : join(homedir(), '.dsh')
}

/** Absolute path of the persisted advisors config file. */
export function configFilePath(): string {
  return join(dshHome(), CONFIG_REL)
}

/** Read the persisted advisors config, if any. */
export function loadPersistedConfig(): AdvisorsPluginConfig | null {
  const file = configFilePath()
  if (!existsSync(file)) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as AdvisorsPluginConfig) : null
  } catch {
    return null
  }
}

/** Merge persisted overrides over the loader-patch base. */
export function mergePersisted(
  base: AdvisorsPluginConfig | undefined,
  persisted: AdvisorsPluginConfig | null,
): AdvisorsPluginConfig {
  if (!persisted) return { ...(base ?? {}) }
  return { ...(base ?? {}), ...persisted }
}

/** Serialize the advisors config to disk. */
export function persistConfig(config: AdvisorsPluginConfig): void {
  const file = configFilePath()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}
