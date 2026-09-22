/**
 * useDeviceTier.js —— 画质档位消费 Hook（T8p，规格来源：§11.1 T8p ③）
 *
 * 这是 T3（反射地面/网格/扫光）、T5、T8（dpr 上限）读取画质开关的**唯一入口**。
 * 数据源是 `PerfProvider`，Provider 的唯一数值来源是 `config/carConfig.js` 的 `QUALITY`（§13.1）。
 *
 * 用法：
 *   const { reflector, shadow, sweepLight, dprMax, gridSegments, tier } = useDeviceTier();
 *
 * 注意：本模块**只读** config，不写 config、不写 store（§12.2 T8p 列为 ○只读）。
 */

import { createContext, useContext } from "react";

export const PerfContext = createContext(null);

/** 档位顺序，由高到低。与 §13.1 QUALITY.tiers 一致。 */
export const TIER_ORDER = ["high", "mid", "low"];

/**
 * 读取当前画质档位与开关。
 *
 * @returns {{
 *   tier: 'high'|'mid'|'low',
 *   setTier: (tier: string) => void,
 *   features: { reflector: boolean, shadow: boolean, sweepLight: boolean, dprMax: number, gridSegments: number },
 *   reflector: boolean, shadow: boolean, sweepLight: boolean, dprMax: number, gridSegments: number,
 *   graphics: { ok: boolean, api: string|null, reason: string },
 *   markSceneReady: () => void,
 *   sampler: object,
 * }}
 * @throws {Error} 在 <PerfProvider> 之外调用时抛中文错误（不静默返回默认值——静默会让
 *   "忘了挂 Provider"变成"画质悄悄掉到低档"这种极难排查的故障）
 */
export function useDeviceTier() {
  const value = useContext(PerfContext);
  if (value === null) {
    throw new Error(
      "useDeviceTier() 必须在 <PerfProvider> 内部使用。请在应用根节点用 PerfProvider 包裹组件树：" +
        "import { PerfProvider } from \"./perf/PerfProvider\"; " +
        "具体挂载位置见 app/src/perf/MOUNT.md。",
    );
  }
  return value;
}
