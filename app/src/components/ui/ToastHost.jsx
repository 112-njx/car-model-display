import React, { useEffect } from "react";
import { useCarStore } from "../../state/useCarStore";
import { STRINGS } from "./strings";

// T4 · Toast 执行反馈宿主（store 连接版，B 段）
//
// 挂载：`<ToastHost />`（无必需 props）。组件订阅 §13.2 的 `store.toast`，
//       把 T4（按钮）/ T5（点击拾取）/ T6（语音）三条通道推进来的中文反馈统一渲染。
//
// props（全部可选，仅用于自测/隔离）：
//   toasts    ToastItem[]  覆盖 store.toast
//   onDismiss (id) => void 覆盖 store.dismissToast
//   duration  number       自动消失时长（毫秒）
//
// ToastItem 形状（§13.2）：{ id, text, level, ts }，level: 'info' | 'success' | 'warn'

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

export function ToastHost({ toasts: toastsProp, onDismiss: onDismissProp, duration = AUTO_DISMISS_MS }) {
  const storeToasts = useCarStore((state) => state.toast);
  const storeDismiss = useCarStore((state) => state.dismissToast);

  const toasts = toastsProp ?? storeToasts;
  const onDismiss = onDismissProp ?? storeDismiss;

  return (
    <ul className="cd-ui-toast-host" role="status" aria-live="polite">
      {toasts.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} duration={duration} />
      ))}
    </ul>
  );
}
