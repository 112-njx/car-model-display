/**
 * StudioCanvas.jsx —— 三维场景宿主（T8 集成组装）
 *
 * T8 相对 T1 基线的改动（全部是接线，不含视觉/交互逻辑）：
 *   ① 环境由 `StudioEnvironment`（摄影棚，T3 已废弃）换成 `CockpitEnvironment`（中控大屏风格）；
 *      并按 T3《挂载说明》§3 把 T8p 的档位 features 经 `qualityFeatures` prop 传入。
 *   ② `dpr` 上限与 `shadows` 改由 T8p 的 `useDeviceTier()` 提供（低配设备降 dpr、关阴影）。
 *   ③ 移除 `VehicleAssetLoader`：它是多车型配置器的"预载下一台车"组件，单车固化后 `pendingVehicle`
 *      恒为 null、永远渲染 null，属死代码，随单车型裁剪一并删除。
 *   ④ 不再经兼容 shim 写 `renderer`（旧 `capture()` 截图入口已随 T4 的配置器 UI 移除）；
 *      `document.documentElement.dataset.renderer` 保留——T9 的脚本与排障靠它判后端。
 *
 * 注意：本组件必须在 `<PerfProvider>` 内部渲染（`useDeviceTier()` 在 Provider 外会抛错）。
 */

import React, { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { ACESFilmicToneMapping, SRGBColorSpace, WebGLRenderer } from "three";
import { CameraRig } from "./CameraRig";
import { CockpitEnvironment } from "./CockpitEnvironment";
import { HeadlightRig } from "./HeadlightRig";
import { VehicleModel } from "./VehicleModel";
import { useDeviceTier } from "../../perf/useDeviceTier";

export function StudioCanvas() {
  const { dprMax, shadow, features } = useDeviceTier();

  // ── T8 集成期决策（人工裁定）：**强制 WebGL**，去掉 WebGPU 优先分支 ──
  //
  // 实测依据（详见 docs/debug.md 记录 T8-03 / 人工配置区 #27）：
  //   · 同一套 `verify-parts` 78 项：**WebGPU 68 PASS / 10 FAIL**（12 条未捕获异常
  //     `TypeError: Invalid value used as weak map key`，栈落在 three 的 `WebGPURenderer`
  //     → `Textures.updateTexture` → `WeakMap.set`）；**WebGL 74 PASS / 4 FAIL，异常 0 条**。
  //   · 该异常抛在渲染调用内部，会**打死 R3F 的帧循环**，表现为部件动画卡在中途、整页失响应
  //     （T1/T4/T7 三方独立复现，且未改动的基线上同样出现 ⇒ 非本项目引入，属 three WebGPU 后端既有问题）。
  //   · 录屏与手机演示对"画面突然卡死"的容忍度为零，故以稳定性优先。
  //
  // 代价与边界：放弃 WebGPU 的性能上限。`navigator.gpu` 存在但 WebGL 不可用的设备
  // （实践上不存在）会落到 T8p 的降级页——`graphicsSupport` 的判定条件是"WebGL 与 WebGPU 都不可用"，
  // 保持原样即可覆盖该情形。
  const createRenderer = (props) => {
    const renderer = new WebGLRenderer({
      ...props,
      antialias: true,
      preserveDrawingBuffer: true,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    return renderer;
  };

  return (
    <div className="scene" aria-label="可交互的三维车模展示">
      <Canvas
        shadows={shadow}
        dpr={[1, dprMax]}
        camera={{ fov: 36, near: 0.1, far: 120, position: [6.8, 3.1, 7.6] }}
        gl={createRenderer}
        onCreated={({ gl }) => {
          document.documentElement.dataset.renderer = gl.isWebGPURenderer ? "webgpu" : "webgl";
        }}
      >
        <Suspense fallback={null}>
          <CockpitEnvironment qualityFeatures={features} />
          <VehicleModel />
          <HeadlightRig />
        </Suspense>
        <CameraRig />
      </Canvas>
    </div>
  );
}
