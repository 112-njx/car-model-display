/**
 * T6 语音控车 · SpeechSynthesis 播报封装（roadmap §11.1 T6 第⑥条「可选语音播报开关」）
 *
 * 零依赖，只用浏览器原生 `speechSynthesis` + `SpeechSynthesisUtterance`。
 * 不支持的环境（Safari 部分版本、无语音包）一律静默降级为「不播报」，不抛错、不阻断主链路。
 */

const DEFAULT_LANG = "zh-CN";

/** 播报能力探测。 */
export function isSpeechSynthesisSupported() {
  if (typeof window === "undefined") return false;
  return "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
}

/** 中文语音包（浏览器语音列表是异步就绪的，取不到时返回 null，交给 lang 参数兜底）。 */
export function pickChineseVoice() {
  if (!isSpeechSynthesisSupported()) return null;
  try {
    const voices = window.speechSynthesis.getVoices() || [];
    return (
      voices.find((voice) => /^zh[-_]CN/i.test(voice.lang || "")) ||
      voices.find((voice) => /^zh/i.test(voice.lang || "")) ||
      null
    );
  } catch {
    return null;
  }
}

/** 语音列表异步就绪时回调（Chrome 首次调用 getVoices() 常返回空数组）。 */
export function onVoicesReady(callback) {
  if (!isSpeechSynthesisSupported() || typeof callback !== "function") return () => {};
  const handler = () => callback(pickChineseVoice());
  try {
    window.speechSynthesis.addEventListener("voiceschanged", handler);
    handler();
    return () => window.speechSynthesis.removeEventListener("voiceschanged", handler);
  } catch {
    return () => {};
  }
}

/**
 * 播报一句中文。重复调用会先打断上一句（车控反馈以最新一条为准）。
 * @param {string} text
 * @param {{lang?:string, rate?:number, pitch?:number, volume?:number, onEnd?:Function, onError?:Function}} [options]
 * @returns {boolean} 是否成功发起播报
 */
export function speak(text, options = {}) {
  const content = typeof text === "string" ? text.trim() : "";
  if (!content || !isSpeechSynthesisSupported()) return false;

  try {
    cancelSpeech();
    const utterance = new window.SpeechSynthesisUtterance(content);
    utterance.lang = options.lang || DEFAULT_LANG;
    utterance.rate = Number.isFinite(options.rate) ? options.rate : 1.05;
    utterance.pitch = Number.isFinite(options.pitch) ? options.pitch : 1;
    utterance.volume = Number.isFinite(options.volume) ? options.volume : 1;
    const voice = pickChineseVoice();
    if (voice) utterance.voice = voice;
    if (typeof options.onEnd === "function") utterance.onend = () => options.onEnd();
    if (typeof options.onError === "function") utterance.onerror = (event) => options.onError(event);
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    // 播报失败不影响车控主链路
    return false;
  }
}

/** 停止当前播报。 */
export function cancelSpeech() {
  if (!isSpeechSynthesisSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // 忽略
  }
}

export function isSpeaking() {
  if (!isSpeechSynthesisSupported()) return false;
  try {
    return window.speechSynthesis.speaking;
  } catch {
    return false;
  }
}
