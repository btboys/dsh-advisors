/**
 * Transcript extraction: fold a slice of the session event log into a compact,
 * reviewer-facing text rendering of what the main agent just did.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'

/** Join the visible text blocks of one message's content. */
export function textOf(content: readonly ContentBlock[] | undefined): string {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block.type === 'text')
    .map((block) => (block as { text: string }).text)
    .join('\n')
    .trim()
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}… [+${text.length - max} chars]`
}

/**
 * Whether one user/message event is a genuine human prompt rather than
 * plugin-injected context (advisor notes, runtime snapshots, skill loads…).
 */
export function isGenuineUserMessage(event: SessionEvent): boolean {
  if (event.type !== 'user/message') return false
  return (event.data as { source?: { kind?: string } }).source?.kind === 'user'
}

/**
 * Render the events of one reviewed range into a transcript for the advisor.
 * Assistant stream chunks are skipped (the assembled assistant/message already
 * carries the same text); tool calls and results are paired by proximity.
 */
export function buildTranscript(events: readonly SessionEvent[], maxChars: number): string {
  const lines: string[] = []
  for (const event of events) {
    switch (event.type) {
      case 'user/message': {
        const data = event.data as { content?: ContentBlock[]; source?: { kind?: string; plugin?: string } }
        const text = textOf(data.content)
        if (!text) break
        if (data.source?.kind === 'user') {
          lines.push(`## User\n${truncate(text, 4000)}`)
        } else if (data.source?.kind === 'plugin') {
          // Keep injected context visible but compact — it explains WHY the
          // agent changed direction (including earlier advisor notes).
          lines.push(`## Injected context (plugin: ${data.source.plugin ?? 'unknown'})\n${truncate(text, 800)}`)
        }
        break
      }
      case 'assistant/message': {
        const data = event.data as { message?: { content?: ContentBlock[] }; interrupted?: boolean }
        const text = textOf(data.message?.content)
        if (!text) break
        lines.push(`## Assistant${data.interrupted ? ' (interrupted)' : ''}\n${truncate(text, 4000)}`)
        break
      }
      case 'tool/call': {
        const data = event.data as { name?: string; arguments?: string }
        lines.push(`### Tool call: ${data.name ?? 'unknown'}\n${truncate((data.arguments ?? '').trim(), 600)}`)
        break
      }
      case 'tool/result': {
        const data = event.data as { message?: { content?: ContentBlock[] }; error?: { name: string; code: string } }
        const text = textOf(data.message?.content)
        const prefix = data.error ? `### Tool result (ERROR ${data.error.code})` : '### Tool result'
        if (text) lines.push(`${prefix}\n${truncate(text, 600)}`)
        break
      }
      default:
        break
    }
  }
  return truncate(lines.join('\n\n'), maxChars)
}
