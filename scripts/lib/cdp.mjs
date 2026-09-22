/**
 * scripts/lib/cdp.mjs —— T9 验证脚本共用的 CDP 客户端、断言器与契约常量
 *
 * 定位：`scripts/verify-*.mjs` 四个脚本的公共底座，**零 npm 依赖**（只用 Node 内置的
 * `fetch` 与 `WebSocket`，Node ≥ 22 均可用），沿用参考开源项目 FormDrive 的成熟模式：
 * 连接一个已带 `--remote-debugging-port` 的 Chrome/Edge，用 `PUT /json/new` 开标签页，
 * 经 `Runtime.evaluate` 读页面、`Input.dispatch*` 派发真实指针事件。
 *
 * 与 FormDrive 的差异：FormDrive 把这段客户端在每个脚本里各复制一份（两份共约 60 行重复），
 * 本文件把它收成单一实现供四个脚本 import；断言器（PASS/SKIP/FAIL + 退出码）为本项目新增。
 *
 * 许可归属：CDP 连接与事件派发的写法派生自 FormDrive 的 `scripts/verify-*.mjs`
 * （MIT License, Copyright (c) 2026 Enes Kaymaz，原许可全文见 `app/LICENSE`）。
 *
 * ── 硬约束（roadmap §12.2 / §12.3）───────────────────────────────────────────
 * 本文件与四个 verify 脚本**只允许**依赖 §13.3 冻结的四个钩子/注入点：
 *   window.__carDisplayStore / __carDisplaySceneAudit() / __carDisplayCameraAudit() /
 *   window.__carDisplayVoiceInject()
 * **不得** import 工程内部实现（carConfig / useCarStore / auditHooks / 任何组件）。
 * 下方“契约常量”一节把 §13 的 id 硬编码进来——这正是断言本身：脚本要能发现契约漂移。
 */

import os from "node:os";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

// ───────────────────────────────────────────────────────────────────────────
// 契约常量（唯一来源：docs/roadmap.md §13.1 / §13.2 / §13.3；硬编码即断言）
// ───────────────────────────────────────────────────────────────────────────

/** §13.1 PARTS[].id，顺序与 carConfig 声明一致 */
export const PART_IDS = [
  "window_lf",
  "window_rf",
  "window_lr",
  "window_rr",
  "door_lf",
  "door_rf",
  "door_lr",
  "door_rr",
  "frunk",
  "trunk",
];

/** §13.1 PARTS[].group → 部件 id（verify-parts 的分组断言用） */
export const PART_GROUP_IDS = {
  windows: ["window_lf", "window_rf", "window_lr", "window_rr"],
  doors: ["door_lf", "door_rf", "door_lr", "door_rr"],
  closures: ["frunk", "trunk"],
};

/** §13.1 LIGHTS[].id */
export const LIGHT_IDS = ["headlight", "taillight"];

/** §13.1 CAMERA_VIEWS[].id */
export const CAMERA_VIEW_IDS = ["hero", "front", "profile", "detail"];

/** §13.1 INTERACTION 冻结阈值（verify-pick 的拖拽/长按用例据此取值） */
export const INTERACTION = {
  tapMaxMovePx: 6,
  tapMaxDurationMs: 300,
  idleAutoRotateDelayMs: 8000,
  orbitOnceDurationMs: 6000,
};

/** §13.2 voice.status 枚举 */
export const VOICE_STATUSES = ["unsupported", "idle", "requesting", "listening", "processing", "error"];

/** 部件中文名（报告可读性用；断言一律以 id 为准，此处不参与断言） */
export const PART_LABELS = {
  window_lf: "左前车窗",
  window_rf: "右前车窗",
  window_lr: "左后车窗",
  window_rr: "右后车窗",
  door_lf: "左前门",
  door_rf: "右前门",
  door_lr: "左后门",
  door_rr: "右后门",
  frunk: "前备箱",
  trunk: "后备箱",
};

export const labelOf = (id) => PART_LABELS[id] ?? id;

// ───────────────────────────────────────────────────────────────────────────
// 命令行参数
// ───────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  baseUrl: process.env.CAR_DISPLAY_BASE_URL ?? "http://127.0.0.1:5173/",
  debugPort: process.env.CAR_DISPLAY_DEBUG_PORT ? Number(process.env.CAR_DISPLAY_DEBUG_PORT) : null,
  width: 1440,
  height: 900,
  mobile: false,
  timeoutMs: 30000,
  /** 集成信号等待上限：超时后未集成项以 SKIP 标注，而不是 FAIL */
  integrationTimeoutMs: Number(process.env.CAR_DISPLAY_INTEGRATION_TIMEOUT ?? 45000),
  /** 严格模式：SKIP 也计入失败（Wave 2 验收用，Wave 1 契约层不用） */
  strict: false,
  json: false,
  reportPath: null,
  keepOpen: false,
  /** 慢用例（待机自转需等 idleAutoRotateDelayMs 以上）默认执行，可用 --fast 跳过 */
  fast: false,
};

/**
 * 解析 `node scripts/verify-x.mjs [选项]`。
 * 支持 `--key=value` 与 `--flag` 两种写法；未知选项原样收集到 `unknown`（便于报错提示）。
 */
export function parseCli(argv = process.argv.slice(2)) {
  const options = { ...DEFAULTS, unknown: [] };
  for (const raw of argv) {
    if (!raw.startsWith("--")) {
      options.unknown.push(raw);
      continue;
    }
    const [key, ...rest] = raw.slice(2).split("=");
    const value = rest.join("=");
    switch (key) {
      case "base-url": options.baseUrl = value; break;
      case "debug-port": options.debugPort = Number(value); break;
      case "width": options.width = Number(value); break;
      case "height": options.height = Number(value); break;
      case "timeout": options.timeoutMs = Number(value); break;
      case "integration-timeout": options.integrationTimeoutMs = Number(value); break;
      case "report": options.reportPath = value; break;
      case "mobile": options.mobile = true; break;
      case "strict": options.strict = true; break;
      case "json": options.json = true; break;
      case "keep-open": options.keepOpen = true; break;
      case "fast": options.fast = true; break;
      default: options.unknown.push(raw); break;
    }
  }
  if (!options.baseUrl.endsWith("/")) options.baseUrl += "/";
  return options;
}

// ───────────────────────────────────────────────────────────────────────────
// 调试端口探测
// ───────────────────────────────────────────────────────────────────────────

/** 依次尝试的调试端口：显式指定 → 环境变量 → 常见约定（9222 通用 / 9333 T2 用过 / 12319 FormDrive） */
export const DEBUG_PORT_CANDIDATES = [9222, 9333, 12319];

/**
 * 找到一个可用的 CDP 调试端口。
 * 注意：本脚本**不启动浏览器**，只连接一个已经带 `--remote-debugging-port` 的实例
 * （启动浏览器属人工配置项，命令见 docs/qa-checklist.md 的“环境准备”一节）。
 */
export async function resolveDebugPort(preferred = null) {
  const candidates = preferred
    ? [preferred, ...DEBUG_PORT_CANDIDATES.filter((port) => port !== preferred)]
    : DEBUG_PORT_CANDIDATES;
  for (const port of candidates) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) continue;
      const version = await response.json();
      return { port, browser: version.Browser ?? "unknown" };
    } catch {
      // 该端口没有调试实例，试下一个
    }
  }
  throw new Error(
    `未找到可用的 CDP 调试端口（已尝试 ${candidates.join(" / ")}）。\n` +
      `请先启动一个带调试端口的浏览器（无需关闭现有窗口），例如：\n` +
      `  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe" ` +
      `--headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\\car-display-edge ` +
      `--no-first-run --window-size=1440,900 about:blank\n` +
      `或用 --debug-port=<端口> 指定。详见 docs/qa-checklist.md。`,
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 会话
// ───────────────────────────────────────────────────────────────────────────

export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 连接调试端口、开一个新标签页并导航到 baseUrl，返回会话对象。
 * 会话对象的方法见下方 JSDoc；`close()` 会关掉标签页并断开 WebSocket。
 */
export async function createSession(options) {
  const { port, browser } = await resolveDebugPort(options.debugPort);
  const endpoint = `http://127.0.0.1:${port}`;

  const target = await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT" }).then((response) => {
    if (!response.ok) throw new Error(`PUT /json/new 失败：HTTP ${response.status}`);
    return response.json();
  });

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  const pending = new Map();
  const events = { exceptions: [], logErrors: [], consoleErrors: [] };
  let commandId = 0;

  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject, timer } = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(timer);
      if (message.error) reject(new Error(`${message.error.message}（${message.error.code ?? "?"}）`));
      else resolve(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const details = message.params?.exceptionDetails ?? {};
      events.exceptions.push(details.exception?.description ?? details.text ?? "未知异常");
    } else if (message.method === "Log.entryAdded") {
      const entry = message.params?.entry ?? {};
      if (entry.level === "error") events.logErrors.push(`${entry.source ?? "?"}: ${entry.text ?? ""}`);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params?.type === "error") {
      events.consoleErrors.push(
        (message.params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" "),
      );
    }
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error(`WebSocket 连接失败：${target.webSocketDebuggerUrl}`)), { once: true });
  });

  function send(method, params = {}) {
    const id = ++commandId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP 命令超时（${options.timeoutMs}ms）：${method}`));
      }, options.timeoutMs);
      pending.set(id, { resolve, reject, timer });
    });
  }

  /** 求值。`expression` 可以是字符串，也可以是一个函数（自动序列化并调用，参数逐个 JSON 化）。 */
  async function evaluate(expression, ...args) {
    const source =
      typeof expression === "function"
        ? `(${expression.toString()})(${args.map((arg) => JSON.stringify(arg)).join(",")})`
        : expression;
    const result = await send("Runtime.evaluate", { expression: source, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      const details = result.exceptionDetails;
      throw new Error(
        `页面求值抛错：${details.exception?.description ?? details.text ?? "未知"}｜表达式：${source.slice(0, 200)}`,
      );
    }
    return result.result.value;
  }

  /**
   * 轮询直到表达式返回真值。超时抛错，错误信息里带上最后一次观测值（便于定位）。
   * @returns 最后一次求值结果
   */
  async function waitFor(expression, { timeout = options.timeoutMs, interval = 100, label = "条件" } = {}) {
    const startedAt = Date.now();
    let last;
    for (;;) {
      last = await evaluate(expression);
      if (last) return last;
      if (Date.now() - startedAt > timeout) {
        throw new Error(
          `等待超时（${timeout}ms）：${label}｜最后一次观测值：${JSON.stringify(last)?.slice(0, 300)}`,
        );
      }
      await delay(interval);
    }
  }

  const mouse = {
    async move(x, y) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0 });
    },
    async press(x, y) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    },
    async release(x, y) {
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
    },
    /** 一次完整点击：move → press → release */
    async click(x, y) {
      await mouse.move(x, y);
      await mouse.press(x, y);
      await delay(20);
      await mouse.release(x, y);
    },
    /** 拖拽：press → 分步 move → release（步数越多越像人手，OrbitControls 的阻尼也才吃得住） */
    async drag(from, to, { steps = 8, stepDelayMs = 16 } = {}) {
      await mouse.move(from.x, from.y);
      await mouse.press(from.x, from.y);
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        await mouse.move(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio);
        await delay(stepDelayMs);
      }
      await mouse.release(to.x, to.y);
    },
  };

  const touch = {
    async tap(x, y) {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
      await delay(30);
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    async drag(from, to, { steps = 8, stepDelayMs = 16 } = {}) {
      await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        await send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, id: 1 }],
        });
        await delay(stepDelayMs);
      }
      await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
  };

  /** 截图存到系统临时目录，返回文件路径（不入库） */
  async function screenshot(name) {
    const capture = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const directory = path.join(os.tmpdir(), "car-display-qa");
    await mkdir(directory, { recursive: true });
    const filename = path.join(directory, `${name}.png`);
    await writeFile(filename, Buffer.from(capture.data, "base64"));
    return filename;
  }

  async function close({ keepOpen = false } = {}) {
    try {
      if (socket.readyState === WebSocket.OPEN) socket.close();
    } catch { /* 忽略 */ }
    if (!keepOpen) {
      try {
        await fetch(`${endpoint}/json/close/${target.id}`);
      } catch { /* 忽略 */ }
    }
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.bringToFront");
  await send("Emulation.setDeviceMetricsOverride", {
    width: options.width,
    height: options.height,
    deviceScaleFactor: 1,
    mobile: Boolean(options.mobile),
  });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Page.navigate", { url: options.baseUrl });

  return { send, evaluate, waitFor, mouse, touch, screenshot, close, events, debugPort: port, browser, target, options };
}

// ───────────────────────────────────────────────────────────────────────────
// 页面快照与契约层辅助（只经 §13.3 钩子读，不碰工程内部实现）
// ───────────────────────────────────────────────────────────────────────────

/**
 * 一次求值同时取回 store 状态与两个审计对象，避免分次读取造成状态错位。
 * 钩子未安装时对应字段为 `null`，由调用方决定 FAIL 还是 SKIP。
 */
export function readSnapshot(session) {
  return session.evaluate(() => {
    const audit = typeof window.__carDisplaySceneAudit === "function" ? window.__carDisplaySceneAudit() : null;
    const camera = typeof window.__carDisplayCameraAudit === "function" ? window.__carDisplayCameraAudit() : null;
    const state = window.__carDisplayStore?.getState?.() ?? null;
    return {
      hasStore: Boolean(window.__carDisplayStore?.getState),
      hasSceneAudit: typeof window.__carDisplaySceneAudit === "function",
      hasCameraAudit: typeof window.__carDisplayCameraAudit === "function",
      hasVoiceInject: typeof window.__carDisplayVoiceInject === "function",
      parts: audit?.parts ?? null,
      lights: audit?.lights ?? null,
      cameraView: audit?.cameraView ?? null,
      autoRotate: audit?.autoRotate ?? null,
      hitTargets: audit?.hitTargets ?? null,
      perf: audit?.perf ?? null,
      camera,
      state: state
        ? {
            parts: state.parts,
            lights: state.lights,
            cameraView: state.cameraView,
            cameraCommand: state.cameraCommand,
            voice: state.voice,
            toast: state.toast,
            autoRotate: state.autoRotate,
            lastInteractionAt: state.lastInteractionAt,
          }
        : null,
    };
  });
}

/**
 * 等页面装好审计钩子（store 模块求值时自动安装，故通常很快）。
 * 钩子缺失说明页面没加载到带契约的构建——属硬失败，不是 SKIP。
 */
export async function waitForHooks(session, { timeout = 30000 } = {}) {
  await session.waitFor(
    () => Boolean(window.__carDisplayStore?.getState) && typeof window.__carDisplaySceneAudit === "function",
    { timeout, label: "window.__carDisplayStore + __carDisplaySceneAudit 就绪" },
  );
  return readSnapshot(session);
}

/**
 * 等“集成信号”出现。T5/T7/T8p/T6 未接入时这些信号不会出现，
 * 调用方据此把对应用例标 SKIP 而不是 FAIL（roadmap §12.3：未集成项须明确 skip 标注）。
 */
export async function waitForIntegrationSignals(session, { timeout } = {}) {
  const startedAt = Date.now();
  const limit = timeout ?? session.options.integrationTimeoutMs;
  let signals = await readSignals(session);
  while (!signals.any && Date.now() - startedAt < limit) {
    await delay(250);
    signals = await readSignals(session);
  }
  return signals;
}

function readSignals(session) {
  return session.evaluate(() => {
    const audit = window.__carDisplaySceneAudit?.() ?? null;
    const camera = window.__carDisplayCameraAudit?.() ?? null;
    const signals = {
      /** T5 已注册 hitTargets 且模型已加载（模型未加载时 hitTargets 为空数组） */
      pick: Array.isArray(audit?.hitTargets) && audit.hitTargets.length > 0,
      /** T5 已注册 parts 深合并源（bbox 由 T5 提供） */
      partGeometry: Array.isArray(audit?.parts) && audit.parts.some((part) => Array.isArray(part.bbox)),
      /** T7 已注册相机 position */
      cameraRig: Array.isArray(camera?.position),
      /** T8p 已注册 perf */
      perf: Boolean(audit?.perf),
      /** T6 已装注入点 */
      voice: typeof window.__carDisplayVoiceInject === "function",
    };
    signals.any = Object.values(signals).some(Boolean);
    return signals;
  });
}

/**
 * 把 store 复位到基线：关全部部件与灯光、回 hero 视角、清空 toast。
 * 用 §13.2 的 action 驱动（`closeAll` / `setCameraView` / `dismissToast`），不直写 state。
 */
export async function resetToBaseline(session) {
  await session.evaluate(() => {
    const store = window.__carDisplayStore;
    const state = store.getState();
    state.closeAll?.();
    state.setCameraView?.("hero");
    for (const item of store.getState().toast ?? []) state.dismissToast?.(item.id);
    state.bumpInteraction?.();
  });
  await delay(120);
}

// ───────────────────────────────────────────────────────────────────────────
// 断言器
// ───────────────────────────────────────────────────────────────────────────

const MARK = { pass: "[PASS]", fail: "[FAIL]", skip: "[SKIP]", info: "[INFO]" };

/**
 * 极简断言器：收集 PASS / FAIL / SKIP，末尾打印汇总并决定退出码。
 *
 * - `check(name, condition, detail)` —— 条件为真记 PASS，否则记 FAIL（detail 写期望与实得）
 * - `checkThrows(name, fn)` —— 期望 fn 抛错（用于“非法输入应被拒绝”类断言）
 * - `skip(name, reason)` —— 未集成项，明确标注原因；默认不计入失败（`--strict` 时计入）
 * - `info(text)` —— 仅记录，不参与判定
 */
export function createReporter({ title, strict = false } = {}) {
  const results = [];
  const startedAt = Date.now();

  function record(status, name, detail) {
    results.push({ status, name, detail: detail ?? null });
    const suffix = detail ? `　→　${detail}` : "";
    console.log(`${MARK[status]} ${name}${suffix}`);
  }

  return {
    title,
    info(text) {
      console.log(`${MARK.info} ${text}`);
    },
    pass(name, detail) {
      record("pass", name, detail);
    },
    fail(name, detail) {
      record("fail", name, detail);
    },
    skip(name, reason) {
      record("skip", name, reason);
    },
    /** condition 为真 → PASS；否则 FAIL。detail 建议写成「期望 X，实得 Y」。 */
    check(name, condition, detail) {
      if (condition) record("pass", name, detail);
      else record("fail", name, detail ?? "断言为假");
      return Boolean(condition);
    },
    /** 跑一段可能抛错的断言；抛错记 FAIL 而不是中断整个脚本。 */
    async checkRun(name, fn) {
      try {
        const detail = await fn();
        record("pass", name, typeof detail === "string" ? detail : undefined);
        return true;
      } catch (error) {
        record("fail", name, error?.message ?? String(error));
        return false;
      }
    },
    /** 期望 fn 抛错（例如非法 id 应被拒绝）。 */
    async checkThrows(name, fn) {
      try {
        await fn();
        record("fail", name, "期望抛错，实际正常返回");
        return false;
      } catch (error) {
        record("pass", name, `按预期拒绝：${error?.message ?? String(error)}`.slice(0, 160));
        return true;
      }
    },
    get counts() {
      return results.reduce(
        (accumulator, item) => ({ ...accumulator, [item.status]: (accumulator[item.status] ?? 0) + 1 }),
        { pass: 0, fail: 0, skip: 0 },
      );
    },
    get results() {
      return results;
    },
    /** 打印汇总，返回进程退出码（0 = 通过）。 */
    finish() {
      const counts = this.counts;
      const failed = counts.fail > 0 || (strict && counts.skip > 0);
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log("");
      console.log(`── ${title} 汇总 ──────────────────────────────`);
      console.log(
        `合计 ${results.length} 项：PASS ${counts.pass} / FAIL ${counts.fail} / SKIP ${counts.skip}　用时 ${elapsed}s` +
          (strict ? "　（--strict：SKIP 计入失败）" : ""),
      );
      if (counts.skip > 0) {
        console.log("SKIP 明细：");
        for (const item of results.filter((entry) => entry.status === "skip")) {
          console.log(`  · ${item.name} —— ${item.detail}`);
        }
      }
      if (counts.fail > 0) {
        console.log("FAIL 明细：");
        for (const item of results.filter((entry) => entry.status === "fail")) {
          console.log(`  · ${item.name} —— ${item.detail}`);
        }
      }
      console.log(`结果：${failed ? "不通过" : "通过"}`);
      return failed ? 1 : 0;
    },
  };
}

/**
 * 统一收尾：写 JSON 报告（可选）、打印汇总、关会话、设置退出码。
 * 任何脚本主体抛错时也应调用本函数（`error` 传入即可），保证不会静默退出。
 */
export async function finalize({ reporter, session, options, extra = {}, error = null }) {
  if (error) reporter.fail("脚本执行未完成", error.message ?? String(error));
  const exitCode = reporter.finish();
  if (options?.reportPath) {
    const report = {
      title: reporter.title,
      generatedAt: new Date().toISOString(),
      baseUrl: options.baseUrl,
      debugPort: session?.debugPort ?? null,
      browser: session?.browser ?? null,
      viewport: options ? { width: options.width, height: options.height, mobile: options.mobile } : null,
      exitCode,
      counts: reporter.counts,
      results: reporter.results,
      pageEvents: session?.events ?? null,
      ...extra,
    };
    const file = path.resolve(options.reportPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`JSON 报告：${file}`);
  }
  if (options?.json) console.log(JSON.stringify({ exitCode, counts: reporter.counts, results: reporter.results }, null, 2));
  if (session) await session.close({ keepOpen: Boolean(options?.keepOpen) });
  process.exitCode = exitCode;
  return exitCode;
}

/** 给脚本主体套一层统一错误处理，避免未捕获异常导致无汇总输出。 */
export async function run(title, main) {
  const options = parseCli();
  const reporter = createReporter({ title, strict: options.strict });
  if (options.unknown.length > 0) reporter.info(`忽略未知参数：${options.unknown.join(" ")}`);
  let session = null;
  try {
    session = await createSession(options);
    const extra = await main({ session, options, reporter });
    return await finalize({ reporter, session, options, extra: extra ?? {} });
  } catch (error) {
    return await finalize({ reporter, session, options, error });
  }
}
