window.__ModuleLoader__.load({
  id: "dsh-advisors",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// client/index.jsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// client/AdvisorsSettings.jsx
var import_react = require("react");

// client/rpc.js
var ADVISORS_RPC_CHANNEL = "/dsh-advisors";
var ADVISORS_ENDPOINTS = Object.freeze({
  configGet: "advisors.config.get",
  configSet: "advisors.config.set"
});

// client/AdvisorsSettings.jsx
var import_jsx_runtime = require("react/jsx-runtime");
var STYLE_ID = "dsh-advisors-settings-css";
var CSS = `
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
`;
function ensureCss() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
var DEFAULTS = {
  enabled: true,
  provider: "",
  model: "",
  reasoningEffort: "",
  instructions: "",
  guidance: true,
  immuneTurns: 3,
  maxTranscriptChars: 12e3,
  toolRounds: 3,
  reviewMaxTokens: 2048,
  debugLog: "",
  awaitReviewOnFlush: false,
  roster: true
};
function ToggleRow({ t, id, labelKey, hintKey, checked, disabled, onChange }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-fieldHead", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsha-label", htmlFor: id, children: t(labelKey) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "dsha-toggle", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "input",
          {
            id,
            className: "dsha-toggleInput",
            type: "checkbox",
            checked,
            disabled,
            onChange: (event) => onChange(event.target.checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsha-toggleTrack" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsha-toggleThumb" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-hint", children: t(hintKey) })
  ] });
}
function TextRow({ t, id, labelKey, hintKey, value, disabled, onChange, type = "text" }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsha-label", htmlFor: id, children: t(labelKey) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "input",
      {
        id,
        className: "dsha-input",
        type,
        value,
        disabled,
        onChange: (event) => onChange(event.target.value)
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-hint", children: t(hintKey) })
  ] });
}
function SelectRow({ t, id, labelKey, hintKey, value, options, disabled, onChange, placeholder }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsha-label", htmlFor: id, children: t(labelKey) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "select",
      {
        id,
        className: "dsha-select",
        value,
        disabled,
        onChange: (event) => onChange(event.target.value),
        children: [
          placeholder && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: placeholder }),
          options.map((opt) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: opt.value, children: opt.label }, opt.value))
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-hint", children: t(hintKey) })
  ] });
}
function AdvisorsSettings({ rpcCall, loadModelCatalog, t }) {
  ensureCss();
  const [draft, setDraft] = (0, import_react.useState)(DEFAULTS);
  const [baseline, setBaseline] = (0, import_react.useState)(DEFAULTS);
  const [loadState, setLoadState] = (0, import_react.useState)({ status: "loading" });
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [status, setStatus] = (0, import_react.useState)("");
  const [groups, setGroups] = (0, import_react.useState)([]);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    (async () => {
      try {
        const [configResult, catalog] = await Promise.all([
          rpcCall(ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS.configGet, {}),
          loadModelCatalog().catch(() => ({ groups: [], failures: [] }))
        ]);
        if (cancelled) return;
        if (!configResult.ok) {
          setLoadState({ status: "error", message: configResult.error?.message || t("loadError") });
          return;
        }
        const next = { ...DEFAULTS, ...configResult.value || {} };
        setDraft(next);
        setBaseline(next);
        setGroups(catalog.groups ?? []);
        setLoadState({ status: "ready" });
      } catch (error) {
        if (cancelled) return;
        setLoadState({ status: "error", message: error instanceof Error ? error.message : t("loadError") });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rpcCall, loadModelCatalog, t]);
  const providerOptions = (0, import_react.useMemo)(
    () => groups.map((g) => ({ value: g.id, label: g.name || g.id })),
    [groups]
  );
  const selectedGroup = (0, import_react.useMemo)(
    () => groups.find((g) => g.id === draft.provider) ?? null,
    [groups, draft.provider]
  );
  const modelOptions = (0, import_react.useMemo)(
    () => (selectedGroup?.models ?? []).map((m) => ({
      value: m.id,
      label: m.name || m.id
    })),
    [selectedGroup]
  );
  const selectedModel = (0, import_react.useMemo)(
    () => (selectedGroup?.models ?? []).find((m) => m.id === draft.model) ?? null,
    [selectedGroup, draft.model]
  );
  const effortOptions = (0, import_react.useMemo)(
    () => (selectedModel?.reasoning?.efforts ?? []).map((e) => ({
      value: e.id,
      label: e.name || e.id
    })),
    [selectedModel]
  );
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const disabled = loadState.status !== "ready" || busy;
  const setField = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setStatus("");
  };
  const onProviderChange = (value) => {
    setDraft((prev) => ({
      ...prev,
      provider: value,
      model: "",
      reasoningEffort: ""
    }));
    setStatus("");
  };
  const onModelChange = (value) => {
    const model = (selectedGroup?.models ?? []).find((m) => m.id === value);
    const defaultEffort = model?.reasoning?.defaultEffort ?? "";
    setDraft((prev) => ({
      ...prev,
      model: value,
      reasoningEffort: defaultEffort
    }));
    setStatus("");
  };
  const onSave = async () => {
    setBusy(true);
    setStatus(t("saving"));
    try {
      const payload = {
        ...draft,
        immuneTurns: Number(draft.immuneTurns) || 0,
        maxTranscriptChars: Number(draft.maxTranscriptChars) || 12e3,
        toolRounds: Number(draft.toolRounds) || 0,
        reviewMaxTokens: Number(draft.reviewMaxTokens) || 2048
      };
      const result = await rpcCall(ADVISORS_RPC_CHANNEL, ADVISORS_ENDPOINTS.configSet, payload);
      if (!result.ok) {
        setStatus(result.error?.message || t("saveError"));
        return;
      }
      const next = { ...DEFAULTS, ...result.value || {} };
      setDraft(next);
      setBaseline(next);
      setStatus(t("saved"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  };
  const onDiscard = () => {
    setDraft(baseline);
    setStatus("");
  };
  if (loadState.status === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsha-page", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-status", children: t("saving") }) });
  }
  if (loadState.status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "dsha-page", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-error", children: loadState.message }) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-page", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", { className: "dsha-title", children: t("title") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-intro", children: t("intro") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, { t, id: "dsha-enabled", labelKey: "enabled", hintKey: "enabledHint", checked: !!draft.enabled, disabled, onChange: (v) => setField("enabled", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        SelectRow,
        {
          t,
          id: "dsha-provider",
          labelKey: "provider",
          hintKey: "providerHint",
          value: draft.provider || "",
          disabled,
          options: providerOptions,
          placeholder: t("inherit"),
          onChange: onProviderChange
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        SelectRow,
        {
          t,
          id: "dsha-model",
          labelKey: "model",
          hintKey: "modelHint",
          value: draft.model || "",
          disabled: disabled || !draft.provider,
          options: modelOptions,
          placeholder: t("inherit"),
          onChange: onModelChange
        }
      ),
      effortOptions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        SelectRow,
        {
          t,
          id: "dsha-effort",
          labelKey: "reasoningEffort",
          hintKey: "reasoningEffortHint",
          value: draft.reasoningEffort || "",
          disabled: disabled || !draft.model,
          options: effortOptions,
          placeholder: t("inherit"),
          onChange: (v) => setField("reasoningEffort", v)
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-field", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "dsha-label", htmlFor: "dsha-instructions", children: t("instructions") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "textarea",
          {
            id: "dsha-instructions",
            className: "dsha-textarea",
            value: draft.instructions || "",
            disabled,
            onChange: (event) => setField("instructions", event.target.value)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-hint", children: t("instructionsHint") })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, { t, id: "dsha-guidance", labelKey: "guidance", hintKey: "guidanceHint", checked: !!draft.guidance, disabled, onChange: (v) => setField("guidance", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, { t, id: "dsha-roster", labelKey: "roster", hintKey: "rosterHint", checked: !!draft.roster, disabled, onChange: (v) => setField("roster", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ToggleRow, { t, id: "dsha-flush", labelKey: "awaitReviewOnFlush", hintKey: "awaitReviewOnFlushHint", checked: !!draft.awaitReviewOnFlush, disabled, onChange: (v) => setField("awaitReviewOnFlush", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextRow, { t, id: "dsha-immune", labelKey: "immuneTurns", hintKey: "immuneTurnsHint", type: "number", value: String(draft.immuneTurns ?? 3), disabled, onChange: (v) => setField("immuneTurns", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextRow, { t, id: "dsha-chars", labelKey: "maxTranscriptChars", hintKey: "maxTranscriptCharsHint", type: "number", value: String(draft.maxTranscriptChars ?? 12e3), disabled, onChange: (v) => setField("maxTranscriptChars", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextRow, { t, id: "dsha-rounds", labelKey: "toolRounds", hintKey: "toolRoundsHint", type: "number", value: String(draft.toolRounds ?? 3), disabled, onChange: (v) => setField("toolRounds", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextRow, { t, id: "dsha-tokens", labelKey: "reviewMaxTokens", hintKey: "reviewMaxTokensHint", type: "number", value: String(draft.reviewMaxTokens ?? 2048), disabled, onChange: (v) => setField("reviewMaxTokens", v) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TextRow, { t, id: "dsha-debug", labelKey: "debugLog", hintKey: "debugLogHint", value: draft.debugLog || "", disabled, onChange: (v) => setField("debugLog", v) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "dsha-note", children: t("rosterNote") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "dsha-actions", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsha-btn dsha-btnPrimary", disabled: disabled || !dirty, onClick: onSave, children: t("save") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "dsha-btn dsha-btnGhost", disabled: disabled || !dirty, onClick: onDiscard, children: t("discard") }),
      status ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "dsha-status", children: status }) : null
    ] })
  ] });
}

// client/locales.js
var zh = {
  nav: "\u987E\u95EE",
  title: "\u987E\u95EE\u5BA1\u9605",
  intro: "\u540E\u53F0\u5BA1\u9605\u6A21\u578B\u89C2\u5BDF\u4E3B agent \u7684\u6BCF\u4E00\u8F6E\u5DE5\u4F5C\uFF0C\u6309\u4E25\u91CD\u7EA7\u522B\u6CE8\u5165 nit / concern / blocker\u3002",
  save: "\u4FDD\u5B58",
  discard: "\u653E\u5F03\u4FEE\u6539",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saved: "\u5DF2\u4FDD\u5B58",
  loadError: "\u52A0\u8F7D\u914D\u7F6E\u5931\u8D25",
  saveError: "\u4FDD\u5B58\u5931\u8D25",
  enabled: "\u542F\u7528\u987E\u95EE",
  enabledHint: "\u5173\u95ED\u540E\u63D2\u4EF6\u4ECD\u52A0\u8F7D\uFF0C\u4F46\u4E0D\u518D\u53D1\u8D77\u5BA1\u9605\u3002",
  provider: "\u5BA1\u9605 Provider",
  providerHint: "\u7559\u7A7A\u5219\u6CBF\u7528\u88AB\u5BA1 agent \u7684 provider\u3002",
  model: "\u5BA1\u9605 Model",
  modelHint: "\u7559\u7A7A\u5219\u6CBF\u7528\u88AB\u5BA1 agent \u7684 model\uFF1B\u4E5F\u652F\u6301 provider/model \u5355\u5B57\u7B26\u4E32\u3002",
  reasoningEffort: "Reasoning Effort",
  reasoningEffortHint: "\u9002\u914D\u5668\u4E13\u5C5E\u63A8\u7406\u529B\u5EA6\uFF1B\u7559\u7A7A\u4E0D\u8986\u76D6\u3002",
  instructions: "\u5171\u4EAB\u6307\u5BFC",
  instructionsHint: "\u8FFD\u52A0\u5230\u6BCF\u4E2A advisor \u7684 system prompt\u3002",
  guidance: "\u52A0\u8F7D ADVISORS.md",
  guidanceHint: "\u4ECE\u7528\u6237\u76EE\u5F55\u4E0E\u5DE5\u4F5C\u533A\u7956\u5148\u76EE\u5F55\u53D1\u73B0\u6307\u5BFC\u6587\u4EF6\u3002",
  roster: "\u53D1\u73B0\u540D\u518C\u6587\u4EF6",
  rosterHint: "\u5728\u672A\u914D\u7F6E advisors[] \u65F6\u8BFB\u53D6 WATCHDOG.yml / ADVISORS.yml\u3002",
  immuneTurns: "\u514D\u75AB\u7A97\u53E3\uFF08turns\uFF09",
  immuneTurnsHint: "\u4E00\u6B21 steer \u540E\u7684\u82E5\u5E72\u4E3B agent turn \u5185\uFF0Cconcern/blocker \u964D\u7EA7\u4E3A\u65C1\u6CE8\u3002",
  maxTranscriptChars: "Transcript \u5B57\u7B26\u4E0A\u9650",
  maxTranscriptCharsHint: "\u6BCF\u6B21\u5BA1\u9605\u5582\u7ED9 advisor \u7684\u4F1A\u8BDD\u622A\u53D6\u4E0A\u9650\u3002",
  toolRounds: "\u8C03\u67E5\u5DE5\u5177\u8F6E\u6570",
  toolRoundsHint: "read / grep / glob \u53EA\u8BFB\u8C03\u67E5\u8F6E\u6570\uFF1B0 = \u53EA\u770B transcript\u3002",
  reviewMaxTokens: "\u8F93\u51FA token \u4E0A\u9650",
  reviewMaxTokensHint: "\u5355\u6B21\u987E\u95EE\u8BF7\u6C42\u7684 max_tokens\u3002",
  awaitReviewOnFlush: "Flush \u65F6\u7B49\u5F85\u5BA1\u9605",
  awaitReviewOnFlushHint: "\u77ED\u751F\u547D\u5468\u671F\uFF08headless\uFF09\u5EFA\u8BAE\u5F00\u542F\uFF1B\u957F\u8FD0\u884C profile \u4FDD\u6301\u5173\u95ED\u3002",
  debugLog: "\u8BCA\u65AD\u65E5\u5FD7\u8DEF\u5F84",
  debugLogHint: "JSONL \u8BCA\u65AD\u6587\u4EF6\uFF1B\u7559\u7A7A\u5173\u95ED\u3002",
  rosterNote: "\u4E13\u5BB6\u540D\u518C advisors[] \u4ECD\u901A\u8FC7 cordis.patch.yml \u6216 WATCHDOG.yml / ADVISORS.yml \u914D\u7F6E\u3002",
  inherit: "\uFF08\u6CBF\u7528\u9ED8\u8BA4\uFF09"
};
var en = {
  nav: "Advisors",
  title: "Advisor review",
  intro: "A background reviewer watches each main-agent turn and injects nit / concern / blocker notes.",
  save: "Save",
  discard: "Discard",
  saving: "Saving\u2026",
  saved: "Saved",
  loadError: "Failed to load config",
  saveError: "Failed to save",
  enabled: "Enable advisors",
  enabledHint: "When off, the plugin stays loaded but never reviews.",
  provider: "Reviewer provider",
  providerHint: "Empty = inherit the reviewed agent's provider.",
  model: "Reviewer model",
  modelHint: "Empty = inherit the reviewed agent's model; also accepts provider/model.",
  reasoningEffort: "Reasoning effort",
  reasoningEffortHint: "Adapter-owned effort id; leave empty to skip.",
  instructions: "Shared instructions",
  instructionsHint: "Appended to every advisor's system prompt.",
  guidance: "Load ADVISORS.md",
  guidanceHint: "Discover guidance files from the user home and workspace ancestors.",
  roster: "Discover roster files",
  rosterHint: "Read WATCHDOG.yml / ADVISORS.yml when no advisors[] roster is configured.",
  immuneTurns: "Immune window (turns)",
  immuneTurnsHint: "After a steer, concerns/blockers become asides for this many main-agent turns.",
  maxTranscriptChars: "Transcript char cap",
  maxTranscriptCharsHint: "Max transcript characters fed to the advisor per review.",
  toolRounds: "Investigative tool rounds",
  toolRoundsHint: "read / grep / glob rounds; 0 = transcript only.",
  reviewMaxTokens: "Output token cap",
  reviewMaxTokensHint: "max_tokens for one advisor request.",
  awaitReviewOnFlush: "Await review on flush",
  awaitReviewOnFlushHint: "Prefer on for short-lived (headless) profiles; off for long-running ones.",
  debugLog: "Debug log path",
  debugLogHint: "JSONL diagnostics file; empty disables.",
  rosterNote: "Specialist advisors[] rosters stay in cordis.patch.yml or WATCHDOG.yml / ADVISORS.yml.",
  inherit: "(inherit)"
};

// client/index.jsx
var NS = "settings.advisors";
var name = "dsh-advisors";
var inject = ["slots", "connection", "locale"];
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "advisors: settings dictionaries");
  const t = ctx.locale.bind(NS);
  const rpcCall = (channel, endpoint, payload, signal) => {
    return ctx.connection.rpc.call(channel, endpoint, payload, signal).then((result) => ({
      ok: Boolean(result?.ok),
      value: result && result.ok ? result.value : void 0,
      error: result && !result.ok ? result.error : void 0
    }));
  };
  const loadModelCatalog = () => ctx.connection.api.llm.models({}).then((r) => {
    if (!r.result.ok) throw new Error(r.result.error.message);
    return r.result.value;
  });
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "advisors",
    order: 65,
    label: () => t("nav"),
    locale: NS,
    inject: () => ({ rpcCall, loadModelCatalog })
  }, AdvisorsSettings));
}

    return module.exports;
  }
});
