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
import { STRINGS } from "../components/ui/strings.js";
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
  // T8 集成期改调 applyCameraView（CHANGELOG 0011/0019）：与 UI 通道同源，
  // 否则语音「看侧面」在相机已被拖走时同样会因同值赋值而失效。
  setCameraView: (viewId) => carStore.getState().applyCameraView(viewId),
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

/**
 * 语音回执 toast 文案。
 *
 * T8 集成期对齐（人工裁定）：**三条通道的 Toast 文案必须完全一致**（T4《挂载说明》§3 的要求）。
 * 做法：优先按动作计划查 `ui/strings.js` 的模板——与 UI 按钮 / 3D 点击两条通道用的是**同一张表**；
 * 计划为空或形态超出模板覆盖范围（如复合指令、多动作）时，回退到本模块的中文回执 `已执行：<回执>`。
 *
 * 与 `describeActions` 的区别：`reply` 是**语音播报/字幕**用的自然语言回执（保留「已执行：」前缀更有语音味），
 * 而 Toast 是**与另外两条通道共用的反馈面**，故按模板统一。
 */
export function voiceToastText(reply, actions) {
  const plan = Array.isArray(actions) ? actions : [];
  const one = plan.length === 1 ? plan[0] : null;
  if (one) {
    if (one.type === "part") {
      const label = PARTS.find((part) => part.id === one.id)?.label;
      if (label) return one.open ? STRINGS.toast.partOpened(label) : STRINGS.toast.partClosed(label);
    } else if (one.type === "light") {
      const label = LIGHTS.find((light) => light.id === one.id)?.label;
      if (label) return one.on ? STRINGS.toast.lightOn(label) : STRINGS.toast.lightOff(label);
    } else if (one.type === "group") {
      const label = PART_GROUPS.find((group) => group.id === one.id)?.label;
      if (label) return one.open ? STRINGS.toast.groupOpened(label) : STRINGS.toast.groupClosed(label);
    } else if (one.type === "camera") {
      if (one.command === "orbit-once") return STRINGS.toast.orbitOnce;
      const label = CAMERA_VIEWS.find((view) => view.id === one.view)?.label;
      if (label) return STRINGS.toast.cameraView(label);
    }
  }
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

/**
 * §13.3 ④ 增补（T8 集成期受理，见 docs/contracts/CHANGELOG.md 0018）：
 * **程序化「开始 / 停止识别」驱动入口**。
 *
 * 动机（T9 登记）：§13.3④ 只冻结了「替换构造函数」，没冻结「让识别进入 listening」的入口；
 * 而 mock 的 `say()` 只能投递给已 `start()` 的实例，`createRecognizer()` 又是模块内部导出、
 * 未挂 `window` —— T9 的 `verify-voice` 在无麦克风的 headless 环境里无法驱动会话，
 * 只能退化为点 UI（脆且受样式影响）。
 *
 * 语义：对**当前所有已挂载**的控制器批量下发（正常只有 1 个），返回受影响的控制器数。
 * 未挂载任何语音组件时返回 0（不抛错，便于脚本判空）。
 */
function forEachLiveController(action) {
  let count = 0;
  for (const controller of liveControllers) {
    action(controller);
    count += 1;
  }
  return count;
}

if (typeof window !== "undefined") {
  window.__carDisplayVoiceInject = injectVoiceRecognition;
  window.__carDisplayVoiceStart = () => forEachLiveController((c) => c.start());
  window.__carDisplayVoiceStop = () => forEachLiveController((c) => c.stop());
  window.__carDisplayVoiceToggle = () => forEachLiveController((c) => c.toggle());
  window.__carDisplayVoiceControllerCount = () => liveControllers.size;
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
          if (next.reply) push(voiceToastText(next.reply, next.actions), "success");
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
