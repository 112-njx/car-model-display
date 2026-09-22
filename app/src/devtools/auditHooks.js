/**
 * auditHooks.js —— 注册式审计钩子与语音注入点（Wave 1 冻结契约，规格来源：docs/roadmap.md §13.3）
 *
 * 本文件是 T9 脚本的**唯一依赖面**，由 T2 独占。其余 Agent **只调用注册函数，不修改本文件**
 * —— 这是九条 Wave 1 分支不冲突的关键设计（§12.4）。
 *
 *   T5  → registerSceneAuditSource("hitTargets", fn)
 *   T8p → registerSceneAuditSource("perf", fn)
 *   T7  → registerSceneAuditSource("autoRotating" | "orbiting" | "position" | "target" | "distance", fn)
 *   T3  → registerSceneAuditSource("autoRotate", fn)（按需）
 *
 * 安装时机：由 state/useCarStore.js 在模块求值时调用 installAuditHooks(carStore)，
 * 因此任何引入 store 的模块（含兼容 shim）都会自动装好 window.__carDisplay* 钩子。
 */

import { LIGHTS, PARTS } from "../config/carConfig.js";

// 落进 __carDisplayCameraAudit() 的 key；其余 key 一律落进 __carDisplaySceneAudit()
const CAMERA_KEYS = new Set(["view", "position", "target", "distance", "autoRotating", "orbiting"]);

const sceneSources = new Map();
const cameraSources = new Map();
let storeHandle = null;

const warn = (message) => {
  if (import.meta.env.DEV) console.warn(`[auditHooks] ${message}`);
};

/**
 * 注册一个审计数据源。
 *
 * @param {string} key 字段名。落点规则：CAMERA_KEYS → __carDisplayCameraAudit()，其余 → __carDisplaySceneAudit()
 * @param {Function|null} fn 取值函数；返回 undefined/null 视为"本次不提供"。传 null 注销该 key
 * @returns {Function} 注销函数（适合在 React effect 的 cleanup 里调用）
 *
 * 合并规则：
 *   - key === "parts" → fn() 返回 `{ [partId]: { progress?, bbox? } }`，**深合并**进基准 parts 数组
 *   - 其余 key → **整体覆盖**基准字段（基准值见下方 sceneAudit/cameraAudit 的注释）
 */
export function registerSceneAuditSource(key, fn) {
  if (typeof key !== "string" || key.length === 0) {
    warn("registerSceneAuditSource 需要一个非空字符串 key");
    return () => {};
  }
  if (fn === null || fn === undefined) {
    sceneSources.delete(key);
    cameraSources.delete(key);
    return () => {};
  }
  if (typeof fn !== "function") {
    warn(`registerSceneAuditSource("${key}") 的第二个参数必须是函数或 null`);
    return () => {};
  }
  const bucket = CAMERA_KEYS.has(key) ? cameraSources : sceneSources;
  bucket.set(key, fn);
  return () => {
    if (bucket.get(key) === fn) bucket.delete(key);
  };
}

// 读取一个源；源抛错时不连坐整个审计，只丢弃该字段（并告警）
function readSource(bucket, key) {
  const fn = bucket.get(key);
  if (!fn) return { present: false, value: undefined };
  try {
    const value = fn();
    return { present: value !== undefined && value !== null, value };
  } catch (error) {
    warn(`审计源 "${key}" 取值抛错，已跳过该字段：${error?.message ?? error}`);
    return { present: false, value: undefined };
  }
}

/**
 * window.__carDisplaySceneAudit() 的实现（§13.3②）。
 *
 * 基准字段（来自 store，永远存在）：
 *   parts:       [{ id, open, progress, bbox }]  progress 默认 open?1:0，bbox 默认 null（T5 可经 "parts" 源覆盖）
 *   lights:      [{ id, on }]
 *   cameraView:  string | null
 *   autoRotate:  boolean（T7 可覆盖为场景真实值）
 *   hitTargets:  []（T5 注册；未注册时为空数组）
 *   perf:        null（T8p 注册；未注册时为 null，消费方须判空）
 */
export function sceneAudit() {
  const state = storeHandle?.getState?.() ?? {};

  const partSource = readSource(sceneSources, "parts");
  const partOverrides = partSource.present && typeof partSource.value === "object" ? partSource.value : {};

  const parts = PARTS.map((part) => {
    const open = Boolean(state.parts?.[part.id]);
    const extra = partOverrides[part.id] ?? {};
    return {
      id: part.id,
      open,
      progress: typeof extra.progress === "number" ? extra.progress : open ? 1 : 0,
      bbox: Array.isArray(extra.bbox) ? extra.bbox : null,
    };
  });

  const lights = LIGHTS.map((light) => ({ id: light.id, on: Boolean(state.lights?.[light.id]) }));

  const audit = {
    parts,
    lights,
    cameraView: state.cameraView ?? null,
    autoRotate: Boolean(state.autoRotate),
    hitTargets: [],
    perf: null,
  };

  sceneSources.forEach((_fn, key) => {
    if (key === "parts") return; // 已深合并
    const { present, value } = readSource(sceneSources, key);
    if (!present) return;
    audit[key] = key === "autoRotate" ? Boolean(value) : value;
  });

  return audit;
}

/**
 * window.__carDisplayCameraAudit() 的实现（§13.3③）。
 *
 * 基准字段：view 来自 store.cameraView；position/target/distance 未注册时为 null；
 * autoRotating/orbiting 未注册时为 false。position/target 都提供而未提供 distance 时，
 * 自动按两者欧氏距离补算。
 */
export function cameraAudit() {
  const state = storeHandle?.getState?.() ?? {};

  const audit = {
    view: state.cameraView ?? null,
    position: null,
    target: null,
    distance: null,
    autoRotating: false,
    orbiting: false,
  };

  cameraSources.forEach((_fn, key) => {
    const { present, value } = readSource(cameraSources, key);
    if (!present) return;
    if (key === "autoRotating" || key === "orbiting") audit[key] = Boolean(value);
    else audit[key] = value;
  });

  if (audit.distance === null && Array.isArray(audit.position) && Array.isArray(audit.target)) {
    const [px, py, pz] = audit.position;
    const [tx, ty, tz] = audit.target;
    audit.distance = Math.hypot(px - tx, py - ty, pz - tz);
  }

  return audit;
}

/**
 * 安装全局钩子。由 state/useCarStore.js 调用，可重复调用（幂等，后调用者覆盖）。
 * 生产构建同样安装：T9 的 CDP 脚本需要能对 dist 产物跑契约层断言（§13.3 未限定 DEV）。
 */
export function installAuditHooks(store) {
  storeHandle = store;
  if (typeof window === "undefined") return;
  window.__carDisplayStore = store;
  window.__carDisplaySceneAudit = sceneAudit;
  window.__carDisplayCameraAudit = cameraAudit;
}

/**
 * §13.3④ 语音注入点的**约定位置**（实现归 T6，T2 不代做）。
 *
 * 约定：T6 在 voice/recognition.js 里安装
 *   window.__carDisplayVoiceInject = (ctor | null) => { ... }
 * 传入自定义 SpeechRecognition 构造函数即替换真实实现，传 null 恢复；
 * 注入后 store.voice.supported 必须变为 true，使 mock 回放走完整链路。
 *
 * 本文件**刻意不提供 stub**：若提供，T9 的 verify-voice 会误判"注入成功"而拿到假绿。
 * T6 可以直接赋值 window.__carDisplayVoiceInject，也可以调用本助手（等价）。
 */
export function installVoiceInject(inject) {
  if (typeof window === "undefined") return;
  window.__carDisplayVoiceInject = inject;
}
