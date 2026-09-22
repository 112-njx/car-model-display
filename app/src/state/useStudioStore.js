/**
 * useStudioStore.js —— **兼容 shim（仅过渡用，勿在新代码中引用）**
 *
 * 用途：让 T1 基线的旧组件（VehicleModel / CameraRig / HeadlightRig / ControlDeck …）在
 * T3–T7 各自接线完成前仍能编译并运行。旧导出名与旧字段一律映射到新 store（§13.2）。
 * Wave 2 集成末段（§12.4 第 5 步）由 T8 与本文件一并删除。
 *
 * 单一状态源原则：partStates / headlights / tailLights / cameraView **不在这里存真值**，
 * 而是从 carStore 镜像过来（下方 subscribe）。因此控制台里
 * `carStore.getState().togglePart('window_lf')` 同样能驱动旧 UI 的部件动画。
 */

import { create } from "zustand";
import { carStore } from "./useCarStore.js";

// 旧 part key（T1 基线 studioConfig.VEHICLES.tesla.parts）→ 新逻辑 id（§13.1）
const LEGACY_PART_IDS = {
  leftDoor: "door_lf",
  rearLeftDoor: "door_lr",
  rightDoor: "door_rf",
  rearRightDoor: "door_rr",
  leftWindow: "window_lf",
  rearLeftWindow: "window_lr",
  rightWindow: "window_rf",
  rearRightWindow: "window_rr",
  hood: "frunk",
  trunk: "trunk",
};

const toLegacyPartStates = (parts) =>
  Object.fromEntries(Object.entries(LEGACY_PART_IDS).map(([legacyKey, id]) => [legacyKey, Boolean(parts?.[id])]));

const toLegacyLights = (lights) => ({
  headlights: Boolean(lights?.headlight),
  tailLights: Boolean(lights?.taillight),
});

const sameRecord = (a, b) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};

const warn = (message) => {
  if (import.meta.env.DEV) console.warn(`[useStudioStore shim] ${message}`);
};

export const useStudioStore = create((set, get) => ({
  // ── 镜像字段：真值在 carStore，这里只读 ──
  partStates: toLegacyPartStates(carStore.getState().parts),
  ...toLegacyLights(carStore.getState().lights),
  cameraView: carStore.getState().cameraView,

  // ── 映射到 carStore 的旧动作（shim 即旧 UI 的输入层，故代为 bumpInteraction）──
  togglePart: (legacyKey) => {
    const id = LEGACY_PART_IDS[legacyKey];
    if (!id) return warn(`togglePart 收到未映射的旧部件 key：「${legacyKey}」`);
    carStore.getState().bumpInteraction();
    carStore.getState().togglePart(id);
  },
  closeAllParts: () => {
    carStore.getState().bumpInteraction();
    carStore.getState().closeAll();
  },
  toggleHeadlights: () => {
    carStore.getState().bumpInteraction();
    carStore.getState().toggleLight("headlight");
  },
  toggleTailLights: () => {
    carStore.getState().bumpInteraction();
    carStore.getState().toggleLight("taillight");
  },
  setCameraView: (view) => {
    carStore.getState().bumpInteraction();
    carStore.getState().setCameraView(view);
  },

  // ── 过渡期本地字段：新契约已移除（paint/wheel/studio/多车型/配置器 UI），
  //    仅供旧组件在接线完成前运行，真值不入新 store，接线完成后随本文件删除 ──
  vehicle: "tesla",
  pendingVehicle: null,
  vehicleLoadError: null,
  paint: "ivory",
  finish: 12,
  wheel: "turbine",
  studio: "noir",
  panelOpen: true,
  infoOpen: false,
  renderer: null,
  initialSceneReady: false,
  initialAssetProgress: 0,
  initialAssetLoadedBytes: 0,
  initialAssetTotalBytes: 0,
  setPaint: (paint) => set({ paint }),
  setFinish: (finish) => set({ finish }),
  setWheel: (wheel) => set({ wheel }),
  setStudio: (studio) => set({ studio }),
  requestVehicle: (vehicle) => {
    if (vehicle === get().vehicle || vehicle === get().pendingVehicle) return;
    set({ pendingVehicle: vehicle, vehicleLoadError: null });
  },
  completeVehicleLoad: (vehicle) => {
    if (get().pendingVehicle !== vehicle) return;
    // 部件与相机状态自 T2 起归 carStore 所有，此处不再重置（旧行为见 T1 基线）
    set({ vehicle, pendingVehicle: null, vehicleLoadError: null });
  },
  failVehicleLoad: (vehicle, message) => {
    if (get().pendingVehicle !== vehicle) return;
    set({ pendingVehicle: null, vehicleLoadError: { vehicle, message } });
  },
  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
  openInfo: () => set({ infoOpen: true }),
  closeInfo: () => set({ infoOpen: false }),
  setRenderer: (renderer) => set({ renderer }),
  setInitialSceneReady: () => set({ initialSceneReady: true }),
  setInitialAssetTransfer: ({ loadedBytes, totalBytes, progress }) =>
    set({ initialAssetLoadedBytes: loadedBytes, initialAssetTotalBytes: totalBytes, initialAssetProgress: progress }),
  capture: () => {
    const renderer = get().renderer;
    if (!renderer) return;
    const link = document.createElement("a");
    link.download = `formdrive-${get().vehicle}-${get().paint}.png`;
    link.href = renderer.domElement.toDataURL("image/png");
    link.click();
  },
}));

// carStore → shim 单向镜像（无回环：shim 的 setState 不会再写回 carStore）
carStore.subscribe((state) => {
  const current = useStudioStore.getState();
  const patch = {};
  const partStates = toLegacyPartStates(state.parts);
  if (!sameRecord(partStates, current.partStates)) patch.partStates = partStates;
  const lights = toLegacyLights(state.lights);
  if (lights.headlights !== current.headlights) patch.headlights = lights.headlights;
  if (lights.tailLights !== current.tailLights) patch.tailLights = lights.tailLights;
  if (state.cameraView !== current.cameraView) patch.cameraView = state.cameraView;
  if (Object.keys(patch).length > 0) useStudioStore.setState(patch);
});
