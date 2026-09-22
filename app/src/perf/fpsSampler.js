/**
 * fpsSampler.js —— 运行时帧率采样与自动降档触发（T8p，规格来源：§11.1 T8p ② / §13.3②）
 *
 * 职责：用 requestAnimationFrame 按固定窗口统计真实帧率；**连续 N 个窗口**低于阈值时，
 * 回调通知消费方降档（降档决策归 PerfProvider，本模块不认识档位名）。
 *
 * 对外快照 `getSnapshot()` 返回的正是 §13.3 要求的 `{ fps, dpr, tier }`，
 * 由 PerfProvider 注册进 `registerSceneAuditSource("perf", fn)`。
 *
 * ── 三条防误判设计（都来自"22.7 MiB GLB 首屏加载"这个真实场景）──
 * 1. **预热期不采样**：首屏加载/编译着色器阶段帧率天然极低，若计入会让每台设备都被误降档。
 *    预热默认 3s 起，并由 `markReady()` 在场景真正就绪时结束（未调用则兜底 readyTimeoutMs）。
 * 2. **页面隐藏 / 长卡顿不计帧**：标签页切到后台时 rAF 被浏览器暂停，恢复瞬间两帧之间的
 *    时间戳会跳变（实测可达数十秒）。若照常累加，会算出一个接近 0 的假帧率并误触发降档。
 *    两道防线：`isHidden()` 为真时重置窗口基准；单帧间隔超过 `stallResetMs`（默认 2 个窗口）
 *    视为"停摆/长卡顿"而非低帧，同样重置而不记录。第二道是真正兜底的——rAF 暂停期间
 *    回调根本不执行，只靠 isHidden 检查救不了恢复后的第一帧。
 * 3. **降档后冷却**：降档本身会改变渲染负载，紧接着的窗口不可信。冷却期内只记录不判定。
 *
 * 依赖注入：requestFrame / cancelFrame / now / isHidden 均可覆盖，
 * 因此本模块可在 Node 里用假时钟确定性单测，不必起浏览器（见 perf/selfTest.mjs）。
 */

export const DEFAULT_THRESHOLDS = {
  /** 单个采样窗口长度（ms）。1s 窗口 + 3 窗口 = 约 3s 才可能触发一次降档 */
  sampleWindowMs: 1000,
  /** 连续多少个窗口低于阈值才降档 */
  windowCount: 3,
  /** 低于该帧率视为"低帧"。桌面目标 ≥55fps、手机 ≥30fps，由 PerfProvider 按设备类型传值 */
  lowFps: 45,
  /** 预热时长下限（ms）：从 start() 起至少这么久不判定 */
  warmupMs: 3000,
  /** 预热兜底时长（ms）：始终没等到 markReady() 时，最迟在此时长后开始判定 */
  readyTimeoutMs: 12000,
  /** 降档成功后跳过多少个窗口再重新判定 */
  cooldownWindows: 2,
  /**
   * 单帧间隔超过该值视为停摆/长卡顿（而非低帧），重置窗口不记录。
   * 取**绝对毫秒**而非"采样窗口的倍数"：卡顿是卡顿，与窗口长度无关。
   * 2000ms 相对默认采样窗口 1000ms 即"两帧之间隔了 2 个窗口"，等于 0.5fps 以下才算停摆。
   */
  stallResetMs: 2000,
};

const defaultFrameApi = {
  requestFrame: (fn) => globalThis.requestAnimationFrame(fn),
  cancelFrame: (id) => globalThis.cancelAnimationFrame(id),
  now: () => (globalThis.performance ?? Date).now(),
  isHidden: () => typeof document !== "undefined" && document.hidden === true,
};

/**
 * @param {object} [options]
 * @param {() => string} [options.getTier] 读取当前档位；快照的 tier 字段用它，保证与 Provider 单一来源
 * @param {(info: { fps: number, samples: number[] }) => boolean} [options.onLowFps]
 *   连续低帧回调。**返回 true 表示"确实降了一档"**，采样器据此进入冷却；返回 false（已是最低档）则不冷却。
 * @param {Partial<typeof DEFAULT_THRESHOLDS>} [options.thresholds]
 */
export function createFpsSampler(options = {}) {
  const {
    getTier = () => "high",
    onLowFps = null,
    thresholds: thresholdOverrides = {},
    ...frameApiOverrides
  } = options;

  const thresholds = { ...DEFAULT_THRESHOLDS, ...thresholdOverrides };
  const frameApi = { ...defaultFrameApi, ...frameApiOverrides };

  /** 报数用的滚动历史，长度上限 windowCount；不被冷却清空，避免快照在冷却期读回 0 */
  const history = [];
  let frameId = null;
  let running = false;
  let frames = 0;
  let windowStartedAt = null;
  let startedAt = 0;
  let readyAt = null;
  let cooldown = 0;
  let downgrades = 0;
  let lastFps = 0;

  const warmupEndsAt = () => {
    const floor = startedAt + thresholds.warmupMs;
    if (readyAt === null) return Math.max(floor, startedAt + thresholds.readyTimeoutMs);
    return Math.max(floor, readyAt);
  };

  const inWarmup = () => frameApi.now() < warmupEndsAt();

  function recordSample(fps) {
    lastFps = fps;
    history.push(fps);
    if (history.length > thresholds.windowCount) history.shift();

    if (cooldown > 0) {
      cooldown -= 1;
      return;
    }
    if (history.length < thresholds.windowCount) return;
    if (!history.every((value) => value < thresholds.lowFps)) return;

    const acted = onLowFps?.({ fps, samples: [...history] }) === true;
    if (acted) downgrades += 1;
    // 降档后负载会变，冷却短一些以便继续纠偏；未降档（已到底）则等更久，避免反复空转
    cooldown = acted ? thresholds.cooldownWindows : thresholds.windowCount * 2;
  }

  function tick() {
    if (!running) return;
    frameId = frameApi.requestFrame(tick);

    if (frameApi.isHidden()) {
      // 隐藏期间 rAF 停摆，必须重置基准，否则恢复瞬间会算出一个假低帧
      frames = 0;
      windowStartedAt = null;
      return;
    }

    const timestamp = frameApi.now();
    if (windowStartedAt === null) {
      windowStartedAt = timestamp;
      return;
    }

    frames += 1;
    const elapsed = timestamp - windowStartedAt;

    // 停摆/长卡顿（后台恢复、主线程长阻塞）：两帧间隔远超一个窗口，说明这段时间没有渲染，
    // 不是"帧率低"。重置基准，别把它算成低帧样本。
    if (elapsed > thresholds.stallResetMs) {
      frames = 0;
      windowStartedAt = timestamp;
      return;
    }

    if (elapsed < thresholds.sampleWindowMs) return;

    const fps = (frames * 1000) / elapsed;
    frames = 0;
    windowStartedAt = timestamp;
    if (!inWarmup()) recordSample(fps);
  }

  return {
    start() {
      if (running) return;
      running = true;
      startedAt = frameApi.now();
      readyAt = null;
      frames = 0;
      windowStartedAt = null;
      cooldown = 0;
      history.length = 0;
      frameId = frameApi.requestFrame(tick);
    },

    stop() {
      running = false;
      if (frameId !== null) frameApi.cancelFrame(frameId);
      frameId = null;
    },

    /**
     * 通知"场景已就绪，可以开始判定帧率了"。由消费方接在首屏加载完成信号上（T8 接线）。
     * 不调用也能工作——预热会在 readyTimeoutMs 后自行结束。
     */
    markReady() {
      if (readyAt === null) readyAt = frameApi.now();
    },

    /** §13.3 要求的形状，直接作为 registerSceneAuditSource("perf", fn) 的返回值 */
    getSnapshot() {
      const recent = history.length > 0 ? history : [0];
      const average = recent.reduce((sum, value) => sum + value, 0) / recent.length;
      return {
        fps: Math.round(average * 10) / 10,
        dpr: Number(globalThis.devicePixelRatio) || 1,
        tier: getTier(),
      };
    },

    /** 自测/排障用的内部状态；不进审计契约 */
    getDiagnostics() {
      return {
        running,
        warmingUp: running && inWarmup(),
        lastFps: Math.round(lastFps * 10) / 10,
        history: [...history],
        cooldown,
        downgrades,
        thresholds,
      };
    },

    isRunning: () => running,
  };
}
