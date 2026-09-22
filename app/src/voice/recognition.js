/**
 * T6 语音控车 · SpeechRecognition 兼容封装
 *
 * 职责（roadmap §11.1 T6 第①条）：
 *   webkit 前缀兼容 · 能力探测 · 权限请求 · 错误重试 · 安全上下文（https/localhost）检测
 *
 * 设计要点：
 *   1. **零依赖**，只用浏览器原生 API（`SpeechRecognition` / `Permissions` / `getUserMedia`）。
 *   2. 识别实例可被替换：`setRecognitionCtor(ctor)` 注入自定义构造函数（§13.3 ④ 的
 *      `window.__carDisplayVoiceInject` 底层实现），注入后 `detectSupport().supported` 变为 true，
 *      使 T9 的 mock 回放走**完整链路**而非降级分支。传 `null` 恢复真实实现。
 *   3. 重试策略：可重试错误（no-speech / network / audio-capture）自动重启，指数退避、上限 3 次；
 *      致命错误（not-allowed / service-not-allowed / language-not-supported）不重试，直接给中文提示。
 *   4. 所有对外事件均为中文可读文案，UI 直接展示，不做二次翻译。
 */

const DEFAULT_LANG = "zh-CN";

/** 麦克风/识别错误 → 中文文案 + 重试策略。 */
export const ERROR_INFO = {
  "no-speech": { retry: true, message: "没有听到声音，请再说一次。" },
  aborted: { retry: false, message: "语音识别已中断。" },
  "audio-capture": { retry: true, message: "没有检测到可用的麦克风，请检查设备后重试。" },
  "not-allowed": {
    retry: false,
    fatal: true,
    permission: true,
    message: "麦克风权限被拒绝。请在浏览器地址栏的站点设置里允许麦克风，然后重试。",
  },
  "service-not-allowed": {
    retry: false,
    fatal: true,
    message: "当前环境不允许语音识别：需要 https 或 localhost，且系统语音服务可用。",
  },
  network: { retry: true, message: "语音识别网络异常，正在重试…" },
  "language-not-supported": { retry: false, fatal: true, message: "当前浏览器不支持中文（zh-CN）语音识别。" },
  "bad-grammar": { retry: false, fatal: true, message: "语音识别语法配置有误。" },
  "phrases-not-supported": { retry: false, fatal: true, message: "当前环境不支持语音短语提示。" },
};

// ── 注入点（§13.3 ④ 的底层实现） ──

let injectedCtor = null;
let supportOverride = null;

/**
 * 替换/恢复语音识别构造函数。
 * @param {Function|null} ctor 传构造函数即替换真实实现；传 null 恢复真实实现。
 */
export function setRecognitionCtor(ctor) {
  if (ctor !== null && typeof ctor !== "function") {
    throw new TypeError("setRecognitionCtor 只接受构造函数或 null");
  }
  injectedCtor = ctor;
  return injectedCtor;
}

export function getInjectedCtor() {
  return injectedCtor;
}

/** 当前生效的构造函数：注入优先，其次浏览器原生（含 webkit 前缀）。 */
export function getRecognitionCtor() {
  if (injectedCtor) return injectedCtor;
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/**
 * 【自测专用】强制降级路径，供沙盒页演示「不支持 / 非安全上下文」。
 * @param {null|"unsupported"|"insecure-context"} code
 */
export function setSupportOverrideForTest(code) {
  supportOverride = code === "unsupported" || code === "insecure-context" ? code : null;
}

/** 安全上下文检测：https / localhost / 127.0.0.1。 */
export function isSecureContextOk() {
  if (injectedCtor) return true; // mock 注入不受安全上下文限制（T9 在 headless http 下回放）
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const host = (window.location && window.location.hostname) || "";
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

/**
 * 能力探测。
 * @returns {{supported:boolean, secure:boolean, injected:boolean, code:string, message:string}}
 */
export function detectSupport() {
  if (supportOverride === "unsupported") {
    return {
      supported: false,
      secure: isSecureContextOk(),
      injected: false,
      code: "unsupported",
      message: "当前浏览器不支持语音识别（Web Speech API），请用桌面版或安卓版 Chrome / Edge 打开。",
    };
  }
  if (supportOverride === "insecure-context") {
    return {
      supported: false,
      secure: false,
      injected: false,
      code: "insecure-context",
      message: "语音识别需要安全上下文：请用 https 地址或本机 localhost 打开。",
    };
  }
  if (injectedCtor) {
    return { supported: true, secure: true, injected: true, code: "injected", message: "" };
  }
  if (typeof window === "undefined") {
    return { supported: false, secure: false, injected: false, code: "no-window", message: "当前环境没有浏览器语音识别能力。" };
  }

  const ctor = getRecognitionCtor();
  const secure = isSecureContextOk();
  if (!ctor) {
    const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
    const isFirefox = /firefox/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/chrome|chromium|edg/i.test(ua);
    const message = isFirefox
      ? "Firefox 不支持 Web Speech 语音识别，请用 Chrome 或 Edge 打开。"
      : isSafari
        ? "Safari 的语音识别支持不完整，请用 Chrome 或 Edge 打开。"
        : "当前浏览器不支持语音识别（Web Speech API），请用桌面版或安卓版 Chrome / Edge 打开。";
    return { supported: false, secure, injected: false, code: "unsupported", message };
  }
  if (!secure) {
    const origin = (window.location && window.location.origin) || "当前地址";
    return {
      supported: false,
      secure: false,
      injected: false,
      code: "insecure-context",
      message: `语音识别需要安全上下文（https 或 localhost）。当前是 ${origin}，请改用 https 地址，或在本机用 localhost 打开。`,
    };
  }
  return { supported: true, secure: true, injected: false, code: "ok", message: "" };
}

/** 快捷判断：当前是否可用语音识别。 */
export function isSpeechSupported() {
  return detectSupport().supported;
}

// ── 权限 ──

/**
 * 查询麦克风权限状态（Chrome/Edge 支持 Permissions API 的 microphone 查询）。
 * @returns {Promise<{state:"granted"|"denied"|"prompt"|"unknown", injected?:boolean}>}
 */
export async function queryMicrophonePermission() {
  if (injectedCtor) return { state: "granted", injected: true };
  if (typeof navigator === "undefined") return { state: "unknown" };
  try {
    if (navigator.permissions && typeof navigator.permissions.query === "function") {
      const status = await navigator.permissions.query({ name: "microphone" });
      return { state: status.state };
    }
  } catch {
    // 部分浏览器不支持 microphone 权限查询，落到 unknown
  }
  return { state: "unknown" };
}

/**
 * 请求麦克风权限（先查状态，未决时用 getUserMedia 触发浏览器授权弹窗并立即释放音轨）。
 * @returns {Promise<{ok:boolean, state:string, message?:string, injected?:boolean}>}
 */
export async function requestMicrophonePermission() {
  const support = detectSupport();
  if (!support.supported) return { ok: false, state: "unsupported", message: support.message };
  if (injectedCtor) return { ok: true, state: "granted", injected: true };

  const current = await queryMicrophonePermission();
  if (current.state === "granted") return { ok: true, state: "granted" };
  if (current.state === "denied") {
    return { ok: false, state: "denied", message: ERROR_INFO["not-allowed"].message };
  }

  const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    return { ok: true, state: "unknown", message: "无法预检麦克风权限，将在开始识别时由浏览器询问。" };
  }

  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return { ok: true, state: "granted" };
  } catch (error) {
    const name = (error && error.name) || "UnknownError";
    const denied = name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError";
    return {
      ok: false,
      state: denied ? "denied" : "error",
      message: denied ? ERROR_INFO["not-allowed"].message : `麦克风不可用（${name}），请检查设备后重试。`,
    };
  }
}

// ── 识别器 ──

/** 兼容 class（可 new）与工厂函数（箭头函数不可 new）两种注入形式。 */
function instantiate(Ctor) {
  if (typeof Ctor !== "function") throw new Error("语音识别构造函数无效");
  try {
    const instance = new Ctor();
    if (instance && typeof instance === "object") return instance;
  } catch (constructorError) {
    try {
      const instance = Ctor();
      if (instance && typeof instance === "object") return instance;
    } catch {
      throw constructorError;
    }
  }
  throw new Error("注入的构造函数既不能 new，也不能作为工厂返回识别实例");
}

const EVENTS = ["result", "interim", "status", "error", "end"];

/**
 * 语音识别器：一次会话内持续监听、自动重试、事件回调。
 *
 * 事件：
 *   status  {state}                                 状态机：idle|starting|listening|processing|error|unsupported
 *   interim {transcript, alternatives}              实时字幕（未定稿）
 *   result  {transcript, alternatives, isFinal}     定稿结果（含多候选，供上层挑选可解析的那条）
 *   error   {code, message, fatal, retryable, permission}
 *   end     {reason}                                stopped|ended|restarting|restart-exhausted
 */
export class VoiceRecognizer {
  constructor(options = {}) {
    this.lang = options.lang || DEFAULT_LANG;
    this.continuous = options.continuous !== false;
    this.interimResults = options.interimResults !== false;
    this.maxAlternatives = options.maxAlternatives || 3;
    this.autoRestart = options.autoRestart !== false;
    this.maxRestarts = Number.isFinite(options.maxRestarts) ? options.maxRestarts : 3;
    this.restartDelayMs = options.restartDelayMs || 400;

    this.instance = null;
    this.state = "idle";
    this.restarts = 0;
    this.wantListening = false;
    this.timer = null;
    this.lastError = null;
    this.listeners = new Map(EVENTS.map((event) => [event, new Set()]));
  }

  /** 订阅事件，返回取消订阅函数。 */
  on(event, handler) {
    const bucket = this.listeners.get(event);
    if (!bucket || typeof handler !== "function") return () => {};
    bucket.add(handler);
    return () => bucket.delete(handler);
  }

  get support() {
    return detectSupport();
  }

  /**
   * 开始识别（含能力探测；不可用时立刻回调 error 并返回 false）。
   * @returns {boolean} 是否成功进入启动流程
   */
  start() {
    const support = detectSupport();
    if (!support.supported) {
      this._fail(support.code, support.message, true);
      return false;
    }
    // 已在监听（含拿到定稿后的 processing 态）时不得重复创建实例，否则会出现两路麦克风采集
    if (this.wantListening && this.instance) return true;
    if (this.state === "listening" || this.state === "starting") return true;
    this.wantListening = true;
    this.restarts = 0;
    this.lastError = null;
    this._spawn();
    return true;
  }

  /** 用户主动停止（不再自动重启）。 */
  stop() {
    this.wantListening = false;
    this._clearTimer();
    const instance = this.instance;
    this.instance = null;
    this._setState("idle");
    if (!instance) return;
    try {
      instance.stop();
    } catch {
      // 部分实现未启动时 stop() 会抛错，忽略
    }
  }

  /** 强制中断（丢弃未定稿结果）。 */
  abort() {
    this.wantListening = false;
    this._clearTimer();
    const instance = this.instance;
    this.instance = null;
    this._setState("idle");
    if (!instance) return;
    try {
      instance.abort();
    } catch {
      // 同上
    }
  }

  destroy() {
    this.abort();
    for (const bucket of this.listeners.values()) bucket.clear();
  }

  // ── 内部 ──

  _emit(event, payload) {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    for (const handler of Array.from(bucket)) {
      try {
        handler(payload);
      } catch (error) {
        // 单个订阅者抛错不影响识别循环
        console.error("[cd-voice] 事件处理异常", event, error);
      }
    }
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this._emit("status", { state });
  }

  _fail(code, message, fatal) {
    this.lastError = { code, message, fatal: !!fatal, retryable: false };
    if (fatal) this.wantListening = false;
    this._setState(fatal ? "error" : "idle");
    this._emit("error", this.lastError);
  }

  _clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  _spawn() {
    this._clearTimer();
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      this._fail("unsupported", detectSupport().message, true);
      return;
    }

    let recognition;
    try {
      recognition = instantiate(Ctor);
    } catch (error) {
      this._fail("construct-failed", `语音识别初始化失败：${(error && error.message) || error}`, true);
      return;
    }

    this.instance = recognition;
    // 参数必须在 start() 之前赋值（mock 实现同样依赖这一点）
    try {
      recognition.lang = this.lang;
      recognition.continuous = this.continuous;
      recognition.interimResults = this.interimResults;
      recognition.maxAlternatives = this.maxAlternatives;
    } catch {
      // 只读实现：忽略
    }

    recognition.onstart = () => this._setState("listening");
    recognition.onaudiostart = () => this._setState("listening");
    recognition.onresult = (event) => this._handleResult(event);
    recognition.onerror = (event) => this._handleError(event);
    recognition.onend = () => this._handleEnd();

    this._setState("starting");
    try {
      recognition.start();
    } catch (error) {
      // 已在运行：Chrome 会抛 InvalidStateError，视为已在监听
      if (error && error.name === "InvalidStateError") {
        this._setState("listening");
        return;
      }
      this._fail("start-failed", `语音识别启动失败：${(error && error.message) || error}`, true);
    }
  }

  _handleResult(event) {
    const results = event && event.results;
    if (!results) return;
    const start = Number.isFinite(event.resultIndex) ? event.resultIndex : 0;
    for (let index = start; index < results.length; index += 1) {
      const result = results[index];
      if (!result) continue;
      const alternatives = [];
      for (let alt = 0; alt < (result.length || 0); alt += 1) {
        const text = result[alt] && result[alt].transcript;
        if (text) alternatives.push(String(text).trim());
      }
      if (!alternatives.length) continue;
      if (result.isFinal) {
        this.restarts = 0; // 拿到有效结果即视为会话健康，重置重试计数
        this._setState("processing");
        this._emit("result", { transcript: alternatives[0], alternatives, isFinal: true });
      } else {
        this._emit("interim", { transcript: alternatives[0], alternatives, isFinal: false });
      }
    }
  }

  _handleError(event) {
    const code = (event && event.error) || "unknown";
    const info = ERROR_INFO[code] || { retry: true, message: `语音识别出错（${code}），正在重试…` };
    this.lastError = {
      code,
      message: info.message,
      fatal: !!info.fatal,
      retryable: !!info.retry,
      permission: !!info.permission,
    };
    this._emit("error", this.lastError);
    if (info.fatal) {
      this.wantListening = false;
      this._setState("error");
    }
    // 可重试错误：不在这里重启，交给 onend 统一处理（Chrome 的 error 之后必定跟 end）
  }

  _handleEnd() {
    this.instance = null;
    if (!this.wantListening) {
      this._setState(this.lastError && this.lastError.fatal ? "error" : "idle");
      this._emit("end", { reason: "stopped" });
      return;
    }
    if (!this.autoRestart || !this.continuous) {
      this.wantListening = false;
      this._setState("idle");
      this._emit("end", { reason: "ended" });
      return;
    }
    if (this.restarts >= this.maxRestarts) {
      this.wantListening = false;
      const message = `语音识别连续中断 ${this.restarts} 次，已停止。请点击麦克风重新开始。`;
      this.lastError = { code: "restart-exhausted", message, fatal: true, retryable: false };
      this._setState("error");
      this._emit("error", this.lastError);
      this._emit("end", { reason: "restart-exhausted" });
      return;
    }
    this.restarts += 1;
    const delay = Math.min(this.restartDelayMs * this.restarts, 2000);
    this._setState("idle");
    this._emit("end", { reason: "restarting", delay });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.wantListening) this._spawn();
    }, delay);
  }
}

/** 工厂函数。 */
export function createRecognizer(options) {
  return new VoiceRecognizer(options);
}
