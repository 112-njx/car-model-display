/**
 * T6 语音控车 · B 段接线层
 *
 * 职责：
 *   1. 用 **carConfig** 构建词表（id/label/aliases 的最终来源是契约，不是本模块）
 *   2. 把 `voiceController` 接到 `store.voice` 与 `toast`（§13.2）
 *   3. 暴露 **§13.3 ④ 注入点** `window.__carDisplayVoiceInject(ctor | null)`
 *
 * 纪律：本文件只**调用** store 的 action，不修改 `state/**`、`config/**`、`devtools/**`（§12.1）。
 * 状态机本身在 `voiceController.js`（框架无关），本文件只做 store/React 的薄适配。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { CAMERA_VIEWS, LIGHTS, PART_GROUPS, PARTS } from "../config/carConfig.js";
import { carStore } from "../state/useCarStore.js";
import { buildVocabulary } from "./commands.js";
import { detectSupport, setRecognitionCtor } from "./recognition.js";
import { cancelSpeech, speak } from "./synthesis.js";
import { createSnapshot, createVoiceController } from "./voiceController.js";

/**
 * 语音词表：**id / label / aliases 全部来自 carConfig**，commands.js 只补充面向 ASR 的结构词。
 * 契约一变（改 label、加别名），语音侧自动跟随，不存在第二份真相。
 */
export const VOICE_VOCABULARY = buildVocabulary({
  partGroups: PART_GROUPS,
  parts: PARTS,
  lights: LIGHTS,
  cameraViews: CAMERA_VIEWS,
});

/** §13.2 冻结的 action 集合（`executePlan` 的 api）。走 `carStore` 句柄，非 React 上下文同样可用。 */
export const VOICE_STORE_ACTIONS = {
  setPart: (id, open) => carStore.getState().setPart(id, open),
  openGroup: (groupId) => carStore.getState().openGroup(groupId),
  closeGroup: (groupId) => carStore.getState().closeGroup(groupId),
  setLight: (id, on) => carStore.getState().setLight(id, on),
  setCameraView: (viewId) => carStore.getState().setCameraView(viewId),
  orbitOnce: () => carStore.getState().orbitOnce(),
  bumpInteraction: () => carStore.getState().bumpInteraction(),
};

/** 已挂载的控制器实例：注入点需要立刻刷新它们的 supported 快照。 */
const liveControllers = new Set();

/** 快照 → store.voice（§13.2；`lastCommand` / `error` 初值为 null，故空值写 null）。 */
function syncVoiceState(snapshot) {
  const store = carStore.getState();
  store.setVoiceStatus(snapshot.status);
  store.setTranscript(snapshot.transcript || "");
  store.setLastCommand(snapshot.lastCommand || null);
  store.setVoiceSupported(snapshot.supported);
}

/** 语音回执 toast 文案：与点击通道的措辞保持一致（「已执行：…」）。 */
export function voiceToastText(reply) {
  return reply ? `已执行：${reply}` : "";
}

/**
 * §13.3 ④ `window.__carDisplayVoiceInject(ctor | null)`
 * 传入构造函数即替换真实 `SpeechRecognition`，并令 `voice.supported` 变 true
 * （T9 的 mock 回放因此走完整链路而非降级分支）；传 null 恢复真实实现。
 * **模块被引入即生效**，不依赖组件是否挂载。
 */
export function injectVoiceRecognition(ctor) {
  setRecognitionCtor(ctor);
  const support = detectSupport();
  carStore.getState().setVoiceSupported(support.supported);
  // 已挂载的控制器立刻刷新快照，避免 UI 停留在旧的降级态
  for (const controller of liveControllers) controller.refreshSupport();
  return support;
}

if (typeof window !== "undefined") {
  window.__carDisplayVoiceInject = injectVoiceRecognition;
  // 初始化 store.voice.supported，让 UI 在语音组件挂载前就知道能力探测结果
  carStore.getState().setVoiceSupported(detectSupport().supported);
}

/**
 * 语音控车 hook。
 * @param {{onLog?:Function, onToast?:Function, autoRefresh?:boolean}} [options]
 *        onToast(text, level) 默认写 store.pushToast；沙盒等场景可覆盖
 * @returns 快照（可直接摊给 VoiceButton）+ 操作函数 + controller
 */
export function useVoiceControl(options = {}) {
  const { onLog, onToast, autoRefresh = true } = options;
  const [snapshot, setSnapshot] = useState(createSnapshot);
  const controllerRef = useRef(null);
  const optionsRef = useRef({ onLog, onToast });
  optionsRef.current = { onLog, onToast };
  const lastResultSeq = useRef(0);

  useEffect(() => {
    const controller = createVoiceController({
      api: VOICE_STORE_ACTIONS,
      vocabulary: VOICE_VOCABULARY,
      speak,
      onLog: (text) => optionsRef.current.onLog?.(text),
      onChange: (next) => {
        setSnapshot(next);
        syncVoiceState(next);

        // 只在「处理完一条新结果」时发 toast，避免状态变化刷屏
        if (next.resultSeq !== lastResultSeq.current) {
          lastResultSeq.current = next.resultSeq;
          const push = optionsRef.current.onToast || ((text, level) => carStore.getState().pushToast(text, level));
          if (next.reply) push(voiceToastText(next.reply), "success");
          else if (next.hint) push(next.hint, "warn");
        }
      },
    });
    controllerRef.current = controller;
    liveControllers.add(controller);
    controller.refreshSupport();
    if (autoRefresh) controller.refreshPermission();
    return () => {
      liveControllers.delete(controller);
      controller.destroy();
      controllerRef.current = null;
    };
  }, [autoRefresh]);

  const setSpeechEnabled = useCallback((enabled) => {
    if (!enabled) cancelSpeech();
    controllerRef.current?.setSpeechEnabled(enabled);
  }, []);

  return {
    ...snapshot,
    controller: controllerRef.current,
    start: useCallback(() => controllerRef.current?.start(), []),
    stop: useCallback(() => controllerRef.current?.stop(), []),
    toggle: useCallback(() => controllerRef.current?.toggle(), []),
    setSpeechEnabled,
  };
}
