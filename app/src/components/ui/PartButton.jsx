import React from "react";
import { STRINGS } from "./strings";

// T4 · 单个可开合部件按钮（纯展示组件，由 props 驱动）
//
// props:
//   label      string   部件中文名（取自 carConfig.PARTS[].label）
//   open       boolean  是否已打开（取自 store.parts[id]）
//   onToggle   function 点击回调
//   kind       string   'window' | 'door' | 'closure'，仅决定左侧图示
//   disabled   boolean  可选
//
// 说明：组件不读 store、不写 store；接线阶段由 ControlPanel 注入。

const GLYPHS = {
  // 车窗：外框 + 下方玻璃线
  window: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M3.5 13.5h17" />
    </>
  ),
  // 车门：外框 + 门把手
  door: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M15 12h1.5" />
    </>
  ),
  // 前/后备箱：外框 + 开启弧线
  closure: (
    <>
      <rect x="3.5" y="8.5" width="17" height="11" rx="2.5" />
      <path d="M6 8.5 8.6 5h6.8L18 8.5" />
    </>
  ),
};

export function PartButton({ label, open = false, onToggle, kind = "closure", disabled = false }) {
  return (
    <button
      type="button"
      className={`cd-ui-part${open ? " is-open" : ""}`}
      aria-pressed={open}
      aria-label={STRINGS.parts.ariaLabel(label, open)}
      disabled={disabled}
      onClick={onToggle}
    >
      <span className="cd-ui-part__glyph" aria-hidden="true">
        <svg viewBox="0 0 24 24">{GLYPHS[kind] ?? GLYPHS.closure}</svg>
      </span>
      <span className="cd-ui-part__label">{label}</span>
      <span className="cd-ui-part__state">{open ? STRINGS.parts.stateOpen : STRINGS.parts.stateClose}</span>
    </button>
  );
}
