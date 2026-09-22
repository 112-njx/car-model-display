import React from "react";
import { StudioCanvas } from "./components/scene/StudioCanvas";
import { ControlPanel } from "./components/ui/ControlPanel";
import { ToastHost } from "./components/ui/ToastHost";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { STRINGS } from "./components/ui/strings";

// T4（B 段）：移除 7 个配置器组件（ControlDeck / Navigation / HeroCopy / InfoDialog /
// VehicleSelector / CameraControls / InitialLoadingScreen），改挂中文中控界面。
// 经人工裁定采用「删组件 + 最小 App.jsx 改动」：除下列 import 与挂载点外，本文件其余结构
// 与 T1 基线一致，App 的统一组装权仍在 T8（见 docs/t4-ui-mount-guide.md）。
export default function App() {
  return (
    <>
      <a className="skip-link" href="#studio-controls">{STRINGS.skipLink}</a>
      <main className="app-shell">
        <StudioCanvas />
        <div className="scene-vignette" />
        <ControlPanel />
        <ToastHost />
      </main>
      <LoadingScreen onRetry={() => window.location.reload()} />
    </>
  );
}
