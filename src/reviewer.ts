/**
 * The advisor review loop: one independent model call (plus optional
 * investigative tool rounds) over a rendered transcript of the main agent's
 * recent work, producing structured severity-graded notes.
 */
import {
  BlockAssembler,
  createToolResultMessage,
  createUserMessage,
  type ContentBlock,
  type Message,
  type TokenUsage,
  type ToolCallBlock,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'
import type { ResolvedAdvisor } from './config.js'
import { ADVISOR_TOOL_SCHEMAS, executeAdvisorTool } from './tools.js'
import { textOf } from './transcript.js'

export type NoteSeverity = 'nit' | 'concern' | 'blocker'

export interface AdvisorNote {
  severity: NoteSeverity
  note: string
}

export interface ReviewOutcome {
  notes: AdvisorNote[]
  usage?: TokenUsage
  /** Raw assembled reply text, kept for diagnostics. */
  raw: string
  /** Tool rounds actually used. */
  toolRounds: number
}

/** What the advisor plugin needs from the host LLM service. */
export interface LlmStream {
  (options: {
    provider: string
    model: string
    reasoningEffort?: string
    messages: Message[]
    system?: string
    tools?: ToolSchema[]
    maxTokens?: number
    signal?: AbortSignal
    sessionId?: string
  }): AsyncIterable<unknown>
}

export interface ReviewParams {
  advisor: ResolvedAdvisor
  route: { provider: string; model: string }
  transcript: string
  guidance: string
  workspace: string
  toolRounds: number
  maxTokens: number
  stream: LlmStream
  signal?: AbortSignal
}

const SEVERITIES: readonly NoteSeverity[] = ['nit', 'concern', 'blocker']

/** Build the reviewer system prompt: role, priorities, and the output contract. */
export function buildSystemPrompt(params: ReviewParams): string {
  const { advisor, guidance, workspace } = params
  const sections = [
    `You are "${advisor.name}", an independent advisor reviewing another AI coding agent's work as its session unfolds. You are NOT the agent doing the work — you are a second set of eyes.`,
    `The transcript below shows the main agent's recent activity in the workspace ${workspace}. Review it critically: missed requirements, risky or wrong API usage, weak verification, unnecessary complexity, security issues, or a likely wrong direction.`,
    advisor.instructions ? `Review priorities for this advisor:\n${advisor.instructions}` : '',
    guidance ? `Project review guidance (ADVISORS.md):\n${guidance}` : '',
    `Rules:
- Only report actionable, evidence-based problems. No praise, no summaries, no restating what happened.
- Verify claims with your tools before reporting when you have tool access; do not guess about file contents you can read.
- Do not repeat a point that an earlier injected advisor note already made.
- Report at most 3 notes, ordered by importance. When everything looks fine, report none.
- Write each note in the same language the user used in the transcript.
- Keep each note under 500 characters: state the problem, the evidence, and the suggested correction.`,
    `Output contract — respond with ONLY one JSON object, no prose, no code fences:
{"notes": []}
or
{"notes": [{"severity": "nit" | "concern" | "blocker", "note": "..."}]}
Severity meaning:
- "nit": cleanup, simplification, or a low-risk edge case.
- "concern": a material risk, a missed constraint, or a likely wrong direction.
- "blocker": continuing unchanged is likely to waste work or produce a broken result.`,
  ]
  return sections.filter(Boolean).join('\n\n')
}

/** Leniently parse the advisor's JSON verdict out of its reply text. */
export function parseNotes(raw: string): AdvisorNote[] {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  const list = (parsed as { notes?: unknown })?.notes
  if (!Array.isArray(list)) return []
  const notes: AdvisorNote[] = []
  for (const item of list.slice(0, 5)) {
    const severity = (item as { severity?: string })?.severity
    const note = (item as { note?: unknown })?.note
    if (typeof note !== 'string' || !note.trim()) continue
    notes.push({
      severity: SEVERITIES.includes(severity as NoteSeverity) ? (severity as NoteSeverity) : 'nit',
      note: note.trim().slice(0, 1000),
    })
  }
  return notes
}

/**
 * Run one advisor review. Streams the advisor model, executes any requested
 * investigative tool calls (bounded by `toolRounds`), and parses the verdict.
 */
export async function runReview(params: ReviewParams): Promise<ReviewOutcome> {
  const { advisor, route, stream } = params
  const granted = advisor.tools.filter((tool) => tool in ADVISOR_TOOL_SCHEMAS)
  const schemas: ToolSchema[] = granted.map((tool) => ADVISOR_TOOL_SCHEMAS[tool])
  const system = buildSystemPrompt(params)

  const messages: Message[] = [
    createUserMessage({
      content: [
        { type: 'text', text: `Transcript of the main agent's recent activity:\n\n${params.transcript}` },
      ],
      source: { kind: 'plugin', plugin: 'dsh-advisors' },
    }),
  ]

  let usage: TokenUsage | undefined
  let rounds = 0
  for (;;) {
    const assembler = new BlockAssembler()
    for await (const chunk of stream({
      provider: route.provider,
      model: route.model,
      reasoningEffort: advisor.reasoningEffort as never,
      messages,
      system,
      tools: schemas.length ? schemas : undefined,
      maxTokens: params.maxTokens,
      signal: params.signal,
    })) {
      assembler.push(chunk as never)
    }
    if (assembler.usage) usage = assembler.usage

    // A failed advisor call must surface: the failure is adapter-normalized
    // into the terminal finish chunk rather than thrown by the stream.
    const finish = assembler.finish
    if (finish.kind === 'error' || finish.kind === 'aborted') {
      throw new Error(`advisor model call ${finish.kind}: ${finish.failure.message} (${finish.failure.code})`)
    }

    const blocks: ContentBlock[] = assembler.blocks()
    const toolCalls = blocks.filter((block): block is ToolCallBlock => block.type === 'tool-call')

    if (finish.kind === 'tool-calls' && toolCalls.length > 0 && rounds < params.toolRounds && schemas.length > 0) {
      rounds++
      messages.push(assembler.message({ kind: 'model', provider: route.provider, model: route.model }))
      for (const call of toolCalls) {
        let text: string
        let isError = false
        try {
          const args = JSON.parse(call.arguments || '{}') as Record<string, unknown>
          text = await executeAdvisorTool({ cwd: params.workspace, signal: params.signal }, call.name, args)
        } catch (error) {
          isError = true
          text = `error: ${error instanceof Error ? error.message : String(error)}`
        }
        messages.push(createToolResultMessage({
          callId: call.id,
          content: [{ type: 'text', text }],
          isError,
        }))
      }
      continue
    }

    const raw = textOf(blocks)
    return { notes: parseNotes(raw), usage, raw, toolRounds: rounds }
  }
}
