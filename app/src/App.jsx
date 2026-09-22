import React from "react";
import { StudioCanvas } from "./components/scene/StudioCanvas";
import { Navigation } from "./components/ui/Navigation";
import { HeroCopy } from "./components/ui/HeroCopy";
import { ControlDeck } from "./components/ui/ControlDeck";
import { CameraControls } from "./components/ui/CameraControls";
import { InfoDialog } from "./components/ui/InfoDialog";
import { InitialLoadingScreen } from "./components/ui/InitialLoadingScreen";

// T1: 临时摘除 <VehicleSelector />（单车型固化）。组件文件保留，统一组装归 T8。
export default function App() { return <><a className="skip-link" href="#studio-controls">Skip to controls</a><main className="app-shell"><StudioCanvas /><div className="scene-vignette" /><Navigation /><HeroCopy /><ControlDeck /><CameraControls /><p className="gesture-hint">Drag — orbit · Scroll — zoom</p></main><InfoDialog /><InitialLoadingScreen /></>; }
