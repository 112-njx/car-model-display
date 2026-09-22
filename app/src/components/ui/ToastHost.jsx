import React, { useEffect } from "react";
import { STRINGS } from "./strings";

// T4 · Toast 执行反馈宿主（纯展示组件，由 props 驱动）
//
// props:
//   toasts    ToastItem[]  形如 { id, text, level, ts }，level: 'info'|'success'|'warn'
//   onDismiss (id) => void 关闭单条（点击或超时自动触发）
//   duration  number       自动消失时长（毫秒）
//
// 接线阶段：T8 把 store.toast 与 store.dismissToast 注入即可。

const AUTO_DISMISS_MS = 2600;

function Toast({ item, onDismiss, duration }) {
  useEffect(() => {
    if (!onDismiss || !duration) return undefined;
    const timer = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timer);
  }, [item.id, onDismiss, duration]);

  const level = item.level === "success" || item.level === "warn" ? item.level : "info";

  return (
    <li className={`cd-ui-toast cd-ui-toast--${level}`}>
      <button
        type="button"
        className="cd-ui-toast__body"
        onClick={() => onDismiss?.(item.id)}
        aria-label={`${item.text}，${STRINGS.toast.dismiss}`}
      >
        <span className="cd-ui-toast__dot" aria-hidden="true" />
        <span className="cd-ui-toast__text">{item.text}</span>
      </button>
    </li>
  );
}

export function ToastHost({ toasts = [], onDismiss, duration = AUTO_DISMISS_MS }) {
  return (
    <ul className="cd-ui-toast-host" role="status" aria-live="polite">
      {toasts.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} duration={duration} />
      ))}
    </ul>
  );
}
