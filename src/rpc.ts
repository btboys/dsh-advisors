/**
 * Advisors plugin Web RPC (loopback-only): settings page ⇄ Host config channel.
 *
 *   - host: `ctx.connection.rpc.handle(channel, handler)`
 *   - browser: `ctx.connection.rpc.call(channel, endpoint, payload)`
 *
 * Constants are duplicated in `client/rpc.js` — the browser bundle cannot
 * import a Host file. Keep channel / endpoints / wire shapes in lockstep.
 */
import type { AdvisorsPluginConfig } from './config.js'

export const ADVISORS_RPC_CHANNEL = '/dsh-advisors'

export const ADVISORS_ENDPOINTS = Object.freeze({
  configGet: 'advisors.config.get',
  configSet: 'advisors.config.set',
})

function ok(value: unknown): { ok: true; value: unknown } {
  return { ok: true, value }
}

function fail(message: string): {
  ok: false
  error: { code: string; message: string; details: { issues: [{ message: string }] } }
} {
  return {
    ok: false,
    error: { code: 'bad-request', message, details: { issues: [{ message }] } },
  }
}

/** Persistence + apply surface the host service exposes to the channel. */
export interface AdvisorsRpcBridge {
  read(): AdvisorsPluginConfig
  write(partial: unknown): AdvisorsPluginConfig
}

type RpcHandle = {
  handle(
    channel: string,
    handler: (endpoint: string, payload?: unknown, signal?: { aborted?: boolean }) => unknown,
    options?: { authority: string },
  ): unknown
}

/**
 * Install the `/dsh-advisors` logical channel on the host connection.rpc.
 * @returns disposer; no-op when RPC is unavailable.
 */
export function installAdvisorsRpc(
  rpc: RpcHandle | undefined,
  bridge: AdvisorsRpcBridge,
  log: { warn?: (...args: unknown[]) => void } = {},
): () => void {
  if (rpc?.handle === undefined) {
    log.warn?.('[advisors] Connection RPC unavailable — settings page disabled')
    return () => {}
  }

  const dispose = rpc.handle(
    ADVISORS_RPC_CHANNEL,
    async (endpoint: string, payload = {}, signal?: { aborted?: boolean }) => {
      if (signal?.aborted) {
        return { ok: false, error: { code: 'cancelled', message: 'The request was cancelled.', details: {} } }
      }
      if (endpoint === ADVISORS_ENDPOINTS.configGet) return ok(bridge.read())
      if (endpoint === ADVISORS_ENDPOINTS.configSet) {
        if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
          return fail('advisors.config.set expects an object payload')
        }
        return ok(bridge.write(payload))
      }
      return fail(`unknown advisors endpoint: ${String(endpoint)}`)
    },
    { authority: 'loopback' },
  )

  return (): void => {
    void dispose
  }
}
