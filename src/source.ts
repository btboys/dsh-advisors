/**
 * Durable message-source kind owned by this plugin (dsh ≥ 0.2.0).
 *
 * 0.2.0 replaced the shared `{ kind: 'plugin', plugin }` source with a
 * merge-extensible vocabulary: every producer declares its own `kind` here.
 * Consumers that do not know the kind fall through and still render the
 * message as injected context.
 */
import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-advisors': { kind: 'dsh-advisors' } & ContextFormed
  }
}

/** Source kind stamped on every message this plugin injects. */
export const ADVISORS_SOURCE_KIND = 'dsh-advisors'
