// Integration test for AdvisorService with a mocked cordis context.
// Run: node test/service.mjs
import assert from 'node:assert/strict'
import { AdvisorService } from '../lib/service.js'

/** Build a fake host context; `verdicts` is a queue of advisor reply texts. */
function makeHost(verdicts) {
  const listeners = new Map()
  const calls = []
  const ctx = {
    llm: {
      async *stream(options) {
        calls.push(options)
        const text = verdicts.length ? verdicts.shift() : '{"notes": []}'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text } }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    },
    agents: {
      _live: new Map(),
      list() { return [...this._live.values()] },
      get(id) { return this._live.get(id) },
    },
    on(name, fn) {
      if (!listeners.has(name)) listeners.set(name, [])
      listeners.get(name).push(fn)
      return () => {}
    },
    effect() { return () => {} },
    logger: Object.assign(() => ctx.logger, {
      debug() {}, info() {}, warn(...a) { console.error('[warn]', ...a) },
    }),
  }
  const emit = (name, ...args) => {
    for (const fn of listeners.get(name) ?? []) fn(...args)
  }
  return { ctx, emit, calls }
}

function makeAgent(host, id) {
  const scoped = new Map()
  const events = []
  const agent = {
    id,
    options: { provider: 'test-provider', model: 'test-model' },
    injected: [],
    steered: [],
    session: {
      id,
      header: { cwd: process.cwd() },
      get seq() { return events.length },
      events,
    },
    ctx: {
      on(name, fn) {
        if (!scoped.has(name)) scoped.set(name, [])
        scoped.get(name).push(fn)
        return () => {}
      },
    },
    inject(message) { agent.injected.push(message) },
    steer(message) { agent.steered.push(message) },
  }
  host.ctx.agents._live.set(id, agent)
  const push = (type, data) => {
    const event = { type, seq: events.length, time: Date.now(), data }
    events.push(event)
    for (const fn of scoped.get('session/event') ?? []) fn(agent.session, event)
  }
  return { agent, push }
}

const userTurn = (push, { withUser = true, turn = 1 } = {}) => {
  push('turn/start', { turn })
  if (withUser) {
    push('user/message', { content: [{ type: 'text', text: '把缓存改成异步写入' }], source: { kind: 'user' } })
  }
  push('assistant/message', { turn, step: 1, message: { content: [{ type: 'text', text: '已改为同步写。' }] } })
  push('turn/end', { turn, reason: { kind: 'completed' } })
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 20))

// --- 1. a concern note is steered into the session ---
{
  const host = makeHost(['{"notes": [{"severity": "concern", "note": "需求要求异步写入，实现却是同步写。"}]}'])
  new AdvisorService(host.ctx, {})
  const { agent, push } = makeAgent(host, 's1')
  host.emit('agent/created', { agent })
  userTurn(push)
  await flush()
  assert.equal(host.calls.length, 1, 'one advisor LLM call')
  assert.equal(host.calls[0].provider, 'test-provider', 'route inherits agent options')
  assert.equal(agent.steered.length, 1, 'concern steers')
  assert.equal(agent.injected.length, 0)
  assert.match(agent.steered[0].content[0].text, /异步写入/)
  assert.equal(agent.steered[0].source.plugin, 'dsh-advisors')
  console.log('✓ concern steered with inherited route')
}

// --- 2. immune window downgrades the next concern to an aside ---
{
  const host = makeHost([
    '{"notes": [{"severity": "blocker", "note": "first problem"}]}',
    '{"notes": [{"severity": "blocker", "note": "second problem"}]}',
  ])
  new AdvisorService(host.ctx, { immuneTurns: 3 })
  const { agent, push } = makeAgent(host, 's2')
  host.emit('agent/created', { agent })
  userTurn(push, { turn: 1 })
  await flush()
  userTurn(push, { turn: 2 })
  await flush()
  assert.equal(agent.steered.length, 1, 'only the first blocker steers')
  assert.equal(agent.injected.length, 1, 'second blocker downgraded to aside')
  assert.match(agent.injected[0].content[0].text, /旁注/)
  console.log('✓ immune window downgrades to aside')
}

// --- 3. repeated notes are suppressed ---
{
  const host = makeHost([
    '{"notes": [{"severity": "nit", "note": "重复的意见"}]}',
    '{"notes": [{"severity": "nit", "note": "重复的意见"}]}',
  ])
  new AdvisorService(host.ctx, {})
  const { agent, push } = makeAgent(host, 's3')
  host.emit('agent/created', { agent })
  userTurn(push, { turn: 1 })
  await flush()
  userTurn(push, { turn: 2 })
  await flush()
  assert.equal(agent.injected.length, 1, 'duplicate suppressed')
  console.log('✓ duplicate note suppressed')
}

// --- 4. plugin-sourced-only turns never trigger review (loop prevention) ---
{
  const host = makeHost(['{"notes": []}'])
  new AdvisorService(host.ctx, {})
  const { agent, push } = makeAgent(host, 's4')
  host.emit('agent/created', { agent })
  push('turn/start', { turn: 1 })
  push('user/message', { content: [{ type: 'text', text: 'advisor note follow-up' }], source: { kind: 'plugin', plugin: 'dsh-advisors' } })
  push('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'fixed' }] } })
  push('turn/end', { turn: 1, reason: { kind: 'completed' } })
  await flush()
  assert.equal(host.calls.length, 0, 'no review without a genuine user prompt')
  console.log('✓ advisor-triggered turns are not re-reviewed')
}

// --- 5. disabled config and subagent sessions are skipped ---
{
  const host = makeHost(['{"notes": []}'])
  new AdvisorService(host.ctx, { enabled: false })
  const { agent, push } = makeAgent(host, 's5')
  host.emit('agent/created', { agent })
  userTurn(push)
  await flush()
  assert.equal(host.calls.length, 0)

  const host2 = makeHost(['{"notes": []}'])
  new AdvisorService(host2.ctx, {})
  const sub = makeAgent(host2, 's6')
  sub.agent.session.header = { cwd: process.cwd(), origin: 'subagent' }
  host2.emit('agent/created', { agent: sub.agent })
  userTurn(sub.push)
  await flush()
  assert.equal(host2.calls.length, 0, 'subagent sessions are not reviewed')
  console.log('✓ disabled config and subagent sessions skipped')
}

// --- 6. aborted / failed turns are not reviewed ---
{
  const host = makeHost(['{"notes": []}'])
  new AdvisorService(host.ctx, {})
  const { agent, push } = makeAgent(host, 's7')
  host.emit('agent/created', { agent })
  push('turn/start', { turn: 1 })
  push('user/message', { content: [{ type: 'text', text: 'do something' }], source: { kind: 'user' } })
  push('turn/end', { turn: 1, reason: { kind: 'aborted' } })
  await flush()
  assert.equal(host.calls.length, 0)
  console.log('✓ non-completed turns skipped')
}

console.log('all service integration checks passed')
