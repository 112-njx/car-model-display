/**
 * studioConfig.js —— **legacy 配置（仅过渡用）**
 *
 * T2 起车辆契约以 config/carConfig.js 为准（§13.1）：部件 / 灯光 / 相机 / 交互阈值 / 质量分级
 * 一律从 carConfig 读取。本文件被 T1 基线的旧组件（VehicleModel / CameraRig / HeadlightRig /
 * StudioEnvironment / ControlDeck / CameraControls / HeroCopy / InfoDialog / VehicleSelector）
 * 引用，T2 按文件边界（§12.2）不跨文件接线，故原样保留以保证工程全程可编译。
 *
 * 迁移去向（由各归属 Agent 在其分支内完成，T2 不代做）：
 *   VEHICLES.tesla.parts  → carConfig.PARTS（逻辑 id + 运动学参数）
 *   VEHICLES.tesla.url / rotation / groundOffset → carConfig.MODEL_URL / MODEL_TRANSFORM
 *   VEHICLES.tesla.*Names → carConfig.MODEL_MATERIALS
 *   CAMERAS               → carConfig.CAMERA_VIEWS（含 position/target）
 *   PAINTS / WHEELS / STUDIOS / HEADLIGHT_RIGS → 新契约未收录（配置器属性已裁剪，§3.2）；
 *     若 T3/T4/T5 仍需要，登记 docs/contracts/CHANGELOG.md 申请迁入 carConfig，勿各自复制。
 */

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

export const PAINTS = {
  obsidian: { label: "Obsidian", color: "#171615", metalness: 0.78 },
  silver: { label: "Liquid silver", color: "#b9bbb6", metalness: 0.92 },
  copper: { label: "Burgundy", color: "#651f2a", metalness: 0.58 },
  ivory: { label: "Ivory", color: "#e5dcc4", metalness: 0.55 },
  blue: { label: "Midnight blue", color: "#102b54", metalness: 0.76 },
};

// T1: 单车型固化 —— 仅保留 Tesla Model 3 2018（mustang / concept 资产已移除）
export const VEHICLES = {
  tesla: {
    eyebrow: "TESLA MODEL 3", year: "2018", label: "Model 3", note: "Electric sedan", thumbnail: assetUrl("models/tesla-preview.jpg"),
    url: assetUrl("models/tesla-model-3-2018.glb"), rotation: [0, Math.PI, 0], groundOffset: -0.025,
    parts: {
      leftDoor: { label: "Front left", exact: "door_lf_dummy", axis: "z", angle: -1.08 },
      rearLeftDoor: { label: "Rear left", exact: "door_lr_dummy", axis: "z", angle: -1.02 },
      rightDoor: { label: "Front right", exact: "door_rf_dummy", axis: "z", angle: 1.08 },
      rearRightDoor: { label: "Rear right", exact: "door_rr_dummy", axis: "z", angle: 1.02 },
      leftWindow: { label: "Front L glass", exact: "door_lf_glass0_0", motion: "slide", travel: 0.31 },
      rearLeftWindow: { label: "Rear L glass", exact: "door_lr_glass0_0", motion: "slide", travel: 0.27 },
      rightWindow: { label: "Front R glass", exact: "door_rf_glass0_0", motion: "slide", travel: 0.31 },
      rearRightWindow: { label: "Rear R glass", exact: "door_rr_glass0_0", motion: "slide", travel: 0.27 },
      hood: { label: "Front trunk", exact: "bonnet_dummy", axis: "x", angle: 0.58 },
      trunk: { label: "Rear trunk", exact: "boot_dummy", axis: "x", angle: -0.82 },
    },
    paintNames: ["primary", "paint_black", "putih_putih0_0", "putih002_putih0_0"], rimNames: ["wheels"], lightNames: ["right_front_light", "left_front_light", "foglight_r", "foglight_l"], tailLightNames: ["right_rear_light", "left_rear_light", "breaklight_l"],
  },
};

export const STUDIOS = {
  dusk: { label: "Dusk", note: "Warm daylight", background: "#50433a", floor: "#786b5e", key: "#ffd1a1", fill: "#c7d7ff", exposure: 1.08 },
  gallery: { label: "Gallery", note: "Bright soft white", background: "#454c51", floor: "#77736d", key: "#fff4df", fill: "#dae7ff", exposure: 1.04 },
  noir: { label: "Noir", note: "Crisp contrast", background: "#292a2b", floor: "#4d4c49", key: "#ffc5a4", fill: "#a5b9dd", exposure: 0.96 },
};

export const CAMERAS = {
  hero: { label: "Studio", position: [6.8, 3.1, 7.6], target: [0, 0.78, 0] },
  front: { label: "Front", position: [0.2, 1.8, 8.8], target: [0, 0.75, 0] },
  profile: { label: "Profile", position: [7.9, 1.55, 0.2], target: [0.5, 0.72, 0] },
  detail: { label: "Detail", position: [2.4, 1.75, 3.2], target: [0.5, 0.85, 0] },
};

export const WHEELS = {
  turbine: { label: "Turbine 21", note: "Smoked alloy", color: "#6f706d", roughness: 0.17 },
  monoblock: { label: "Mono 20", note: "Pure metal", color: "#b7b8b5", roughness: 0.1 },
  carbon: { label: "Carbon 22", note: "Carbon black", color: "#171817", roughness: 0.32 },
};

export const HEADLIGHT_RIGS = {
  tesla: { left: [-0.72, 0.72, 2.55], right: [0.72, 0.72, 2.55], leftTarget: [-0.96, -0.06, 10], rightTarget: [0.96, -0.06, 10], intensity: 90 },
};
