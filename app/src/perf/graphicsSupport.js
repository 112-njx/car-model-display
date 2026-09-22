/**
 * graphicsSupport.js —— 图形能力探测（T8p，服务 §11.1 T8p ④「WebGL 不可用时的中文降级页」）
 *
 * 为什么不是"只测 WebGL"：T1 基线的 `scene/StudioCanvas.jsx:16-25` **优先用 WebGPU**
 * （`navigator.gpu` → `three/webgpu` 的 WebGPURenderer），失败才回退 WebGLRenderer。
 * 只测 WebGL 会把"有 WebGPU、没 WebGL"的设备误判成不支持，弹出不该出现的降级页。
 * 因此结论是 **WebGPU 或 WebGL 任一可用即视为可渲染**。
 *
 * 探测顺序按开销排：WebGL 同步可得，先测；只有 WebGL 不可用时才去异步问 WebGPU 适配器。
 *
 * 探测会真的创建一个 WebGL 上下文。浏览器对同时存在的上下文数量有硬上限（通常 16 个），
 * 因此结果**缓存**，并且用完立刻通过 `WEBGL_lose_context` 释放，不占用名额。
 */

/** 强制覆盖探测结果的自测钩子（§12.1 全局调试对象统一 __carDisplay* 前缀） */
export const FORCE_KEY = "__carDisplayPerfForce";

function readForce() {
  if (typeof window === "undefined") return null;
  const force = window[FORCE_KEY];
  return force && typeof force === "object" ? force : null;
}

let webglCache = null;
let webgpuCache = null;

function releaseContext(gl) {
  try {
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // 释放失败不影响探测结论，忽略
  }
}

/**
 * 同步探测 WebGL（webgl2 优先）。结果缓存，重复调用不再创建上下文。
 * @returns {{ ok: boolean, api: 'webgl2'|'webgl'|null, reason: string }}
 */
export function probeWebGL() {
  const force = readForce();
  if (typeof force?.webgl === "boolean") {
    return { ok: force.webgl, api: force.webgl ? "webgl" : null, reason: "forced" };
  }
  if (webglCache) return webglCache;

  if (typeof document === "undefined") {
    webglCache = { ok: false, api: null, reason: "no-document" };
    return webglCache;
  }

  let canvas = null;
  try {
    canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (gl2) {
      releaseContext(gl2);
      webglCache = { ok: true, api: "webgl2", reason: "ok" };
      return webglCache;
    }
    const gl1 = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (gl1) {
      releaseContext(gl1);
      webglCache = { ok: true, api: "webgl", reason: "ok" };
      return webglCache;
    }
    webglCache = { ok: false, api: null, reason: "no-context" };
    return webglCache;
  } catch (error) {
    webglCache = { ok: false, api: null, reason: `throw:${error?.message ?? error}` };
    return webglCache;
  } finally {
    canvas = null;
  }
}

/**
 * 异步探测 WebGPU。`navigator.gpu` 存在只说明 API 在，**适配器仍可能拿不到**
 * （无独显、驱动黑名单、隐私模式），所以要真的 requestAdapter 一次。
 * @returns {Promise<{ ok: boolean, api: 'webgpu'|null, reason: string }>}
 */
export async function probeWebGPU() {
  const force = readForce();
  if (typeof force?.webgpu === "boolean") {
    return { ok: force.webgpu, api: force.webgpu ? "webgpu" : null, reason: "forced" };
  }
  if (webgpuCache) return webgpuCache;
  if (typeof navigator === "undefined" || !navigator.gpu) {
    webgpuCache = { ok: false, api: null, reason: "no-navigator-gpu" };
    return webgpuCache;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    webgpuCache = adapter
      ? { ok: true, api: "webgpu", reason: "ok" }
      : { ok: false, api: null, reason: "no-adapter" };
    return webgpuCache;
  } catch (error) {
    webgpuCache = { ok: false, api: null, reason: `throw:${error?.message ?? error}` };
    return webgpuCache;
  }
}

/**
 * 综合结论：WebGL 同步判定；不可用时再异步问 WebGPU。
 * @returns {Promise<{ ok: boolean, api: 'webgpu'|'webgl2'|'webgl'|null, reason: string }>}
 */
export async function probeGraphicsSupport() {
  const webgl = probeWebGL();
  if (webgl.ok) return webgl;
  const webgpu = await probeWebGPU();
  if (webgpu.ok) return webgpu;
  return { ok: false, api: null, reason: `webgl:${webgl.reason} / webgpu:${webgpu.reason}` };
}

/** 清空探测缓存。仅供自测使用，应用运行时不调用。 */
export function resetProbeCache() {
  webglCache = null;
  webgpuCache = null;
}
