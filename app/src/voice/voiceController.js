/**
 * T6 语音控车 · 状态机控制器（框架无关、store 无关）
 *
 * 为什么单独抽出来：
 *   沙盒页（A 段自测）与主应用（B 段接线）需要**同一套**「识别 → 解析 → 执行 → 状态/回执」逻辑。
 *   抽成控制器后，两侧各自只做一层薄适配（沙盒接假 store、应用接真 store），
 *   于是沙盒里跑过的断言覆盖的就是最终发布的代码，而不是一份平行的仿制品。
 *
 * 依赖面（**仅此三项**，全部来自 §13.2 冻结的 action 名）：
 *   api.setPart / api.openGroup / api.closeGroup / api.setLight / api.setCameraView / api.orbitOnce / api.bumpInteraction
 *
 * 控制器不做的事（由使用方负责）：写 store、渲染、播报实现。它只负责状态机与编排。
 */

import { DEFAULT_VOCABULARY, describeActions, executePlan } from "./commands.js";
import { parseAlternatives } from "./parseCommand.js";
import {
  VoiceRecognizer,
  detectSupport,
  getInjectedCtor,
  queryMicrophonePermission,
  requestMicrophonePermission,
  setRecognitionCtor,
} from "./recognition.js";

/** 初始快照。使用方据此渲染 UI（VoiceButton 的 props 就是它的一部分）。 */
export function createSnapshot() {
  return {
    status: "idle", // unsupported|idle|requesting|listening|processing|error
    supported: false,
    secure: false,
    injected: false,
    message: "",
    error: "",
    transcript: "", // 实时字幕（未定稿）
    reply: "", // 最近一条指令的中文回执
    hint: "", // 纠错提示
    permission: "unknown",
    speechEnabled: false,
    lastCommand: "", // 最近一次成功执行的指令文本
    listening: false,
  };
}

/** 识别器状态 → voice.status（§13.2 枚举）。 */
const RECOGNIZER_STATUS = {
  idle: "idle",
  starting: "requesting",
  listening: "listening",
  processing: "processing",
  error: "error",
  unsupported: "unsupported",
};

/**
 * 创建语音控制器。
 * @param {{
 *   api: object,
 *   vocabulary?: object,
 *   onChange?: (snapshot: object) => void,
 *   onLog?: (text: string) => void,
 *   speak?: (text: string) => void,
 *   recognizer?: object,
 * }} options
 */
export function createVoiceController(options = {}) {
  const { api, vocabulary = DEFAULT_VOCABULARY, onChange, onLog, speak } = options;

  if (!api || typeof api.setPart !== "function") {
    throw new TypeError("createVoiceController 需要一个具备 §13.2 同名 action 的 api 对象");
  }

  let snapshot = createSnapshot();
  let destroyed = false;

  const emit = (patch) => {
    if (destroyed) return;
    snapshot = { ...snapshot, ...patch };
    if (onChange) onChange(snapshot);
  };
  const log = (text) => {
    if (onLog) onLog(text);
  };

  const recognizer =
    options.recognizer ||
    new VoiceRecognizer({ restartDelayMs: 400 });

  // ── 识别器事件 → 快照 ──
  recognizer.on("status", ({ state }) => {
    const status = RECOGNIZER_STATUS[state] || "idle";
    emit({ status, listening: state === "listening" });
    log(`状态 → ${state}`);
  });

  recognizer.on("interim", ({ transcript }) => {
    emit({ transcript, reply: "", hint: "" });
  });

  recognizer.on("result", ({ alternatives }) => {
    handleAlternatives(alternatives, "识别");
    // 连续聆听：处理完立刻回到聆听态（浏览器不会为下一句重新发 onstart）
    if (recognizer.wantListening) emit({ status: "listening", listening: true });
  });

  recognizer.on("error", ({ message, fatal, permission }) => {
    emit({ error: message, status: fatal ? "error" : snapshot.status });
    if (permission) emit({ permission: "denied" });
    log(`错误：${message}`);
  });

  recognizer.on("end", ({ reason }) => {
    if (reason !== "restarting") emit({ listening: false });
    log(`会话结束：${reason}`);
  });

  // ── 核心：候选 → 计划 → 执行 → 回执 ──
  function handleAlternatives(alternatives, source = "识别") {
    const detailed = parseAlternatives(alternatives, { vocabulary });
    const transcript = detailed.text || (Array.isArray(alternatives) ? alternatives[0] : "") || "";

    if (!detailed.actions.length) {
      emit({ transcript, reply: "", hint: detailed.hint || "", lastCommand: "" });
      log(`${source} 未执行（${detailed.reason}）：${detailed.hint}`);
      return { ok: false, detailed };
    }

    executePlan(detailed.actions, api);
    const reply = describeActions(detailed.actions, { vocabulary });
    emit({ transcript, reply, hint: "", error: "", lastCommand: transcript });
    log(`${source} 执行：${reply}（${detailed.actions.length} 个动作）`);
    if (snapshot.speechEnabled && typeof speak === "function") speak(reply);
    return { ok: true, detailed, reply };
  }

  /** 刷新能力探测结果（注入/取消注入、或环境变化后调用）。 */
  function refreshSupport() {
    const support = detectSupport();
    emit({
      supported: support.supported,
      secure: support.secure,
      injected: support.injected,
      message: support.message,
      status: support.supported ? (snapshot.status === "unsupported" ? "idle" : snapshot.status) : "unsupported",
    });
    return support;
  }

  /** 注入/恢复识别实现（§13.3 ④ 的底层动作）。 */
  function injectRecognition(ctor) {
    setRecognitionCtor(ctor);
    recognizer.destroy();
    const support = refreshSupport();
    log(ctor ? "已注入自定义识别实现，voice.supported = true" : "已恢复真实 SpeechRecognition");
    return support;
  }

  /** 开始聆听（含权限请求）。 */
  async function start() {
    if (destroyed) return false;
    const support = detectSupport();
    if (!support.supported) {
      emit({ status: "unsupported", supported: false, secure: support.secure, message: support.message });
      return false;
    }
    emit({ status: "requesting", error: "", hint: "" });
    const permission = await requestMicrophonePermission();
    if (destroyed) return false;
    emit({ permission: permission.state });
    if (!permission.ok) {
      emit({ status: "error", error: permission.message || "麦克风不可用。" });
      log(`权限请求失败：${permission.state}`);
      return false;
    }
    const started = recognizer.start();
    if (!started) {
      emit({ status: "error", error: "语音识别启动失败。" });
      return false;
    }
    log("开始聆听");
    return true;
  }

  /** 停止聆听。 */
  function stop() {
    recognizer.stop();
    emit({ status: "idle", listening: false, transcript: "", hint: "" });
    log("用户停止聆听");
  }

  async function toggle() {
    if (recognizer.wantListening || snapshot.listening) {
      stop();
      return false;
    }
    return start();
  }

  async function refreshPermission() {
    const result = await queryMicrophonePermission();
    emit({ permission: result.state });
    return result.state;
  }

  function setSpeechEnabled(enabled) {
    emit({ speechEnabled: !!enabled });
  }

  function destroy() {
    destroyed = true;
    recognizer.destroy();
  }

  return {
    get snapshot() {
      return snapshot;
    },
    get recognizer() {
      return recognizer;
    },
    start,
    stop,
    toggle,
    refreshSupport,
    refreshPermission,
    injectRecognition,
    handleAlternatives,
    setSpeechEnabled,
    destroy,
  };
}

export { getInjectedCtor };
