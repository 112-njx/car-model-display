import React from "react";
import "./voice.css";

/**
 * T6 语音控车 · VoiceButton（**纯展示组件**，props 驱动，不读 store）
 *
 * A 段交付：样式、动效、状态文案、实时字幕、降级提示，全部由 props 决定，
 *           因此可在 `voice.sandbox.html` 里脱离 store 独立自测。
 * B 段接线：`useVoiceControl()` 提供 props；容器组件 `VoiceControl` 见本文件末尾（B 段追加）。
 *
 * props：
 *   status         "unsupported" | "idle" | "requesting" | "listening" | "processing" | "error"
 *   supported      能力探测结果（false 时整块降级为中文提示）
 *   transcript     实时字幕（未定稿）
 *   reply          最近一条指令的中文回执（如「已执行：打开全部车窗」）
 *   hint           纠错/错误提示（如「没听出要控制哪个部位…」）
 *   message        降级原因说明（不支持 / 非安全上下文）
 *   error          致命错误文案
 *   onToggle       点击麦克风（开始/停止）
 *   onRetry        错误后重试
 *   speechEnabled / onToggleSpeech / speechSupported   语音播报开关（可选）
 *   compact        紧凑模式（手机底栏）
 */

const STATUS_TEXT = {
  unsupported: "语音控车不可用",
  idle: "点击麦克风开始语音控车",
  requesting: "正在请求麦克风权限…",
  listening: "正在聆听…",
  processing: "正在识别指令…",
  error: "语音识别出错",
};

const MIC_PATH =
  "M12 15a3.2 3.2 0 0 0 3.2-3.2V6.2a3.2 3.2 0 1 0-6.4 0v5.6A3.2 3.2 0 0 0 12 15Zm5.6-3.4a.9.9 0 1 0-1.8 0 3.8 3.8 0 1 1-7.6 0 .9.9 0 1 0-1.8 0 5.6 5.6 0 0 0 4.7 5.53V20H9.4a.9.9 0 1 0 0 1.8h5.2a.9.9 0 1 0 0-1.8h-1.7v-2.87A5.6 5.6 0 0 0 17.6 11.6Z";

export function VoiceButton({
  status = "idle",
  supported = true,
  transcript = "",
  reply = "",
  hint = "",
  message = "",
  error = "",
  onToggle,
  onRetry,
  speechEnabled = false,
  onToggleSpeech,
  speechSupported = true,
  compact = false,
  className = "",
}) {
  const listening = status === "listening";
  const busy = status === "requesting" || status === "processing";
  const failed = status === "error";
  const disabled = !supported || busy;
  const statusText = STATUS_TEXT[status] || STATUS_TEXT.idle;

  const rootClass = [
    "cd-voice",
    compact ? "cd-voice--compact" : "",
    listening ? "cd-voice--listening" : "",
    failed ? "cd-voice--error" : "",
    !supported ? "cd-voice--unsupported" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const buttonLabel = listening ? "停止语音控车" : "开始语音控车";

  return (
    <section className={rootClass} aria-label="语音控车">
      <div className="cd-voice-main">
        <button
          type="button"
          className="cd-voice-btn"
          onClick={onToggle}
          disabled={disabled}
          aria-pressed={listening}
          aria-label={buttonLabel}
          title={supported ? buttonLabel : statusText}
        >
          <span className="cd-voice-ripple" aria-hidden="true" />
          <span className="cd-voice-ripple cd-voice-ripple--2" aria-hidden="true" />
          <span className="cd-voice-ripple cd-voice-ripple--3" aria-hidden="true" />
          <svg className="cd-voice-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d={MIC_PATH} fill="currentColor" />
          </svg>
        </button>

        <div className="cd-voice-body">
          <p className="cd-voice-status" data-status={status}>
            <span className="cd-voice-dot" aria-hidden="true" />
            {statusText}
          </p>

          <p className="cd-voice-transcript" aria-live="polite">
            {transcript ? `“${transcript}”` : supported ? "可以说：打开车窗 / 关闭左前门 / 打开大灯 / 看侧面 / 转一下 / 全部关闭" : "—"}
          </p>

          {reply ? <p className="cd-voice-reply">已执行：{reply}</p> : null}
          {!reply && hint ? <p className="cd-voice-hint">{hint}</p> : null}
          {error ? <p className="cd-voice-error">{error}</p> : null}
        </div>
      </div>

      <div className="cd-voice-foot">
        {!supported ? (
          <p className="cd-voice-fallback" role="status">
            {message || "当前浏览器不支持语音控车，请用桌面版或安卓版 Chrome / Edge 打开。"}
          </p>
        ) : null}

        {failed && onRetry ? (
          <button type="button" className="cd-voice-retry" onClick={onRetry}>
            重试
          </button>
        ) : null}

        {supported && speechSupported && onToggleSpeech ? (
          <button
            type="button"
            className="cd-voice-speech-toggle"
            onClick={onToggleSpeech}
            aria-pressed={speechEnabled}
            title="语音播报：执行指令后朗读回执"
          >
            <span className={`cd-voice-switch ${speechEnabled ? "cd-voice-switch--on" : ""}`} aria-hidden="true">
              <span className="cd-voice-switch-knob" />
            </span>
            语音播报
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default VoiceButton;
