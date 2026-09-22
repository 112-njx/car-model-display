/**
 * selfTest.mjs —— T8p 纯逻辑自测（免浏览器、零依赖、确定性假时钟）
 *
 * 运行：node app/src/perf/selfTest.mjs
 * 退出码 0 = 全绿。覆盖 deviceTier 判档表与 fpsSampler 的三条防误判路径。
 *
 * 为什么不用真浏览器：判档与降档判定是纯逻辑，用假时钟能精确构造"预热期低帧"
 * "后台标签页停摆""降档后冷却"这些真机极难稳定复现的边界。真机帧率实测归 T8（Wave 2）。
 */

import { TIERS, classifyTier, detectEnv, lowerTier, nextTierDown } from "./deviceTier.js";
import { DEFAULT_THRESHOLDS, createFpsSampler } from "./fpsSampler.js";
import { FORCE_KEY, probeGraphicsSupport, probeWebGL, resetProbeCache } from "./graphicsSupport.js";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function equal(name, actual, expected) {
  check(name, Object.is(actual, expected), `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

// ── 假帧时钟：按指定帧率推进时间并驱动 rAF 回调 ──
function makeHarness({ fps = 60, thresholds, getTier = () => "high", onLowFps = null } = {}) {
  let clock = 0;
  let pending = null;
  let id = 0;
  let framesDriven = 0;
  const state = { hidden: false };
  const lowFpsCalls = [];

  const sampler = createFpsSampler({
    getTier,
    onLowFps: (info) => {
      lowFpsCalls.push(info.fps);
      return onLowFps ? onLowFps(info) : false;
    },
    thresholds,
    now: () => clock,
    requestFrame: (fn) => {
      pending = fn;
      id += 1;
      return id;
    },
    cancelFrame: () => {
      pending = null;
    },
    isHidden: () => state.hidden,
  });

  /** 推进 durationMs，期间按当前 fps 产生帧（与真实 rAF 一样：先取时间，再回调） */
  const run = (durationMs, fpsOverride) => {
    const interval = 1000 / (fpsOverride ?? fps);
    let elapsed = 0;
    // 条件里带 interval：否则最后一次迭代会越过 durationMs 一整个帧间隔，
    // 让"推进 900ms"实际跑到 1000ms，跨过预热边界而误判测试失败
    while (elapsed + interval <= durationMs) {
      elapsed += interval;
      clock += interval;
      const fn = pending;
      pending = null;
      if (fn) framesDriven += 1;
      fn?.();
    }
  };

  /**
   * 只推进时钟、**不驱动 rAF 回调** —— 模拟浏览器在后台标签页里暂停 rAF。
   * 恢复渲染后，下一帧与上一帧的时间戳会相隔这一段时长，这正是要防的跳变。
   */
  const advanceClockOnly = (ms) => {
    clock += ms;
  };

  return {
    sampler,
    run,
    lowFpsCalls,
    state,
    advanceClockOnly,
    get framesDriven() {
      return framesDriven;
    },
    setFps: (value) => {
      fps = value;
    },
  };
}

console.log("\n[1] deviceTier 判档表");

// 桌面强机：8 核 + 8GB + dpr1
equal(
  "桌面 16 核 / 8GB / dpr1 → high",
  classifyTier({ ua: "Windows", dpr: 1, cores: 16, memory: 8, mobile: false, platform: "windows" }).tier,
  "high",
);
// 桌面主流：4 核 + 8GB + dpr2
equal(
  "桌面 4 核 / 8GB / dpr2 → mid",
  classifyTier({ ua: "Windows", dpr: 2, cores: 4, memory: 8, mobile: false, platform: "windows" }).tier,
  "mid",
);
// 桌面低配：2 核 + 2GB
equal(
  "桌面 2 核 / 2GB / dpr1 → low",
  classifyTier({ ua: "Windows", dpr: 1, cores: 2, memory: 2, mobile: false, platform: "windows" }).tier,
  "low",
);
// Safari 不暴露 deviceMemory，靠 macOS 补偿项救回 high
equal(
  "macOS / 8 核 / 内存未知 / dpr2 → high（Safari 补偿）",
  classifyTier({ ua: "Macintosh", dpr: 2, cores: 8, memory: null, mobile: false, platform: "mac" }).tier,
  "high",
);
// 真实 iPhone：dpr 3 扣分后，分数本就只到 mid，封顶规则不参与
const iphone = classifyTier({ ua: "iPhone", dpr: 3, cores: 6, memory: 8, mobile: true, platform: "ios" });
equal("iPhone（6 核 / 8GB / dpr3）→ mid", iphone.tier, "mid");
equal("iPhone 未触发封顶（分数本就只到 mid）", iphone.mobileCap, false);
// 强移动端：分数够 high，必须被移动端封顶压到 mid —— 这条才真正测到封顶规则
const strongPhone = classifyTier({ ua: "Android", dpr: 2, cores: 8, memory: 8, mobile: true, platform: "android" });
check("强移动端封顶前分数确实够 high", strongPhone.score >= 4, `实得 score ${strongPhone.score}`);
equal("强移动端（8 核 / 8GB / dpr2）→ 封顶 mid", strongPhone.tier, "mid");
equal("封顶被标记 mobileCap", strongPhone.mobileCap, true);
// 安卓低端
equal(
  "安卓 4 核 / 2GB / dpr2 → low",
  classifyTier({ ua: "Android", dpr: 2, cores: 4, memory: 2, mobile: true, platform: "android" }).tier,
  "low",
);
// 未知环境（Node / 老浏览器）不应崩，且给中性档
const unknown = classifyTier({ ua: "", dpr: 1, cores: null, memory: null, mobile: false, platform: "unknown" });
check("未知环境不抛错且给 mid", unknown.tier === "mid", `实得 ${unknown.tier} / score ${unknown.score}`);
check("classifyTier(undefined) 不抛错", typeof classifyTier(undefined).tier === "string");
check("detectEnv() 在 Node 下返回中性值", detectEnv().cores === null && detectEnv().dpr === 1);

console.log("\n[2] 档位工具函数");
equal("nextTierDown(high)", nextTierDown("high"), "mid");
equal("nextTierDown(mid)", nextTierDown("mid"), "low");
equal("nextTierDown(low) = null（到底）", nextTierDown("low"), null);
equal("lowerTier(mid, high) 取较低", lowerTier("mid", "high"), "mid");
equal("lowerTier(high, low) 取较低", lowerTier("high", "low"), "low");
equal("TIERS 顺序即由高到低", TIERS.join(","), "high,mid,low");

console.log("\n[3] fpsSampler —— 稳定高帧不降档");

const fast = makeHarness({ fps: 60, thresholds: { warmupMs: 100, readyTimeoutMs: 200, sampleWindowMs: 100, windowCount: 3, lowFps: 45 } });
fast.sampler.start();
fast.sampler.markReady();
fast.run(2000);
equal("60fps 跑 2s：低帧回调 0 次", fast.lowFpsCalls.length, 0);
const fastSnap = fast.sampler.getSnapshot();
check("快照 fps ≈ 60", fastSnap.fps > 55 && fastSnap.fps <= 60.1, `实得 ${fastSnap.fps}`);
equal("快照形状恰为 {fps,dpr,tier}", Object.keys(fastSnap).sort().join(","), "dpr,fps,tier");
equal("快照 tier 取自 getTier()", fastSnap.tier, "high");
fast.sampler.stop();

console.log("\n[4] fpsSampler —— 持续低帧触发降档（核心 DoD）");

let tier = "high";
const slow = makeHarness({
  fps: 20,
  getTier: () => tier,
  onLowFps: () => {
    const next = nextTierDown(tier);
    if (!next) return false;
    tier = next;
    return true;
  },
  thresholds: { warmupMs: 100, readyTimeoutMs: 200, sampleWindowMs: 100, windowCount: 3, lowFps: 45, cooldownWindows: 2 },
});
slow.sampler.start();
slow.sampler.markReady();
slow.run(400); // 预热 100ms + 3 个 100ms 窗口 → 约 350ms 时首次降档
check("20fps 持续 → 已降档到 mid", tier === "mid", `实得 ${tier}`);
check("低帧回调至少 1 次", slow.lowFpsCalls.length >= 1, `实得 ${slow.lowFpsCalls.length}`);
check("快照 tier 跟随 getTier() 变为 mid", slow.sampler.getSnapshot().tier === "mid");
check("快照 fps 仍是低帧实测值（非 0）", slow.sampler.getSnapshot().fps > 0 && slow.sampler.getSnapshot().fps < 30);
slow.run(400); // 冷却 2 窗口后再凑满 3 窗口 → 约 650ms 时二次降档
check("继续低帧 → 降到底 low", tier === "low", `实得 ${tier}`);
const callsAtLow = slow.lowFpsCalls.length;
slow.run(2000);
check("已到底后不再降（回调返回 false 不改变档位）", tier === "low");
check("已到底后回调不空转（冷却生效）", slow.lowFpsCalls.length <= callsAtLow + 3, `新增 ${slow.lowFpsCalls.length - callsAtLow} 次`);
slow.sampler.stop();

console.log("\n[5] fpsSampler —— 预热期低帧不降档（防 22.7MiB GLB 加载误判）");

let warmTier = "high";
const warm = makeHarness({
  fps: 8,
  getTier: () => warmTier,
  onLowFps: () => {
    warmTier = "low";
    return true;
  },
  thresholds: { warmupMs: 1000, readyTimeoutMs: 5000, sampleWindowMs: 50, windowCount: 3, lowFps: 45 },
});
warm.sampler.start();
warm.sampler.markReady(); // 预热 = max(1000ms, ~0) = 1000ms
warm.run(900); // 全程落在预热期内；8fps 下已跑出多个采样窗口
check("预热期内确实驱动了多帧（否则下面的断言是空跑）", warm.framesDriven >= 5, `实得 ${warm.framesDriven}`);
check("预热期内产出的样本被丢弃（history 为空）", warm.sampler.getDiagnostics().history.length === 0);
equal("预热期内低帧回调 0 次", warm.lowFpsCalls.length, 0);
equal("预热期内档位不变", warmTier, "high");
warm.run(600); // 越过 1000ms 预热后凑满 3 个 50ms 窗口
check("预热结束后同帧率立即能判出低帧", warmTier === "low", `实得 ${warmTier}`);
warm.sampler.stop();

console.log("\n[6] fpsSampler —— 后台标签页停摆不算低帧");

let hiddenTier = "high";
const hidden = makeHarness({
  fps: 60,
  getTier: () => hiddenTier,
  onLowFps: () => {
    hiddenTier = "mid";
    return true;
  },
  thresholds: { warmupMs: 100, readyTimeoutMs: 200, sampleWindowMs: 100, windowCount: 3, lowFps: 45 },
});
hidden.sampler.start();
hidden.sampler.markReady();
hidden.run(300);
// 切到后台 30s：rAF 被浏览器暂停（回调不执行），但时钟照走
hidden.state.hidden = true;
hidden.advanceClockOnly(30000);
// 切回前台：下一帧的时间戳比上一帧晚 30s
hidden.state.hidden = false;
hidden.run(600);
check("隐藏 30s 后恢复：未因时间戳跳变误降档", hiddenTier === "high", `实得 ${hiddenTier}`);
check("恢复后仍能正常报帧率（不是被跳变污染的 0.03fps）", hidden.sampler.getSnapshot().fps > 50, `实得 ${hidden.sampler.getSnapshot().fps}`);
check("跳变帧未被记成低帧样本", hidden.sampler.getDiagnostics().history.every((f) => f > 50), JSON.stringify(hidden.sampler.getDiagnostics().history));
hidden.sampler.stop();

console.log("\n[7] fpsSampler —— 手机 30fps 阈值（lowFps 由消费方传 28）");

let mobileTier = "mid";
const mobile = makeHarness({
  fps: 30,
  getTier: () => mobileTier,
  onLowFps: () => {
    mobileTier = "low";
    return true;
  },
  thresholds: { warmupMs: 100, readyTimeoutMs: 200, sampleWindowMs: 100, windowCount: 3, lowFps: 28 },
});
mobile.sampler.start();
mobile.sampler.markReady();
mobile.run(1000);
equal("30fps / 阈值 28 → 不降档（手机达标线）", mobileTier, "mid");
mobile.sampler.stop();

let mobileSlowTier = "mid";
const mobileSlow = makeHarness({
  fps: 18,
  getTier: () => mobileSlowTier,
  onLowFps: () => {
    mobileSlowTier = "low";
    return true;
  },
  thresholds: { warmupMs: 100, readyTimeoutMs: 200, sampleWindowMs: 100, windowCount: 3, lowFps: 28 },
});
mobileSlow.sampler.start();
mobileSlow.sampler.markReady();
mobileSlow.run(1000);
check("18fps / 阈值 28 → 降档", mobileSlowTier === "low", `实得 ${mobileSlowTier}`);
mobileSlow.sampler.stop();

console.log("\n[8] fpsSampler —— 默认阈值下的行为（不覆盖 thresholds）");
equal("默认预热下限 3000ms", DEFAULT_THRESHOLDS.warmupMs, 3000);
equal("默认连续窗口数 3", DEFAULT_THRESHOLDS.windowCount, 3);
equal("默认低帧阈值 45", DEFAULT_THRESHOLDS.lowFps, 45);

let defTier = "high";
const defSlow = makeHarness({
  fps: 20,
  getTier: () => defTier,
  onLowFps: () => {
    defTier = "mid";
    return true;
  },
});
defSlow.sampler.start();
defSlow.sampler.markReady(); // 预热 = max(3000ms, now) = 3000ms
defSlow.run(2500);
equal("默认阈值：2.5s（预热未结束）不降档", defTier, "high");
defSlow.run(3500); // 累计 6s：越过 3s 预热后凑满 3 个 1s 窗口
check("默认阈值：约 5s 完成首次降档", defTier === "mid", `实得 ${defTier}`);
defSlow.sampler.stop();

console.log("\n[9] 生命周期");
const life = makeHarness({ fps: 60 });
life.sampler.start();
check("start 后 isRunning 为 true", life.sampler.isRunning() === true);
life.sampler.start();
check("重复 start 幂等", life.sampler.isRunning() === true);
life.sampler.stop();
check("stop 后 isRunning 为 false", life.sampler.isRunning() === false);
life.run(500);
check("stop 后不再产帧（无 pending 回调）", life.sampler.getDiagnostics().running === false);

console.log("\n[10] graphicsSupport —— 降级页的判定依据");

/**
 * 用假的 document / window / navigator.gpu 驱动探测分支。
 * 真实浏览器里的降级页渲染由 CDP 自测覆盖；这里覆盖的是**判定逻辑**本身。
 */
function withFakeEnv({ getContext, gpu, hasNavigatorGpu = false }, fn) {
  const hadDocument = "document" in globalThis;
  const savedDocument = globalThis.document;
  const savedWindow = globalThis.window;
  const hadGpu = "gpu" in (globalThis.navigator ?? {});
  const savedGpu = globalThis.navigator?.gpu;
  let lostContextCalls = 0;

  globalThis.document = {
    createElement: () => ({
      getContext: (type) => {
        const result = getContext(type);
        if (result && typeof result === "object") {
          result.getExtension = (name) => {
            if (name === "WEBGL_lose_context") return { loseContext: () => { lostContextCalls += 1; } };
            return null;
          };
        }
        return result;
      },
    }),
  };
  globalThis.window = {};
  if (globalThis.navigator) {
    if (hasNavigatorGpu) {
      Object.defineProperty(globalThis.navigator, "gpu", { value: gpu, configurable: true });
    } else {
      delete globalThis.navigator.gpu;
    }
  }
  resetProbeCache();

  const restore = () => {
    if (hadDocument) globalThis.document = savedDocument;
    else delete globalThis.document;
    if (savedWindow === undefined) delete globalThis.window;
    else globalThis.window = savedWindow;
    if (globalThis.navigator) {
      if (hadGpu) Object.defineProperty(globalThis.navigator, "gpu", { value: savedGpu, configurable: true });
      else delete globalThis.navigator.gpu;
    }
    resetProbeCache();
  };

  return Promise.resolve(fn()).finally(restore).then(() => lostContextCalls);
}

// webgl2 可用 → 直接判可渲染，且探测后归还了上下文名额
let lost = 0;
await withFakeEnv({ getContext: (type) => (type === "webgl2" ? {} : null) }, async () => {
  const result = probeWebGL();
  check("webgl2 可用 → ok", result.ok === true, JSON.stringify(result));
  equal("api 标为 webgl2", result.api, "webgl2");
}).then((calls) => {
  lost = calls;
});
equal("探测后调用了 WEBGL_lose_context 归还名额", lost, 1);

// 只有 webgl1
await withFakeEnv({ getContext: (type) => (type === "webgl" ? {} : null) }, async () => {
  const result = probeWebGL();
  check("仅 webgl1 可用 → ok", result.ok === true, JSON.stringify(result));
  equal("api 标为 webgl", result.api, "webgl");
});

// 无任何 WebGL，但有可用 WebGPU 适配器 → 仍判可渲染（StudioCanvas 优先走 WebGPU）
await withFakeEnv(
  {
    getContext: () => null,
    hasNavigatorGpu: true,
    gpu: { requestAdapter: async () => ({ name: "fake-adapter" }) },
  },
  async () => {
    const result = await probeGraphicsSupport();
    check("无 WebGL 但有 WebGPU 适配器 → ok（不弹降级页）", result.ok === true, JSON.stringify(result));
    equal("api 标为 webgpu", result.api, "webgpu");
  },
);

// navigator.gpu 存在但拿不到适配器 → 降级
await withFakeEnv(
  { getContext: () => null, hasNavigatorGpu: true, gpu: { requestAdapter: async () => null } },
  async () => {
    const result = await probeGraphicsSupport();
    check("WebGPU 拿不到适配器 → 降级", result.ok === false, JSON.stringify(result));
    check("reason 里保留了 webgpu 子原因", result.reason.includes("webgpu:no-adapter"), result.reason);
  },
);

// 两者都没有 → 降级，且 reason 同时记录两条子原因
await withFakeEnv({ getContext: () => null }, async () => {
  const result = await probeGraphicsSupport();
  check("WebGL 与 WebGPU 都不可用 → 降级", result.ok === false, JSON.stringify(result));
  check("reason 含 webgl:no-context", result.reason.includes("webgl:no-context"), result.reason);
  check("reason 含 webgpu:no-navigator-gpu", result.reason.includes("webgpu:no-navigator-gpu"), result.reason);
});

// getContext 抛异常不应把整个应用带崩
await withFakeEnv(
  {
    getContext: () => {
      throw new Error("驱动炸了");
    },
  },
  async () => {
    const result = await probeGraphicsSupport();
    check("getContext 抛异常 → 降级而非崩溃", result.ok === false, JSON.stringify(result));
    check("reason 含 throw:", result.reason.includes("throw:"), result.reason);
  },
);

// 自测强制钩子：强制走降级页
await withFakeEnv({ getContext: (type) => (type === "webgl2" ? {} : null) }, async () => {
  globalThis.window[FORCE_KEY] = { webgl: false, webgpu: false };
  resetProbeCache();
  const result = await probeGraphicsSupport();
  check("强制钩子 webgl:false → 降级（即使环境其实支持）", result.ok === false, JSON.stringify(result));
  check("强制降级的 reason 标为 forced", result.reason.includes("forced"), result.reason);
});

// 自测强制钩子：强制可用
await withFakeEnv({ getContext: () => null }, async () => {
  globalThis.window[FORCE_KEY] = { webgl: true };
  resetProbeCache();
  const result = await probeGraphicsSupport();
  check("强制钩子 webgl:true → 判可渲染（即使环境其实不支持）", result.ok === true, JSON.stringify(result));
});

console.log(`\n${"─".repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ 全部通过：${passed} 项断言`);
  process.exit(0);
}
console.log(`❌ ${failures.length} 项失败 / 共 ${passed + failures.length} 项：`);
for (const failure of failures) console.log(`   - ${failure}`);
process.exit(1);
