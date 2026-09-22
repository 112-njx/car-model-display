import React, { useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";
import { useCarStore } from "../../state/useCarStore";
import { STRINGS } from "./strings";

// T4 · 中文加载页（store 连接版，B 段）
//
// 挂载：`<LoadingScreen onRetry={() => window.location.reload()} />`
//
// 数据来源（两路，字节优先）：
//   1. `store.loading`（§13.2 增补片，见 docs/contracts/CHANGELOG.md 0010，由 T5 的
//      VehicleModel 把 useVehicleGLTF 的传输回调接进来）—— 提供真正的**字节级进度**；
//   2. drei `useProgress()` —— 提供加载条目数与百分比，并作为 0010 落地前的兜底。
//   该片尚未落地时 `store.loading` 为 undefined，组件自动走兜底路径，不报错。
//
// props（全部可选，仅供自测/隔离覆盖）：
//   progress / loadedBytes / totalBytes / sceneReady / hasError / onRetry / bypass
//
// 说明：FormDrive 原有的 localStorage 跳过逻辑（`formdrive:studio-ready:v1`）已移除——
//      该键名是英文品牌残留，且与新加载页"每次进入都展示中控启动"的定位冲突。
//      需要跳过时由宿主传 `bypass`。

const MIN_DISPLAY_MS = 900;
const EXIT_DURATION_MS = 720;
const PROGRESS_TRAVEL_MS = 1800;
const BYTES_PER_MB = 1_048_576;

export function LoadingScreen({
  progress: progressProp,
  loadedBytes: loadedBytesProp,
  totalBytes: totalBytesProp,
  sceneReady: sceneReadyProp,
  hasError: hasErrorProp,
  onRetry,
  bypass = false,
  minDisplayMs = MIN_DISPLAY_MS,
  exitDurationMs = EXIT_DURATION_MS,
}) {
  const { active, progress: dreiProgress, errors } = useProgress();
  const loading = useCarStore((state) => state.loading);

  const rawProgress = progressProp ?? loading?.progress ?? dreiProgress ?? 0;
  const loadedBytes = loadedBytesProp ?? loading?.loadedBytes ?? 0;
  const totalBytes = totalBytesProp ?? loading?.totalBytes ?? 0;
  // 就绪判据：优先取 store 的显式信号；否则用 drei 的「无进行中加载且已到 100%」
  const sceneReady = sceneReadyProp ?? loading?.sceneReady ?? (!active && dreiProgress >= 100);
  const hasError = hasErrorProp ?? errors.length > 0;

  const startedAt = useRef(performance.now());
  const targetRef = useRef(0);
  const displayedRef = useRef(0);
  const readyRef = useRef(false);
  const [displayed, setDisplayed] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  targetRef.current = sceneReady ? 100 : Math.min(96, Math.max(0, rawProgress));
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
      : sceneReady || rawProgress >= 100
        ? STRINGS.loading.statusCalibrating
        : rawProgress > 0
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
