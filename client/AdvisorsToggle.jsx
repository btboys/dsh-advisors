/**
 * Composer toolbar chip: a per-session advisors on/off switch living in the
 * `conversation.input.left` seat (session-scoped list). Owner props supply the
 * session snapshot; the entry's inject face supplies `rpcCall`.
 *
 * Semantics: a session override wins over the global switch. Clicking flips
 * the effective state; when the flipped value matches the global switch the
 * override is cleared (null) so the session follows the global switch again.
 */
import { useEffect, useRef, useState } from 'react'
import { ADVISORS_ENDPOINTS, ADVISORS_RPC_CHANNEL } from './rpc.js'

const STYLE_ID = 'dsh-advisors-toggle-css'
const CSS = `
.dsha-chip{display:inline-flex;align-items:center;gap:5px;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
.dsha-chip:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsha-chip:disabled{cursor:default;opacity:.55}
.dsha-chipOn{color:var(--dsw-alias-state-business-primary,#3b82f6);border-color:var(--dsw-alias-state-business-primary,#3b82f6);background:var(--dsw-specific-tip,transparent)}
.dsha-chipDot{width:6px;height:6px;border-radius:50%;background:currentColor;flex:none}
`

function ensureCss() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

export function AdvisorsToggle({ session, rpcCall, t }) {
  ensureCss()
  const sessionId = session?.sessionId
  const [state, setState] = useState(null) // { globalEnabled, override, effective }
  const [busy, setBusy] = useState(false)
  const aliveRef = useRef(true)

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!sessionId || typeof rpcCall !== 'function') return undefined
    const controller = new AbortController()
    rpcCall(ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS.sessionGet, { sessionId }, controller.signal)
      .then((result) => {
        if (aliveRef.current && result.ok) setState(result.value)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [sessionId, rpcCall])

  if (!sessionId || typeof rpcCall !== 'function') return null

  const on = state ? Boolean(state.effective) : true

  const toggle = () => {
    if (busy) return
    const next = !on
    // Clear the override when the flipped value rejoins the global switch.
    const override = state && next === Boolean(state.globalEnabled) ? null : next
    setBusy(true)
    rpcCall(ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS.sessionSet, { sessionId, enabled: override })
      .then((result) => {
        if (aliveRef.current && result.ok) setState(result.value)
      })
      .catch(() => {})
      .finally(() => {
        if (aliveRef.current) setBusy(false)
      })
  }

  const overridden = state?.override !== null && state?.override !== undefined
  const title = on
    ? t(overridden ? 'chip.on.overridden.title' : 'chip.on.title')
    : t(overridden ? 'chip.off.overridden.title' : 'chip.off.title')

  return (
    <button
      type="button"
      className={on ? 'dsha-chip dsha-chipOn' : 'dsha-chip'}
      aria-label={t(on ? 'chip.on.aria' : 'chip.off.aria')}
      aria-pressed={on}
      title={title}
      disabled={busy}
      onClick={toggle}
    >
      <span className="dsha-chipDot" aria-hidden="true" />
      {t('chip.label')}
    </button>
  )
}
