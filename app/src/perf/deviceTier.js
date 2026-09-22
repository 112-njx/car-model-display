/**
 * deviceTier.js —— 设备档位初判（T8p，规格来源：docs/roadmap.md §11.1 T8p ① / §13.1 QUALITY）
 *
 * 职责：在渲染开始**之前**，按 UA / devicePixelRatio / hardwareConcurrency / deviceMemory
 * 给出一个初始档位（high | mid | low）。运行时真帧率由 fpsSampler.js 采样并在此基础上降档。
 *
 * 设计：判定逻辑写成**纯函数** `classifyTier(env)`，浏览器取值另走 `detectEnv()`。
 * 这样判定表可以在 Node 里免依赖单测（见文件末的 `__perfSelfTest`），不必起浏览器。
 *
 * 注意：本模块**不认识 QUALITY**。档位名到具体画质开关的映射在 PerfProvider.jsx 里做，
 * 且唯一来源是 config/carConfig.js 的 QUALITY（§13.1），本文件不复制任何画质数值。
 */

export const TIERS = ["high", "mid", "low"];

/** 档位高低比较用的序号：数值越大越强。用于"只降不升"。 */
const TIER_RANK = { low: 0, mid: 1, high: 2 };

/** 取两个档位中较低的那个。 */
export function lowerTier(a, b) {
  return TIER_RANK[a] <= TIER_RANK[b] ? a : b;
}

/** 当前档位的下一档（已是最低则返回 null）。 */
export function nextTierDown(tier) {
  const index = TIERS.indexOf(tier);
  return index >= 0 && index < TIERS.length - 1 ? TIERS[index + 1] : null;
}

/**
 * 从浏览器环境读取判档所需的信号。非浏览器环境（Node / SSR）返回全 null，
 * 由 classifyTier 按"未知即中性"处理。
 *
 * 判"是否浏览器"用的是 `document` 而不是 `navigator`：Node 21+ 也提供了全局 `navigator`
 * （`userAgent` 形如 "Node.js/24"，且带 `hardwareConcurrency`），用 navigator 判会把
 * Node 误认成浏览器、读出一组无意义的信号。Node 没有 `document`，这才是可靠的分界。
 */
export function detectEnv() {
  if (typeof document === "undefined") {
    return { ua: "", dpr: 1, cores: null, memory: null, mobile: false, platform: "unknown" };
  }
  const ua = String(navigator.userAgent ?? "");
  // navigator.userAgentData.mobile 是 Chromium 的可靠信号；Safari/Firefox 回退到 UA 匹配
  const mobileHint = navigator.userAgentData?.mobile;
  return {
    ua,
    dpr: Number(globalThis.devicePixelRatio) || 1,
    // hardwareConcurrency 各浏览器都有，但会为省电/隐私而上报保守值
    cores: Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null,
    // deviceMemory 仅 Chromium 系暴露，单位为 GB，且被浏览器**上限钳制在 8**
    memory: Number.isFinite(navigator.deviceMemory) ? navigator.deviceMemory : null,
    mobile: typeof mobileHint === "boolean" ? mobileHint : /Mobi|Android|iPhone|iPad|iPod/i.test(ua),
    platform: /Macintosh|Mac OS X/i.test(ua)
      ? "mac"
      : /Windows/i.test(ua)
        ? "windows"
        : /Android/i.test(ua)
          ? "android"
          : /iPhone|iPad|iPod/i.test(ua)
            ? "ios"
            : "unknown",
  };
}

/**
 * 纯函数判档。返回 `{ tier, score, signals }`，signals 供自测与 debug 面板核对。
 *
 * 判档表（分数越高越强；阈值见下）：
 *   内存 deviceMemory(GB)    ≥8 → +2    ≥4 → +1    未知 → +1（中性；Safari/Firefox 不暴露）
 *   逻辑核心 hardwareConcurrency  ≥8 → +2    ≥4 → +1    未知 → +1
 *   像素比 dpr               ≤1 → +1    ≥3 → -1    （dpr 高 = 每帧像素多，桌面 4K/Retina 尤甚）
 *   桌面 macOS 且内存未知    额外 +1（Apple 机型实测内存普遍 ≥8GB，而 Safari 不暴露该字段）
 *   合计 ≥4 → high，≥2 → mid，否则 low
 *   移动端封顶 mid：手机 UA 下即使分数够 high 也不给 high（移动 GPU 与散热与桌面不同档）
 */
export function classifyTier(env) {
  const { dpr = 1, cores = null, memory = null, mobile = false, platform = "unknown" } = env ?? {};

  let score = 0;
  const signals = {};

  if (memory === null) score += (signals.memory = 1);
  else score += (signals.memory = memory >= 8 ? 2 : memory >= 4 ? 1 : 0);

  if (cores === null) score += (signals.cores = 1);
  else score += (signals.cores = cores >= 8 ? 2 : cores >= 4 ? 1 : 0);

  signals.dpr = dpr <= 1 ? 1 : dpr >= 3 ? -1 : 0;
  score += signals.dpr;

  signals.macBonus = platform === "mac" && memory === null ? 1 : 0;
  score += signals.macBonus;

  let tier = score >= 4 ? "high" : score >= 2 ? "mid" : "low";
  const scored = tier;
  if (mobile && tier === "high") tier = "mid";

  return { tier, score, signals, mobileCap: mobile && scored === "high" };
}

/**
 * 一次性拿到"当前设备的初始档位"。detectEnv + classifyTier 的组合入口。
 */
export function detectDeviceTier() {
  const env = detectEnv();
  const result = classifyTier(env);
  return { ...result, env };
}
