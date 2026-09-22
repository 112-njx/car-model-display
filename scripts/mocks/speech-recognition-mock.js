/**
 * scripts/mocks/speech-recognition-mock.js —— 可程序化回放的 SpeechRecognition 替身
 * （roadmap §11.1 T9⑤ / §13.3④）
 *
 * 定位：给 `window.__carDisplayVoiceInject(ctor)` 用的**假构造函数**，让自动化脚本能在
 * 没有麦克风、没有权限、没有人工说话的前提下，把「识别结果」按需回放进真实识别链路，
 * 从而验证 `识别 → parseCommand → store 动作 + toast` 的端到端行为。
 *
 * ── 用法（本文件是**浏览器端脚本**，不是 ESM 模块）────────────────────────
 * 它不 `export`，只挂一个全局对象。T9 的 `verify-voice.mjs` 的注入方式：
 *
 *   // Node 侧读出源码，注入页面，再把构造函数交给 T6 的注入点
 *   const source = await readFile("scripts/mocks/speech-recognition-mock.js", "utf8");
 *   await session.evaluate(source);
 *   await session.evaluate(() => window.__carDisplayVoiceInject(window.__carDisplaySpeechRecognitionMock.Ctor));
 *
 *   // 回放一句指令（等价于用户说了一句话）
 *   await session.evaluate(() => window.__carDisplaySpeechRecognitionMock.say("打开左前门"));
 *
 *   // 恢复真实实现
 *   await session.evaluate(() => window.__carDisplayVoiceInject(null));
 *
 * ── 全局 API ─────────────────────────────────────────────────────────────
 *   __carDisplaySpeechRecognitionMock.Ctor         传给 __carDisplayVoiceInject 的构造函数
 *   __carDisplaySpeechRecognitionMock.instances    当前活跃实例数组（用于判断「是否已 start」）
 *   __carDisplaySpeechRecognitionMock.listening()  处于 listening 的实例数组
 *   __carDisplaySpeechRecognitionMock.say(text, opts)          → 回放一句识别结果
 *   __carDisplaySpeechRecognitionMock.saySequence(cases)       → 按 delayMs 顺序回放多句
 *   __carDisplaySpeechRecognitionMock.fail(code, message)      → 回放一个错误事件
 *   __carDisplaySpeechRecognitionMock.end()                    → 回放「识别自然结束」
 *   __carDisplaySpeechRecognitionMock.deliveries              已投递的结果事件数（诊断用）
 *   __carDisplaySpeechRecognitionMock.reset()                 清空实例与计数
 *
 * ── 与真实 Web Speech API 的一致性（回放要能骗过真实链路）─────────────────
 *   · 事件同时走 `onresult` 属性与 `addEventListener`，两种写法都能收到；
 *   · `event.results[i][j].transcript` / `.confidence`、`results[i].isFinal`、
 *     `event.resultIndex`、`event.timeStamp` 齐备，`results` 用数组附加属性模拟
 *     `SpeechRecognitionResultList`（真实对象也是「长度 + 下标」形状）；
 *   · 先投递 `isFinal:false` 的 interim 结果、再投递 `isFinal:true` 的终态（可关掉）；
 *   · `start()` 在已 listening 时抛 `InvalidStateError`（真实实现即如此，可测重复 start）；
 *   · `lang` 默认 `zh-CN`（§4 技术选型），`continuous`/`interimResults`/`maxAlternatives` 可写。
 *
 * 许可：本文件为项目自研（FormDrive 无任何语音代码，无外部代码复用）。
 */

(function installSpeechRecognitionMock(global) {
  "use strict";

  if (global.__carDisplaySpeechRecognitionMock) return;

  /** 模拟 SpeechRecognitionResultList / SpeechRecognitionResult 的「数组 + 附加属性」形状 */
  function makeResultList(transcript, confidence, isFinal) {
    const alternative = { transcript, confidence };
    const result = [alternative];
    result.isFinal = isFinal;
    result.length = 1;
    result.item = (index) => (index === 0 ? alternative : undefined);

    const list = [result];
    list.length = 1;
    list.item = (index) => (index === 0 ? result : undefined);
    return list;
  }

  const instances = [];
  const state = { deliveries: 0, errors: 0, ends: 0 };

  class MockSpeechRecognition {
    constructor() {
      this.lang = "zh-CN";
      this.continuous = false;
      this.interimResults = true;
      this.maxAlternatives = 1;

      // 真实实现上这些是 on* 属性；同时提供 addEventListener
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
      this.onresult = null;
      this.onaudiostart = null;
      this.onspeechend = null;
      this.onnomatch = null;

      this._listeners = new Map();
      this._listening = false;
      this._started = 0;
      instances.push(this);
    }

    get listening() {
      return this._listening;
    }

    addEventListener(type, handler) {
      if (typeof handler !== "function") return;
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) {
      this._listeners.get(type)?.delete(handler);
    }

    /** 同时派发给 on* 属性与 addEventListener 注册的处理器（真实事件对象也是两路都到） */
    dispatch(type, event) {
      const payload = { type, target: this, timeStamp: performance.now(), ...event };
      const handler = this[`on${type}`];
      if (typeof handler === "function") {
        try {
          handler.call(this, payload);
        } catch (error) {
          console.error(`[speech-mock] on${type} 处理器抛错：`, error);
        }
      }
      for (const listener of this._listeners.get(type) ?? []) {
        try {
          listener.call(this, payload);
        } catch (error) {
          console.error(`[speech-mock] ${type} 监听器抛错：`, error);
        }
      }
      return payload;
    }

    start() {
      if (this._listening) {
        // 真实实现：重复 start 抛 InvalidStateError（T6 的重复 start 防御可被此用例测出）
        const error = new Error("recognition has already started");
        error.name = "InvalidStateError";
        throw error;
      }
      this._listening = true;
      this._started += 1;
      this.dispatch("audiostart", {});
      this.dispatch("start", {});
      return this;
    }

    stop() {
      if (!this._listening) return this;
      this._listening = false;
      this.dispatch("speechend", {});
      this.dispatch("end", {});
      return this;
    }

    abort() {
      this._listening = false;
      this.dispatch("end", {});
      return this;
    }

    /** 投递一次识别结果（interim + final）。返回本实例是否收到（未 start 的实例收不到） */
    deliver(text, { isFinal = true, confidence = 0.95, interim = true } = {}) {
      if (!this._listening) return false;
      if (interim) {
        this.dispatch("result", {
          resultIndex: 0,
          results: makeResultList(text, confidence, false),
        });
        state.deliveries += 1;
      }
      if (isFinal) {
        this.dispatch("result", {
          resultIndex: 0,
          results: makeResultList(text, confidence, true),
        });
        state.deliveries += 1;
      }
      return true;
    }
  }

  // 让构造函数名与真实实现一致（有些封装会读 ctor.name 做能力判断）
  Object.defineProperty(MockSpeechRecognition, "name", { value: "SpeechRecognition" });

  const mock = {
    Ctor: MockSpeechRecognition,
    instances,
    state,
    get deliveries() {
      return state.deliveries;
    },
    listening() {
      return instances.filter((instance) => instance._listening);
    },
    /** 回放一句识别结果；返回收到该结果的实例数（0 = 没有实例处于 listening） */
    say(text, options = {}) {
      const receivers = mock.listening().filter((instance) => instance.deliver(text, options));
      return receivers.length;
    },
    /** 顺序回放多句：`[{ text, delayMs }]`，句间按 delayMs 等待 */
    async saySequence(cases) {
      const report = [];
      for (const item of cases) {
        if (item.delayMs) await new Promise((resolve) => setTimeout(resolve, item.delayMs));
        report.push({ text: item.text, receivers: mock.say(item.text, item) });
      }
      return report;
    },
    /** 回放一个错误事件（如 'not-allowed' / 'no-speech' / 'network'） */
    fail(errorCode = "not-allowed", message = "") {
      const receivers = mock.listening();
      for (const instance of receivers) {
        instance.dispatch("error", { error: errorCode, message });
        instance._listening = false;
        instance.dispatch("end", {});
        state.errors += 1;
      }
      return receivers.length;
    },
    /** 回放「识别自然结束」（用户停止说话 / 非连续模式下自动结束） */
    end() {
      const receivers = mock.listening();
      for (const instance of receivers) {
        instance._listening = false;
        instance.dispatch("speechend", {});
        instance.dispatch("end", {});
        state.ends += 1;
      }
      return receivers.length;
    },
    reset() {
      instances.length = 0;
      state.deliveries = 0;
      state.errors = 0;
      state.ends = 0;
      return mock;
    },
  };

  global.__carDisplaySpeechRecognitionMock = mock;
})(typeof globalThis === "undefined" ? window : globalThis);
