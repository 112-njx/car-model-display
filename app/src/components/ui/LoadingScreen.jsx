import React, { useEffect, useRef, useState } from "react";
import { STRINGS } from "./strings";

// T4 · 中文加载页（纯展示组件 + 自身生命周期，由 props 驱动）
//
// props:
//   progress    number  0..100 目标进度（原始值，组件内部做平滑推进）
//   loadedBytes number  已下载字节（字节级读数，>0 且 totalBytes>0 时显示 MB）
//   totalBytes  number  总字节
//   sceneReady  boolean 首帧场景是否就绪；为 true 时进度补到 100 并进入退场
//   hasError    boolean 资源加载失败，显示中断状态与重试按钮
//   onRetry     function 重试回调（缺省时按钮不存在）
//   bypass      boolean 命中缓存时直接不渲染
//
// 说明：
//   1. 字节级读数（MB）在 T1 基线中由 useVehicleGLTF 的传输回调写入 store，
//      §13.2 的新 store 未包含该字段（已在 docs/contracts/CHANGELOG.md 登记）。
//      T8 接线时：能拿到字节就传，拿不到就传 0 —— 组件自动回退为中文提示，不显示 0 / 0 MB。
//   2. 组件不读任何 store，接线阶段由 T8 注入真实数据。

const MIN_DISPLAY_MS = 900;
const EXIT_DURATION_MS = 720;
const PROGRESS_TRAVEL_MS = 1800;
const BYTES_PER_MB = 1_048_576;

export function LoadingScreen({
  progress = 0,
  loadedBytes = 0,
  totalBytes = 0,
  sceneReady = false,
  hasError = false,
  onRetry,
  bypass = false,
  minDisplayMs = MIN_DISPLAY_MS,
  exitDurationMs = EXIT_DURATION_MS,
}) {
  const startedAt = useRef(performance.now());
  const targetRef = useRef(0);
  const displayedRef = useRef(0);
  const readyRef = useRef(false);
  const [displayed, setDisplayed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  targetRef.current = sceneReady ? 100 : Math.min(96, Math.max(0, progress));
  readyRef.current = sceneReady;

  // 进度平滑推进：每帧向目标值靠拢，避免加载回调的跳变
  useEffect(() => {
    if (bypass) return undefined;
    let frame;
    let previous = performance.now();

    const advance = (time) => {
      const elapsed = Math.min(64, time - previous);
      previous = time;
      const next = Math.min(
        targetRef.current,
        displayedRef.current + (elapsed / PROGRESS_TRAVEL_MS) * 100,
      );
      if (next !== displayedRef.current) {
        displayedRef.current = next;
        setDisplayed(next);
      }
      if (displayedRef.current < 100 || !readyRef.current) {
        frame = window.requestAnimationFrame(advance);
      }
    };

    frame = window.requestAnimationFrame(advance);
    return () => window.cancelAnimationFrame(frame);
  }, [bypass]);

  const canEnter = !bypass && sceneReady && !hasError && displayed >= 99.9;

  useEffect(() => {
    if (!canEnter) return undefined;
    const remaining = Math.max(0, minDisplayMs - (performance.now() - startedAt.current));
    const completeTimer = window.setTimeout(() => setIsComplete(true), remaining);
    const dismissTimer = window.setTimeout(() => setIsDismissed(true), remaining + exitDurationMs);
    return () => {
      window.clearTimeout(completeTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [canEnter, minDisplayMs, exitDurationMs]);

  if (bypass || isDismissed) return null;

  const visible = Math.round(displayed);
  const percentLabel = String(visible).padStart(2, "0");
  const hasBytes = totalBytes > 0 && loadedBytes > 0;
  const status = hasError
    ? STRINGS.loading.statusError
    : canEnter
      ? STRINGS.loading.statusReady
      : sceneReady || progress >= 100
        ? STRINGS.loading.statusCalibrating
        : progress > 0
          ? STRINGS.loading.statusLoading
          : STRINGS.loading.statusPreparing;

  return (
    <section
      className={`cd-ui-loading${isComplete ? " is-complete" : ""}${hasError ? " has-error" : ""}`}
      data-testid="initial-loader"
      aria-label={STRINGS.loading.ariaLabel}
      aria-busy={!isComplete}
      aria-live="polite"
    >
      <header className="cd-ui-loading__header">
        <span className="cd-ui-loading__brand">{STRINGS.loading.brand}</span>
        <span className="cd-ui-loading__edition">{STRINGS.loading.edition}</span>
      </header>

      <div className="cd-ui-loading__hero" aria-hidden="true">
        <span>{STRINGS.loading.heroKicker}</span>
        <p>{STRINGS.loading.heroTitle}</p>
      </div>

      <div className="cd-ui-loading__telemetry">
        <div className="cd-ui-loading__status">
          <span>{status}</span>
          <strong>{percentLabel}</strong>
        </div>
        <div
          className="cd-ui-loading__rule"
          role="progressbar"
          aria-label={STRINGS.loading.progressAria}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-valuenow={visible}
        >
          <span style={{ "--cd-ui-loading-progress": visible / 100 }} />
        </div>
        <div className="cd-ui-loading__meta" aria-hidden="true">
          <span>{STRINGS.loading.channel}</span>
          <span>
            {hasBytes
              ? STRINGS.loading.bytes(
                (loadedBytes / BYTES_PER_MB).toFixed(1),
                (totalBytes / BYTES_PER_MB).toFixed(1),
              )
              : STRINGS.loading.fallbackNote}
          </span>
        </div>
        {hasError && onRetry && (
          <button className="cd-ui-loading__retry" type="button" onClick={onRetry}>
            {STRINGS.loading.retry}
          </button>
        )}
      </div>
    </section>
  );
}
