/**
 * Settings → 顾问 page. Stages edits locally and commits one RPC write on Save.
 * Provider / Model / Effort use cascading <select> dropdowns populated from
 * the host's llm.models catalog (host-scoped, no session needed).
 */
import { useEffect, useMemo, useState } from 'react'
import { ADVISORS_ENDPOINTS, ADVISORS_RPC_CHANNEL } from './rpc.js'

const STYLE_ID = 'dsh-advisors-settings-css'
const CSS = `
.dsha-page{max-width:720px;display:flex;flex-direction:column;gap:14px;color:var(--dsw-alias-label-primary)}
.dsha-title{margin:0;font-size:18px;font-weight:600}
.dsha-intro,.dsha-hint,.dsha-note,.dsha-status{margin:0;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}
.dsha-card{border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:14px;background:var(--dsw-alias-bg-elevated,transparent)}
.dsha-field{display:flex;flex-direction:column;gap:6px}
.dsha-fieldHead{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsha-label{font-size:13px;font-weight:500}
.dsha-input,.dsha-textarea,.dsha-select{width:100%;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-primary,transparent);color:inherit;padding:8px 10px;font:inherit;font-size:13px}
.dsha-textarea{min-height:88px;resize:vertical}
.dsha-select{cursor:pointer;appearance:auto}
.dsha-toggle{position:relative;width:40px;height:22px;flex:none}
.dsha-toggleInput{opacity:0;width:0;height:0;position:absolute}
.dsha-toggleTrack{position:absolute;inset:0;border-radius:999px;background:var(--dsw-alias-fill-tertiary,#555);transition:background .15s}
.dsha-toggleThumb{position:absolute;top:2px;left:2px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s}
.dsha-toggleInput:checked + .dsha-toggleTrack{background:var(--dsw-alias-state-business-primary,#3b82f6)}
.dsha-toggleInput:checked ~ .dsha-toggleThumb{transform:translateX(18px)}
.dsha-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dsha-btn{border:0;border-radius:8px;padding:8px 14px;font:inherit;font-size:13px;cursor:pointer}
.dsha-btnPrimary{background:var(--dsw-alias-state-business-primary,#3b82f6);color:#fff}
.dsha-btnPrimary:disabled{opacity:.55;cursor:default}
.dsha-btnGhost{background:transparent;color:inherit;border:1px solid var(--dsw-alias-border-l2)}
.dsha-error{color:var(--dsw-alias-state-danger,#ef4444);margin:0;font-size:13px}
`

function ensureCss() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const tag = document.createElement('style')
  tag.id = STYLE_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}

const DEFAULTS = {
  enabled: true,
  provider: '',
  model: '',
  reasoningEffort: '',
  instructions: '',
  guidance: true,
  immuneTurns: 3,
  maxTranscriptChars: 12000,
  toolRounds: 3,
  reviewMaxTokens: 2048,
  debugLog: '',
  awaitReviewOnFlush: false,
  roster: true,
}

function ToggleRow({ t, id, labelKey, hintKey, checked, disabled, onChange }) {
  return (
    <div className="dsha-field">
      <div className="dsha-fieldHead">
        <label className="dsha-label" htmlFor={id}>{t(labelKey)}</label>
        <span className="dsha-toggle">
          <input
            id={id}
            className="dsha-toggleInput"
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
          <span className="dsha-toggleTrack" />
          <span className="dsha-toggleThumb" />
        </span>
      </div>
      <p className="dsha-hint">{t(hintKey)}</p>
    </div>
  )
}

function TextRow({ t, id, labelKey, hintKey, value, disabled, onChange, type = 'text' }) {
  return (
    <div className="dsha-field">
      <label className="dsha-label" htmlFor={id}>{t(labelKey)}</label>
      <input
        id={id}
        className="dsha-input"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className="dsha-hint">{t(hintKey)}</p>
    </div>
  )
}

function SelectRow({ t, id, labelKey, hintKey, value, options, disabled, onChange, placeholder }) {
  return (
    <div className="dsha-field">
      <label className="dsha-label" htmlFor={id}>{t(labelKey)}</label>
      <select
        id={id}
        className="dsha-select"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <p className="dsha-hint">{t(hintKey)}</p>
    </div>
  )
}

export function AdvisorsSettings({ rpcCall, loadModelCatalog, t }) {
  ensureCss()
  const [draft, setDraft] = useState(DEFAULTS)
  const [baseline, setBaseline] = useState(DEFAULTS)
  const [loadState, setLoadState] = useState({ status: 'loading' })
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [groups, setGroups] = useState([])

  // Load config + model catalog in parallel.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [configResult, catalog] = await Promise.all([
          rpcCall(ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS.configGet, {}),
          loadModelCatalog().catch(() => ({ groups: [], failures: [] })),
        ])
        if (cancelled) return
        if (!configResult.ok) {
          setLoadState({ status: 'error', message: configResult.error?.message || t('loadError') })
          return
        }
        const next = { ...DEFAULTS, ...(configResult.value || {}) }
        setDraft(next)
        setBaseline(next)
        setGroups(catalog.groups ?? [])
        setLoadState({ status: 'ready' })
      } catch (error) {
        if (cancelled) return
        setLoadState({ status: 'error', message: error instanceof Error ? error.message : t('loadError') })
      }
    })()
    return () => { cancelled = true }
  }, [rpcCall, loadModelCatalog, t])

  // Cascading selects: provider → models → efforts.
  const providerOptions = useMemo(
    () => groups.map((g) => ({ value: g.id, label: g.name || g.id })),
    [groups],
  )

  const selectedGroup = useMemo(
    () => groups.find((g) => g.id === draft.provider) ?? null,
    [groups, draft.provider],
  )

  const modelOptions = useMemo(
    () => (selectedGroup?.models ?? []).map((m) => ({
      value: m.id,
      label: m.name || m.id,
    })),
    [selectedGroup],
  )

  const selectedModel = useMemo(
    () => (selectedGroup?.models ?? []).find((m) => m.id === draft.model) ?? null,
    [selectedGroup, draft.model],
  )

  const effortOptions = useMemo(
    () => (selectedModel?.reasoning?.efforts ?? []).map((e) => ({
      value: e.id,
      label: e.name || e.id,
    })),
    [selectedModel],
  )

  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline)
  const disabled = loadState.status !== 'ready' || busy

  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setStatus('')
  }

  // Cascade resets: changing provider clears model+effort; changing model clears effort.
  const onProviderChange = (value) => {
    setDraft((prev) => ({
      ...prev,
      provider: value,
      model: '',
      reasoningEffort: '',
    }))
    setStatus('')
  }
  const onModelChange = (value) => {
    // Auto-select the model's default effort when available.
    const model = (selectedGroup?.models ?? []).find((m) => m.id === value)
    const defaultEffort = model?.reasoning?.defaultEffort ?? ''
    setDraft((prev) => ({
      ...prev,
      model: value,
      reasoningEffort: defaultEffort,
    }))
    setStatus('')
  }

  const onSave = async () => {
    setBusy(true)
    setStatus(t('saving'))
    try {
      const payload = {
        ...draft,
        immuneTurns: Number(draft.immuneTurns) || 0,
        maxTranscriptChars: Number(draft.maxTranscriptChars) || 12000,
        toolRounds: Number(draft.toolRounds) || 0,
        reviewMaxTokens: Number(draft.reviewMaxTokens) || 2048,
      }
      const result = await rpcCall(ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS.configSet, payload)
      if (!result.ok) {
        setStatus(result.error?.message || t('saveError'))
        return
      }
      const next = { ...DEFAULTS, ...(result.value || {}) }
      setDraft(next)
      setBaseline(next)
      setStatus(t('saved'))
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('saveError'))
    } finally {
      setBusy(false)
    }
  }

  const onDiscard = () => {
    setDraft(baseline)
    setStatus('')
  }

  if (loadState.status === 'loading') {
    return <div className="dsha-page"><p className="dsha-status">{t('saving')}</p></div>
  }
  if (loadState.status === 'error') {
    return <div className="dsha-page"><p className="dsha-error">{loadState.message}</p></div>
  }

  return (
    <div className="dsha-page">
      <h2 className="dsha-title">{t('title')}</h2>
      <p className="dsha-intro">{t('intro')}</p>

      <div className="dsha-card">
        <ToggleRow t={t} id="dsha-enabled" labelKey="enabled" hintKey="enabledHint" checked={!!draft.enabled} disabled={disabled} onChange={(v) => setField('enabled', v)} />
        <SelectRow
          t={t} id="dsha-provider" labelKey="provider" hintKey="providerHint"
          value={draft.provider || ''} disabled={disabled}
          options={providerOptions}
          placeholder={t('inherit')}
          onChange={onProviderChange}
        />
        <SelectRow
          t={t} id="dsha-model" labelKey="model" hintKey="modelHint"
          value={draft.model || ''} disabled={disabled || !draft.provider}
          options={modelOptions}
          placeholder={t('inherit')}
          onChange={onModelChange}
        />
        {effortOptions.length > 0 && (
          <SelectRow
            t={t} id="dsha-effort" labelKey="reasoningEffort" hintKey="reasoningEffortHint"
            value={draft.reasoningEffort || ''} disabled={disabled || !draft.model}
            options={effortOptions}
            placeholder={t('inherit')}
            onChange={(v) => setField('reasoningEffort', v)}
          />
        )}
        <div className="dsha-field">
          <label className="dsha-label" htmlFor="dsha-instructions">{t('instructions')}</label>
          <textarea
            id="dsha-instructions"
            className="dsha-textarea"
            value={draft.instructions || ''}
            disabled={disabled}
            onChange={(event) => setField('instructions', event.target.value)}
          />
          <p className="dsha-hint">{t('instructionsHint')}</p>
        </div>
      </div>

      <div className="dsha-card">
        <ToggleRow t={t} id="dsha-guidance" labelKey="guidance" hintKey="guidanceHint" checked={!!draft.guidance} disabled={disabled} onChange={(v) => setField('guidance', v)} />
        <ToggleRow t={t} id="dsha-roster" labelKey="roster" hintKey="rosterHint" checked={!!draft.roster} disabled={disabled} onChange={(v) => setField('roster', v)} />
        <ToggleRow t={t} id="dsha-flush" labelKey="awaitReviewOnFlush" hintKey="awaitReviewOnFlushHint" checked={!!draft.awaitReviewOnFlush} disabled={disabled} onChange={(v) => setField('awaitReviewOnFlush', v)} />
        <TextRow t={t} id="dsha-immune" labelKey="immuneTurns" hintKey="immuneTurnsHint" type="number" value={String(draft.immuneTurns ?? 3)} disabled={disabled} onChange={(v) => setField('immuneTurns', v)} />
        <TextRow t={t} id="dsha-chars" labelKey="maxTranscriptChars" hintKey="maxTranscriptCharsHint" type="number" value={String(draft.maxTranscriptChars ?? 12000)} disabled={disabled} onChange={(v) => setField('maxTranscriptChars', v)} />
        <TextRow t={t} id="dsha-rounds" labelKey="toolRounds" hintKey="toolRoundsHint" type="number" value={String(draft.toolRounds ?? 3)} disabled={disabled} onChange={(v) => setField('toolRounds', v)} />
        <TextRow t={t} id="dsha-tokens" labelKey="reviewMaxTokens" hintKey="reviewMaxTokensHint" type="number" value={String(draft.reviewMaxTokens ?? 2048)} disabled={disabled} onChange={(v) => setField('reviewMaxTokens', v)} />
        <TextRow t={t} id="dsha-debug" labelKey="debugLog" hintKey="debugLogHint" value={draft.debugLog || ''} disabled={disabled} onChange={(v) => setField('debugLog', v)} />
      </div>

      <p className="dsha-note">{t('rosterNote')}</p>

      <div className="dsha-actions">
        <button type="button" className="dsha-btn dsha-btnPrimary" disabled={disabled || !dirty} onClick={onSave}>{t('save')}</button>
        <button type="button" className="dsha-btn dsha-btnGhost" disabled={disabled || !dirty} onClick={onDiscard}>{t('discard')}</button>
        {status ? <span className="dsha-status">{status}</span> : null}
      </div>
    </div>
  )
}
