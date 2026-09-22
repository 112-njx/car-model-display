/**
 * PerfProvider.jsx —— 画质档位的唯一提供者（T8p，规格来源：§11.1 T8p ③ / §13.1 / §13.3②）
 *
 * 三件事：
 *   1. 用 deviceTier 做一次设备初判，给出初始档位，并通过 Context 暴露 `tier` / `setTier`；
 *   2. 用 fpsSampler 持续采样，**连续低帧时自动降档（只降不升）**；
 *   3. 向 `registerSceneAuditSource("perf", fn)` 注册 §13.3 要求的 `{ fps, dpr, tier }`。
 *
 * 画质数值的唯一来源是 `config/carConfig.js` 的 `QUALITY`（§13.1）。本文件**只读**它，
 * 不写 config、不写 store（§12.2 把 T8p 在 config 一列标为 ○只读）。
 *
 * 挂载位置与消费方式见同目录 MOUNT.md。**Wave 1 内 T8p 不改 App.jsx/main.jsx**，
 * 正式接线归 T8（§11.1 T8 任务⑤）。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QUALITY } from "../config/carConfig.js";
import { registerSceneAuditSource } from "../devtools/auditHooks.js";
import { detectDeviceTier, nextTierDown } from "./deviceTier.js";
import { createFpsSampler } from "./fpsSampler.js";
import { FORCE_KEY, probeGraphicsSupport, probeWebGL } from "./graphicsSupport.js";
import { PerfContext, TIER_ORDER } from "./useDeviceTier.js";
import { WebGLFallback } from "./WebGLFallback.jsx";

/** 读自测强制钩子 `window.__carDisplayPerfForce`（见 graphicsSupport.js 的 FORCE_KEY） */
function readForce() {
  if (typeof window === "undefined") return null;
  const force = window[FORCE_KEY];
  return force && typeof force === "object" ? force : null;
}

/**
 * 从 QUALITY 里取某档的开关。契约被改过、或传了脏档位时不崩：
 * 退到 `QUALITY.tiers` 的**最低档**——宁可画质低，也不要整页白屏。
 *
 * @param {{ tiers?: string[], features?: Record<string, object> }} quality
 * @param {string} tier
 */
export function resolveFeatures(quality, tier) {
  const features = quality?.features ?? {};
  if (features[tier]) return features[tier];
  const tiers = Array.isArray(quality?.tiers) && quality.tiers.length > 0 ? quality.tiers : TIER_ORDER;
  return features[tiers[tiers.length - 1]] ?? {};
}

export function PerfProvider({
  children,
  /** 画质分级表，默认取契约 §13.1 的 QUALITY。留出 prop 是为了让自测能注入假表 */
  quality = QUALITY,
  /** 审计注册函数，默认取 devtools/auditHooks.js 的 registerSceneAuditSource */
  registerAudit = registerSceneAuditSource,
  /** 低帧自动降档总开关；设 false 则只保留手动 setTier */
  autoDowngrade = true,
  /** 低帧阈值（fps）。不传则按设备类型取：手机 28、桌面 45（§11.1 T8 的达标线手机 ≥30 / 桌面 ≥55） */
  lowFps,
}) {
  // 设备初判只做一次
  const device = useMemo(() => detectDeviceTier(), []);
  const force = useMemo(() => readForce(), []);

  const initialTier = useMemo(() => {
    if (typeof force?.tier === "string" && TIER_ORDER.includes(force.tier)) return force.tier;
    return device.tier;
  }, [device, force]);

  // tier 同时存在 ref 与 state 里：ref 供采样器在任意时刻读到**当前**值（快照要准），
  // state 供 React 重渲染。两者只在 setTier 里同步写，避免出现"审计读到旧档位"的窗口。
  const tierRef = useRef(initialTier);
  const [tier, setTierState] = useState(initialTier);
  const setTier = useCallback((next) => {
    tierRef.current = next;
    setTierState(next);
  }, []);

  // 采样器只创建一次。onLowFps 里全部走 ref，因此不依赖任何会变的闭包。
  const samplerRef = useRef(null);
  if (samplerRef.current === null) {
    samplerRef.current = createFpsSampler({
      getTier: () => tierRef.current,
      onLowFps: () => {
        if (!autoDowngrade) return false;
        const next = nextTierDown(tierRef.current);
        if (next === null) return false; // 已是最低档，返回 false 让采样器进入长冷却
        setTier(next);
        return true;
      },
      thresholds: { lowFps: lowFps ?? (device.env.mobile ? 28 : 45) },
    });
  }
  const sampler = samplerRef.current;

  // 图形能力：WebGL 同步可得，先测；不可用再异步问 WebGPU（StudioCanvas 会优先走 WebGPU）。
  // 探测中返回 null 而不是先渲染降级页，避免"闪一下不支持"。
  const [graphics, setGraphics] = useState(() => {
    const webgl = probeWebGL();
    return webgl.ok ? webgl : null;
  });

  useEffect(() => {
    if (graphics !== null) return undefined;
    let alive = true;
    probeGraphicsSupport().then((result) => {
      if (alive) setGraphics(result);
    });
    return () => {
      alive = false;
    };
  }, [graphics]);

  useEffect(() => {
    sampler.start();
    return () => sampler.stop();
  }, [sampler]);

  useEffect(() => {
    if (typeof registerAudit !== "function") return undefined;
    const unregister = registerAudit("perf", () => sampler.getSnapshot());
    return typeof unregister === "function" ? unregister : undefined;
  }, [registerAudit, sampler]);

  const features = useMemo(() => resolveFeatures(quality, tier), [quality, tier]);
  const markSceneReady = useCallback(() => sampler.markReady(), [sampler]);

  // 排障出口：不参与 §13.3 契约，仅供人工/自测在控制台核对
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__carDisplayPerf = {
      tier,
      features,
      graphics,
      device,
      snapshot: () => sampler.getSnapshot(),
      diagnostics: () => sampler.getDiagnostics(),
      setTier,
    };
    return () => {
      delete window.__carDisplayPerf;
    };
  }, [tier, features, graphics, device, sampler, setTier]);

  const value = useMemo(
    () => ({
      tier,
      setTier,
      features,
      reflector: Boolean(features.reflector),
      shadow: Boolean(features.shadow),
      sweepLight: Boolean(features.sweepLight),
      dprMax: features.dprMax,
      gridSegments: features.gridSegments,
      graphics,
      sampler,
      markSceneReady,
    }),
    [tier, setTier, features, graphics, sampler, markSceneReady],
  );

  if (graphics === null) return null;
  if (!graphics.ok) return <WebGLFallback reason={graphics.reason} />;

  return <PerfContext.Provider value={value}>{children}</PerfContext.Provider>;
}
