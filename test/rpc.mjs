// Unit checks for the self-mounted /dsh-advisors RPC channel (src/rpc.ts).
// The channel registers directly on the plugin's own `webServer` instead of
// `connection.rpc.handle()`, which dsh-client-connection 0.1.5-rc.x broke for
// callers. Run: node test/rpc.mjs
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'

import { installAdvisorsRpc, ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS } from '../lib/rpc.js'

// --- mock cordis ctx / services -------------------------------------------------

function makeCtx({ rejection } = {}) {
  const state = { route: null, disposed: false }
  const webServer = {
    register(route) {
      state.route = route
      return () => {
        state.disposed = true
        state.route = null
      }
    },
  }
  const connection = { requestRejection: () => rejection }
  const rpcCtx = {
    connection,
    webServer,
    effect(fn) {
      state.disposeEffect = fn
      state.cleanup = fn()
    },
  }
  const ctx = {
    inject(names, cb) {
      assert.deepEqual([...names].sort(), ['connection', 'webServer'])
      cb(rpcCtx)
    },
  }
  return { ctx, state, webServer, connection }
}

function makeReq({ method = 'POST', url = `${ADVISORS_RPC_CHANNEL}/${ADVISORS_ENDPOINTS.configGet}`, body, headers } = {}) {
  const payload = body === undefined ? JSON.stringify({ type: 'client-request', rpcId: 'r1', method: ADVISORS_ENDPOINTS.configGet, payload: {} }) : body
  return Object.assign(Readable.from([Buffer.from(payload)]), {
    method,
    url,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function makeRes() {
  return {
    status: 0,
    body: '',
    writableEnded: false,
    writeHead(status) {
      this.status = status
      return this
    },
    end(chunk) {
      if (chunk) this.body += chunk
      this.writableEnded = true
    },
    on() {},
  }
}

const bridge = {
  read: () => ({ enabled: true }),
  write: (partial) => ({ written: partial }),
  readSession: () => ({ override: null }),
  writeSession: () => ({ ok: true }),
}

// --- mount + full round trip ---

{
  const { ctx, state } = makeCtx()
  installAdvisorsRpc(ctx, bridge)
  assert.equal(state.route.kind, 'prefix')
  assert.equal(state.route.path, ADVISORS_RPC_CHANNEL)

  const res = makeRes()
  await state.route.handler(makeReq(), res)
  assert.equal(res.status, 200)
  const envelope = JSON.parse(res.body)
  assert.equal(envelope.type, 'server-response')
  assert.equal(envelope.rpcId, 'r1')
  assert.deepEqual(envelope.result, { ok: true, value: { enabled: true } })

  state.cleanup()
  assert.equal(state.disposed, true, 'effect cleanup unregisters the route')
}

// --- auth fence ---

{
  const { ctx, state } = makeCtx({ rejection: 401 })
  installAdvisorsRpc(ctx, bridge)
  const res = makeRes()
  await state.route.handler(makeReq(), res)
  assert.equal(res.status, 401)
  assert.equal(res.body, 'unauthorized')
}

// --- wire edge cases (mirror dsh-client-connection semantics) ---

async function run(raw, url, method = 'POST', headers) {
  const { ctx, state } = makeCtx()
  installAdvisorsRpc(ctx, bridge)
  const res = makeRes()
  await state.route.handler(makeReq({ url: url ?? undefined, body: raw, method, headers }), res)
  return res
}

// non-JSON body → 400
assert.equal((await run('not-json')).status, 400)
// wrong content-type → 415
assert.equal((await run(undefined, undefined, 'POST', { 'content-type': 'text/plain' })).status, 415)
// GET → 404
assert.equal((await run(undefined, undefined, 'GET')).status, 404)
// path outside the channel's endpoint space → 404
assert.equal((await run(undefined, ADVISORS_RPC_CHANNEL)).status, 404)

// method/endpoint mismatch → gateway/bad-request envelope
{
  const res = await run(JSON.stringify({ type: 'client-request', rpcId: 'r2', method: 'other', payload: {} }))
  assert.equal(res.status, 200)
  assert.equal(JSON.parse(res.body).result.error.code, 'gateway/bad-request')
}

// unknown endpoint → plugin-level fail result
{
  const res = await run(JSON.stringify({ type: 'client-request', rpcId: 'r3', method: 'nope', payload: {} }), `${ADVISORS_RPC_CHANNEL}/nope`)
  assert.equal(res.status, 200)
  const result = JSON.parse(res.body).result
  assert.equal(result.ok, false)
  assert.match(result.error.message, /unknown advisors endpoint/)
}

// invalid envelope → invalid-request fallback rpcId
{
  const res = await run(JSON.stringify({ type: 'bogus' }))
  const envelope = JSON.parse(res.body)
  assert.equal(envelope.rpcId, 'invalid-request')
  assert.equal(envelope.result.error.code, 'gateway/bad-request')
}

// configSet round trip through the endpoint dispatch
{
  const res = await run(
    JSON.stringify({ type: 'client-request', rpcId: 'r4', method: ADVISORS_ENDPOINTS.configSet, payload: { enabled: false } }),
    `${ADVISORS_RPC_CHANNEL}/${ADVISORS_ENDPOINTS.configSet}`,
  )
  assert.deepEqual(JSON.parse(res.body).result, { ok: true, value: { written: { enabled: false } } })
}

console.log('rpc.mjs: all assertions passed')
