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

  const createRenderer = async (props) => {
    const options = { ...props, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" };
    let renderer;
    if (navigator.gpu) {
      try {
        const { WebGPURenderer } = await import("three/webgpu");
        renderer = new WebGPURenderer(options);
        await renderer.init();
      } catch {
        renderer = new WebGLRenderer(options);
      }
    } else {
      renderer = new WebGLRenderer(options);
    }
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
