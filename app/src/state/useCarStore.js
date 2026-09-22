/**
 * useCarStore.js —— 车辆全局状态（Wave 1 冻结契约，规格来源：docs/roadmap.md §13.2）
 *
 * 单一状态源：点击（T5）/ 语音（T6）/ UI 按钮（T4）/ 相机（T7）四条通道全部读写本 store。
 *
 * 纪律：本文件由 T2 独占；其余 Agent 只读、只调用 action，禁止私改（§12.1）。
 * 需要新字段请登记 docs/contracts/CHANGELOG.md（只增不改）。
 *
 * 句柄：`useCarStore`（React 组件用）+ `carStore`（非 React 上下文：voice 模块、CDP 脚本）。
 * 注意：**输入层必须自行调用 bumpInteraction()**（§13.2：所有用户输入都调）——本 store 的
 * 命令型 action 不隐式 bump，以免掩盖漏调，见 docs/contracts/store-contract.md。
 */

import { create } from "zustand";
import { CAMERA_VIEWS, LIGHTS, PARTS } from "../config/carConfig.js";
import { installAuditHooks } from "../devtools/auditHooks.js";

const PART_IDS = PARTS.map((part) => part.id);
const PART_ID_SET = new Set(PART_IDS);
const LIGHT_IDS = LIGHTS.map((light) => light.id);
const LIGHT_ID_SET = new Set(LIGHT_IDS);
const CAMERA_VIEW_ID_SET = new Set(CAMERA_VIEWS.map((view) => view.id));

const flags = (ids) => Object.fromEntries(ids.map((id) => [id, false]));

const warn = (message) => {
  if (import.meta.env.DEV) console.warn(`[carStore] ${message}`);
};

// toast id 序号：模块级自增，保证同一会话内 id 唯一（§13.2 ToastItem.id）
let toastSeq = 0;

const createVoiceState = () => ({
  status: "idle",
  transcript: "",
  lastCommand: null,
  supported: false,
  error: null,
});

export const useCarStore = create((set) => ({
  // ── state 片（§13.2）──
  parts: flags(PART_IDS), // Record<partId, boolean>，true = 已打开
  lights: flags(LIGHT_IDS), // Record<lightId, boolean>
  cameraView: "hero",
  cameraCommand: { type: null, token: 0 }, // token 自增，保证同一命令可重复触发
  voice: createVoiceState(),
  toast: [], // ToastItem[] = { id, text, level, ts }
  autoRotate: false,
  lastInteractionAt: Date.now(),

  // ── 部件 actions ──
  setPart: (id, open) => {
    if (!PART_ID_SET.has(id)) return warn(`setPart 收到未知部件 id：「${id}」`);
    set((state) => ({ parts: { ...state.parts, [id]: Boolean(open) } }));
  },
  togglePart: (id) => {
    if (!PART_ID_SET.has(id)) return warn(`togglePart 收到未知部件 id：「${id}」`);
    set((state) => ({ parts: { ...state.parts, [id]: !state.parts[id] } }));
  },
  openGroup: (groupId) => {
    const ids = PARTS.filter((part) => part.group === groupId).map((part) => part.id);
    if (ids.length === 0) return warn(`openGroup 收到未知分组 id：「${groupId}」`);
    set((state) => ({ parts: { ...state.parts, ...Object.fromEntries(ids.map((id) => [id, true])) } }));
  },
  closeGroup: (groupId) => {
    const ids = PARTS.filter((part) => part.group === groupId).map((part) => part.id);
    if (ids.length === 0) return warn(`closeGroup 收到未知分组 id：「${groupId}」`);
    set((state) => ({ parts: { ...state.parts, ...Object.fromEntries(ids.map((id) => [id, false])) } }));
  },
  closeAll: () => set({ parts: flags(PART_IDS), lights: flags(LIGHT_IDS) }),

  // ── 灯光 actions ──
  setLight: (id, on) => {
    if (!LIGHT_ID_SET.has(id)) return warn(`setLight 收到未知灯光 id：「${id}」`);
    set((state) => ({ lights: { ...state.lights, [id]: Boolean(on) } }));
  },
  toggleLight: (id) => {
    if (!LIGHT_ID_SET.has(id)) return warn(`toggleLight 收到未知灯光 id：「${id}」`);
    set((state) => ({ lights: { ...state.lights, [id]: !state.lights[id] } }));
  },

  // ── 相机 actions ──
  setCameraView: (viewId) => {
    if (!CAMERA_VIEW_ID_SET.has(viewId)) return warn(`setCameraView 收到未知视角 id：「${viewId}」`);
    set({ cameraView: viewId });
  },
  orbitOnce: () => set((state) => ({ cameraCommand: { type: "orbit-once", token: state.cameraCommand.token + 1 } })),

  // ── Toast actions ──
  pushToast: (text, level = "info") =>
    set((state) => ({
      toast: [...state.toast, { id: `toast-${++toastSeq}`, text, level, ts: Date.now() }],
    })),
  dismissToast: (id) => set((state) => ({ toast: state.toast.filter((item) => item.id !== id) })),

  // ── 待机自转 ──
  setAutoRotate: (on) => set({ autoRotate: Boolean(on) }),
  bumpInteraction: () => set({ lastInteractionAt: Date.now() }),

  // ── 语音 actions ──
  setVoiceStatus: (status) => set((state) => ({ voice: { ...state.voice, status } })),
  setTranscript: (transcript) => set((state) => ({ voice: { ...state.voice, transcript } })),
  setLastCommand: (lastCommand) => set((state) => ({ voice: { ...state.voice, lastCommand } })),
  setVoiceSupported: (supported) => set((state) => ({ voice: { ...state.voice, supported: Boolean(supported) } })),
  resetVoice: () => set({ voice: createVoiceState() }),
}));

/**
 * 非 React 上下文的 store 句柄（§13.2）：voice 模块与 T9 的 CDP 脚本用它读终态、驱动 action。
 * 形状与 §13.3① 一致：{ getState(), setState(partial), subscribe(fn) }
 */
export const carStore = {
  getState: () => useCarStore.getState(),
  setState: (partial, replace) => useCarStore.setState(partial, replace),
  subscribe: (listener) => useCarStore.subscribe(listener),
};

// ── 派生纯函数（具名导出，供 UI 与脚本使用）──

export function isPartOpen(state, id) {
  return Boolean(state?.parts?.[id]);
}

export function openPartIds(state) {
  return PART_IDS.filter((id) => Boolean(state?.parts?.[id]));
}

/** 全部部件已关 **且** 全部灯光已灭（与 closeAll 的复位范围一致，见 store-contract.md） */
export function isAllClosed(state) {
  if (!state) return true;
  return PART_IDS.every((id) => !state.parts?.[id]) && LIGHT_IDS.every((id) => !state.lights?.[id]);
}

export { PART_IDS, LIGHT_IDS };

// 安装 §13.3 的三个全局审计钩子：任何引入 store（含兼容 shim）的模块都会触发
installAuditHooks(carStore);
