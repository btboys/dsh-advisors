/**
 * Browser half: registers a top-level "顾问 / Advisors" settings section.
 * Talks to the host over loopback-only /dsh-advisors RPC.
 */
import { AdvisorsSettings } from './AdvisorsSettings.jsx'
import { en, zh } from './locales.js'

const NS = 'settings.advisors'

export const name = 'dsh-advisors'
export const inject = ['slots', 'connection', 'locale']

export function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'advisors: settings dictionaries')
  const t = ctx.locale.bind(NS)

  const rpcCall = (channel, endpoint, payload, signal) => {
    return ctx.connection.rpc.call(channel, endpoint, payload, signal).then((result) => ({
      ok: Boolean(result?.ok),
      value: result && result.ok ? result.value : undefined,
      error: result && !result.ok ? result.error : undefined,
    }))
  }

  // llm.models is host-scoped — no session needed.
  const loadModelCatalog = () => ctx.connection.api.llm.models({}).then((r) => {
    if (!r.result.ok) throw new Error(r.result.error.message)
    return r.result.value
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'advisors',
    order: 65,
    label: () => t('nav'),
    locale: NS,
    inject: () => ({ rpcCall, loadModelCatalog }),
  }, AdvisorsSettings))
}
