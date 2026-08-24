// Unit sanity checks for the pure parts of dsh-advisors.
// Run: node test/unit.mjs
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { normalizeConfig, resolveSessionEnabled, splitModelSelector } from '../lib/config.js'
import { parseNotes, buildSystemPrompt } from '../lib/reviewer.js'
import { buildTranscript, isGenuineUserMessage } from '../lib/transcript.js'
import { loadGuidance } from '../lib/guidance.js'
import { loadRoster, nameSlug } from '../lib/roster.js'
import { executeAdvisorTool } from '../lib/tools.js'

// --- splitModelSelector ---
assert.deepEqual(splitModelSelector('anthropic/claude-sonnet-4-5'), { provider: 'anthropic', model: 'claude-sonnet-4-5' })
assert.deepEqual(splitModelSelector('gpt-5'), { model: 'gpt-5' })
assert.deepEqual(splitModelSelector(''), { model: undefined })

// --- normalizeConfig defaults ---
const defaults = normalizeConfig(undefined)
assert.equal(defaults.enabled, true)
assert.equal(defaults.advisors.length, 0, 'no explicit roster by default')
assert.equal(defaults.defaultAdvisor.name, 'Advisor')
assert.deepEqual(defaults.defaultAdvisor.tools, ['read', 'grep', 'glob'])
assert.equal(defaults.immuneTurns, 3)
assert.equal(defaults.rosterFiles, true)

// --- resolveSessionEnabled: session override wins over the global switch ---
assert.equal(resolveSessionEnabled(true, undefined), true)
assert.equal(resolveSessionEnabled(false, undefined), false)
assert.equal(resolveSessionEnabled(true, false), false)
assert.equal(resolveSessionEnabled(false, true), true)

const roster = normalizeConfig({
  model: 'anthropic/claude-sonnet-4-5',
  advisors: [
    { name: 'Sec', instructions: 'watch secrets' },
    { name: 'Off', enabled: false },
    { name: 'NoTools', tools: [] },
  ],
})
assert.equal(roster.advisors.length, 2)
assert.equal(roster.advisors[0].provider, 'anthropic')
assert.equal(roster.advisors[0].model, 'claude-sonnet-4-5')
assert.deepEqual(roster.advisors[1].tools, [])

// --- parseNotes ---
assert.deepEqual(parseNotes('{"notes": []}'), [])
assert.deepEqual(
  parseNotes('```json\n{"notes": [{"severity": "blocker", "note": "queue bypass at src/jobs.ts:42"}]}\n```'),
  [{ severity: 'blocker', note: 'queue bypass at src/jobs.ts:42' }],
)
// unknown severity degrades to nit; blank notes dropped
assert.deepEqual(
  parseNotes('{"notes": [{"severity": "weird", "note": "x"}, {"severity": "nit", "note": "  "}]}'),
  [{ severity: 'nit', note: 'x' }],
)
assert.deepEqual(parseNotes('I found nothing wrong.'), [])

// --- transcript ---
const ev = (type, data) => ({ type, seq: 0, time: 0, data })
const slice = [
  ev('user/message', { content: [{ type: 'text', text: 'fix the bug' }], source: { kind: 'user' } }),
  ev('user/message', { content: [{ type: 'text', text: 'advisor note' }], source: { kind: 'plugin', plugin: 'dsh-advisors' } }),
  ev('assistant/message', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'done' }] } }),
  ev('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'edit', arguments: '{"file":"a.ts"}' }),
  ev('tool/result', { turn: 1, step: 1, message: { content: [{ type: 'text', text: 'ok' }] } }),
]
assert.equal(slice.filter(isGenuineUserMessage).length, 1)
const transcript = buildTranscript(slice, 12000)
assert.match(transcript, /## User\nfix the bug/)
assert.match(transcript, /## Injected context \(plugin: dsh-advisors\)/)
assert.match(transcript, /## Assistant\ndone/)
assert.match(transcript, /### Tool call: edit/)
assert.match(transcript, /### Tool result\nok/)

// --- guidance discovery ---
const root = mkdtempSync(join(tmpdir(), 'advisors-test-'))
mkdirSync(join(root, '.git'))
mkdirSync(join(root, 'pkg'))
writeFileSync(join(root, 'ADVISORS.md'), 'root guidance')
writeFileSync(join(root, 'pkg', 'ADVISORS.md'), 'pkg guidance')
const guidance = loadGuidance(join(root, 'pkg'))
assert.match(guidance, /root guidance/)
assert.match(guidance, /pkg guidance/)
assert.ok(guidance.indexOf('root guidance') < guidance.indexOf('pkg guidance'), 'outer guidance first')

// --- tools ---
writeFileSync(join(root, 'pkg', 'hello.ts'), 'const answer = 42\nexport default answer\n')
const readOut = await executeAdvisorTool({ cwd: root }, 'read', { path: 'pkg/hello.ts' })
assert.match(readOut, /1\tconst answer = 42/)
const grepOut = await executeAdvisorTool({ cwd: root }, 'grep', { pattern: 'answer' })
assert.match(grepOut, /pkg\/hello\.ts:1:/)
const globOut = await executeAdvisorTool({ cwd: root }, 'glob', { pattern: '**/*.ts' })
assert.match(globOut, /pkg\/hello\.ts/)
await assert.rejects(() => executeAdvisorTool({ cwd: root }, 'read', { path: '../outside' }), /escapes/)

// --- roster files ---
assert.equal(nameSlug('My Advisor!'), 'my-advisor')
writeFileSync(join(root, 'WATCHDOG.yml'), `
instructions: shared root rules
advisors:
  - name: Security
    model: anthropic/claude-sonnet-4-5
    tools: [read, grep]
    instructions: watch secrets
  - name: Style
    enabled: false
`)
writeFileSync(join(root, 'pkg', 'ADVISORS.yaml'), `
instructions: pkg rules
advisors:
  - name: security        # same slug as root "Security" → inner replaces outer
    instructions: pkg-specific security rules
`)
const warnings = []
const rosterResult = loadRoster(join(root, 'pkg'), (m) => warnings.push(m))
assert.equal(rosterResult.entries.length, 2, 'Style + replaced Security')
assert.equal(rosterResult.instructions, 'shared root rules\n\npkg rules', 'shared instructions accumulate outer→inner')
const security = rosterResult.entries.find((e) => e.name.toLowerCase() === 'security')
assert.equal(security.name, 'security', 'inner entry replaces ancestor same-name entry')
assert.equal(security.instructions, 'pkg-specific security rules')
assert.ok(rosterResult.files.some((f) => f.endsWith('WATCHDOG.yml')))
assert.ok(rosterResult.files.some((f) => f.endsWith('ADVISORS.yaml')))

// invalid YAML is skipped with a warning, not an error
writeFileSync(join(root, 'pkg', 'WATCHDOG.yml'), 'advisors: [unclosed')
const warned = []
const partial = loadRoster(join(root, 'pkg'), (m) => warned.push(m))
assert.ok(warned.some((m) => /invalid YAML/.test(m)))
assert.equal(partial.entries.length, 2, 'other files still participate')

// --- system prompt assembles ---
const prompt = buildSystemPrompt({
  advisor: { name: 'Advisor', instructions: 'watch the queue', tools: [] },
  route: { provider: 'p', model: 'm' },
  transcript: '',
  guidance: 'guide me',
  workspace: '/ws',
  toolRounds: 0,
  maxTokens: 1024,
  stream: async function* () {},
})
assert.match(prompt, /watch the queue/)
assert.match(prompt, /guide me/)
assert.match(prompt, /Output contract/)

console.log('all unit checks passed')
