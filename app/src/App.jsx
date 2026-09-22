import React, { useEffect } from "react";
import { StudioCanvas } from "./components/scene/StudioCanvas";
import { ControlPanel } from "./components/ui/ControlPanel";
import { ToastHost } from "./components/ui/ToastHost";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { STRINGS } from "./components/ui/strings";
import { VoiceControl } from "./voice/VoiceControl.jsx";
import { PerfProvider } from "./perf/PerfProvider.jsx";
import { useDeviceTier } from "./perf/useDeviceTier.js";
import { useCarStore } from "./state/useCarStore.js";

/**
 * App.jsx —— 全应用统一组装点（roadmap §11.1 T8 任务①；Wave 1 一律不改本文件）
 *
 * 组件来源与挂载依据（各自的《挂载说明》）：
 *   · `PerfProvider`  —— T8p `perf/MOUNT.md` §1 方案 A：包住整棵界面树（不要与 main.jsx 重复包）
 *   · `StudioCanvas`  —— T3 §2：环境已在组件内换成 CockpitEnvironment；T7 §1：CameraRig 自包含挂 IdleAutoRotate
 *   · `ControlPanel`  —— T4 §2；T6 §2：`VoiceButton` 经 `voiceSlot` 落到 T4 预留的容器位（只留一个麦克风入口）
 *   · `ToastHost`     —— T4 §2
 *   · `LoadingScreen` —— T4 §2
 *
 * `SceneReadyBridge`：T8p `perf/MOUNT.md` §4 —— 首屏加载完成时通知帧率采样器开始判定，
 * 否则 22.7 MiB 的 GLB 加载期会被误判为低帧而提前降档。
 */
function SceneReadyBridge() {
  const { markSceneReady } = useDeviceTier();
  const sceneReady = useCarStore((state) => state.loading.sceneReady);
  useEffect(() => {
    if (sceneReady) markSceneReady();
  }, [sceneReady, markSceneReady]);
  return null;
}

export default function App() {
  return (
    <PerfProvider>
      <SceneReadyBridge />
      <a className="skip-link" href="#studio-controls">{STRINGS.skipLink}</a>
      <main className="app-shell">
        <StudioCanvas />
        <div className="scene-vignette" />
        <ControlPanel voiceSlot={<VoiceControl />} />
        <ToastHost />
      </main>
      <LoadingScreen onRetry={() => window.location.reload()} />
    </PerfProvider>
  );
}
