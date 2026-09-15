/**
 * Advisors plugin Web RPC (loopback-only): settings page ⇄ Host config channel.
 *
 *   - host: prefix route on `webServer`, fenced by `connection.requestRejection`
 *   - browser: `ctx.connection.rpc.call(channel, endpoint, payload)`
 *
 * The channel is mounted directly on `webServer` from this plugin's own fiber
 * (soft `ctx.inject(['connection', 'webServer'], ...)`) instead of
 * `connection.rpc.handle()`: dsh-client-connection 0.1.5-rc.x dropped
 * `webServer` from its own inject, so `rpc.handle()` now resolves `webServer`
 * in the connection plugin's scope and throws
 * `cannot get property "webServer" without inject` for every caller. The route
 * below speaks the identical wire protocol (client-request/server-response
 * envelopes over POST JSON), so the browser half needs no change and the
 * plugin boots on both core 0.1.2 and 0.1.5.
 *
 * Constants are duplicated in `client/rpc.js` — the browser bundle cannot
 * import a Host file. Keep channel / endpoints / wire shapes in lockstep.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import type { AdvisorsPluginConfig } from './config.js'

export const ADVISORS_RPC_CHANNEL = '/dsh-advisors'

export const ADVISORS_ENDPOINTS = Object.freeze({
  configGet: 'advisors.config.get',
  configSet: 'advisors.config.set',
  sessionGet: 'advisors.session.get',
  sessionSet: 'advisors.session.set',
})

/** RPC payloads are small JSON settings bodies; far above any realistic edit. */
const MAX_BODY_BYTES = 4 * 1024 * 1024

/** Mirrors dsh-client-connection: endpoint segments after the channel prefix. */
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/

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
  /** Session-level switch state for the composer chip. */
  readSession(sessionId: string): unknown
  /** Set (boolean) or clear (null) a session-level enable override. */
  writeSession(sessionId: string, enabled: boolean | null): unknown
}

type RpcHandler = (
  endpoint: string,
  payload?: unknown,
  signal?: { aborted?: boolean },
) => unknown

/** Structural view of the host Connection service used for the auth fence. */
interface ConnectionLike {
  requestRejection(request: IncomingMessage): number | undefined
}

/** Structural view of the host WebServer route registry. */
interface WebServerLike {
  register(route: {
    kind: 'prefix'
    path: string
    handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>
  }): () => void
}

function endpointFromPath(channel: string, pathname: string): string | undefined {
  if (!pathname.startsWith(`${channel}/`)) return undefined
  const endpoint = pathname.slice(channel.length + 1)
  const segments = endpoint.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..' || !ENDPOINT_SEGMENT_PATTERN.test(s))) {
    return undefined
  }
  return endpoint
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** `server-response` envelope, wire-identical to dsh-client-connection. */
function respondEnvelope(res: ServerResponse, rpcId: string, result: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({ type: 'server-response', rpcId, result }))
}

function respondError(res: ServerResponse, rpcId: string, code: string, message: string): void {
  respondEnvelope(res, rpcId, { ok: false, error: { code, message, details: {} } })
}

/** Serve one channel request: buffered node:http ⇄ envelope bridge. */
async function serveRpc(req: IncomingMessage, res: ServerResponse, handler: RpcHandler): Promise<void> {
  const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname
  const endpoint = endpointFromPath(ADVISORS_RPC_CHANNEL, pathname)
  if (req.method !== 'POST' || endpoint === undefined) {
    res.writeHead(404)
    res.end('not found')
    return
  }
  const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : ''
  if (contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    res.writeHead(415)
    res.end('content type must be application/json')
    return
  }

  const declaredLength = Number(req.headers['content-length'])
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    res.writeHead(413, { connection: 'close' })
    res.end()
    req.destroy()
    return
  }
  const chunks: Buffer[] = []
  let received = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    received += buffer.byteLength
    if (received > MAX_BODY_BYTES) {
      res.writeHead(413, { connection: 'close' })
      res.end()
      req.destroy()
      return
    }
    chunks.push(buffer)
  }

  let body: unknown
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    res.writeHead(400)
    res.end('body is not JSON')
    return
  }
  const envelope = body as Record<string, unknown>
  const rpcId = typeof envelope?.rpcId === 'string' ? envelope.rpcId : 'invalid-request'
  if (!isRecord(body) || body.type !== 'client-request' || typeof body.rpcId !== 'string' || typeof body.method !== 'string') {
    respondError(res, rpcId, 'gateway/bad-request', 'invalid client-request message')
    return
  }
  if (body.method !== endpoint) {
    respondError(res, rpcId, 'gateway/bad-request', `method ${JSON.stringify(body.method)} does not match endpoint ${JSON.stringify(endpoint)}`)
    return
  }

  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })
  try {
    const result = await handler(endpoint, body.payload, abort.signal)
    respondEnvelope(res, rpcId, result)
  } catch (error) {
    res.writeHead(500)
    res.end(`handler failure: ${String(error)}`)
  }
}

/**
 * Mount the `/dsh-advisors` channel on the host web server.
 *
 * Soft-injected: profiles without `connection`/`webServer` (headless) skip the
 * channel and keep reviewing. The route is fenced by the same Host/Origin +
 * browser-auth check Connection applies to its own channels.
 */
export function installAdvisorsRpc(
  ctx: Context,
  bridge: AdvisorsRpcBridge,
  log: { warn?: (...args: unknown[]) => void } = {},
): void {
  ctx.inject(['connection', 'webServer'], (rpcCtx) => {
    const { connection, webServer } = rpcCtx as unknown as {
      connection?: ConnectionLike
      webServer?: WebServerLike
    }
    if (typeof connection?.requestRejection !== 'function' || typeof webServer?.register !== 'function') {
      log.warn?.('[advisors] Connection RPC transport unavailable — settings page disabled')
      return
    }
    rpcCtx.effect(
      () =>
        webServer.register({
          kind: 'prefix',
          path: ADVISORS_RPC_CHANNEL,
          handler: async (req, res) => {
            const rejection = connection.requestRejection(req)
            if (rejection !== undefined) {
              res.writeHead(rejection)
              res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
              return
            }
            await serveRpc(req, res, advisorsHandler(bridge))
          },
        }),
      'advisors: /dsh-advisors rpc channel',
    )
  })
}

/** Endpoint dispatch, shared by the mounted route. */
function advisorsHandler(bridge: AdvisorsRpcBridge): RpcHandler {
  return async (endpoint, payload = {}, signal) => {
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
    if (endpoint === ADVISORS_ENDPOINTS.sessionGet || endpoint === ADVISORS_ENDPOINTS.sessionSet) {
      const body = payload as { sessionId?: unknown; enabled?: unknown } | undefined
      const sessionId = typeof body?.sessionId === 'string' ? body.sessionId.trim() : ''
      if (!sessionId) return fail(`${endpoint} expects a non-empty sessionId`)
      if (endpoint === ADVISORS_ENDPOINTS.sessionGet) return ok(bridge.readSession(sessionId))
      const enabled = body?.enabled
      if (enabled !== null && typeof enabled !== 'boolean') {
        return fail('advisors.session.set expects enabled to be a boolean or null (null = follow global)')
      }
      return ok(bridge.writeSession(sessionId, enabled))
    }
    return fail(`unknown advisors endpoint: ${String(endpoint)}`)
  }
}
