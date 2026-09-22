import React from "react";
import { isSpeechSynthesisSupported } from "./synthesis.js";
import { useVoiceControl } from "./useVoiceControl.js";
import { VoiceButton } from "./VoiceButton.jsx";

/**
 * T6 语音控车 · VoiceControl（**容器组件**，T8 挂载的就是它）
 *
 * 职责：把 `useVoiceControl()` 的快照摊给纯展示的 `VoiceButton`。
 * 所有业务逻辑都在 `voiceController.js`（状态机）与 `useVoiceControl.js`（store 接线）里，
 * 本组件只做 prop 传递，因此换皮不影响行为。
 *
 * props：
 *   compact  手机底栏紧凑模式
 *   className  追加类名（T8 做布局用）
 *   onReady(controller)  控制器就绪回调（测试/调试用：可拿到 controller 手动驱动，不走麦克风）
 *   onLog(text)  事件日志回调（测试/调试用）
 */
export function VoiceControl({ compact = false, className = "", onReady, onLog }) {
  const voice = useVoiceControl({ onLog });

  React.useEffect(() => {
    if (onReady) onReady(voice.controller);
  }, [onReady, voice.controller]);

  return (
    <VoiceButton
      status={voice.status}
      supported={voice.supported}
      transcript={voice.transcript}
      reply={voice.reply}
      hint={voice.hint}
      message={voice.message}
      error={voice.error}
      onToggle={voice.toggle}
      onRetry={voice.start}
      speechEnabled={voice.speechEnabled}
      onToggleSpeech={() => voice.setSpeechEnabled(!voice.speechEnabled)}
      speechSupported={isSpeechSynthesisSupported()}
      compact={compact}
      className={className}
    />
  );
}

export default VoiceControl;
