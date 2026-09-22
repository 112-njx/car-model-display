/**
 * carConfig.js —— 车辆契约配置（Wave 1 冻结契约，规格来源：docs/roadmap.md §13.1）
 *
 * 权威性：GLB 实测节点名 > §13.1 规格。本文件的 node 取值以 T1 基线的浏览器实测为准
 * （T1 debug.md 记录 03：CDP 实测 10/10 部件 resolved），与规格不符时以实测为准并记 CHANGELOG。
 *
 * 纪律：本文件由 T2 独占；其余 Agent 只读。需要新字段请登记 docs/contracts/CHANGELOG.md
 * （只增不改），涉及既有语义变更的升级到人（S1 复议）。消费方一律通过 `id` 引用部件，
 * 绝不硬编码 `node`。
 *
 * 只读约定：全部为具名导出（无默认导出）。请勿在运行时改写这些对象/数组。
 */

const assetUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;

// ─────────────────────────────────────────────────────────────
// §13.1 冻结字段
// ─────────────────────────────────────────────────────────────

export const CAR_ID = "tesla-model-3-2018";
export const CAR_NAME = "Tesla Model 3";

// ── 部件分组：UI 分组渲染与 openGroup/closeGroup 的依据 ──
export const PART_GROUPS = [
  { id: "windows", label: "车窗", order: 1 },
  { id: "doors", label: "车门", order: 2 },
  { id: "closures", label: "前/后备箱", order: 3 },
];

// ── 可开合部件：id 即 store 的键，也是审计钩子与脚本的键 ──
//    node：GLB 实测节点名（T1 实测，VehicleModel.resolvePivot 精确匹配 + 归一化兜底）
//    增补字段（T2，见 CHANGELOG 0002）：motion/axis/angle/travel —— 部件运动学参数，
//    供 T5 重写 VehicleModel 时直接消费，取值与 T1 基线 studioConfig 完全一致（零行为变化）。
//      motion: 'hinge'（绕轴旋转，读 axis+angle）| 'slide'（沿 Y 轴下滑，读 travel）
//      axis:   'x' | 'y' | 'z'，铰链旋转轴
//      angle:  开启角度（弧度，带符号）
//      travel: 滑移距离（米，模型归一化前的局部单位，与 T1 基线同口径）
export const PARTS = [
  { id: "window_lf", group: "windows", label: "左前车窗", node: "door_lf_glass0_0", aliases: ["左前窗", "左前玻璃", "主驾车窗"], motion: "slide", travel: 0.31 },
  { id: "window_rf", group: "windows", label: "右前车窗", node: "door_rf_glass0_0", aliases: ["右前窗", "副驾车窗"], motion: "slide", travel: 0.31 },
  { id: "window_lr", group: "windows", label: "左后车窗", node: "door_lr_glass0_0", aliases: ["左后窗"], motion: "slide", travel: 0.27 },
  { id: "window_rr", group: "windows", label: "右后车窗", node: "door_rr_glass0_0", aliases: ["右后窗"], motion: "slide", travel: 0.27 },
  { id: "door_lf", group: "doors", label: "左前门", node: "door_lf_dummy", aliases: ["左前车门", "主驾门"], motion: "hinge", axis: "z", angle: -1.08 },
  { id: "door_rf", group: "doors", label: "右前门", node: "door_rf_dummy", aliases: ["右前车门", "副驾门"], motion: "hinge", axis: "z", angle: 1.08 },
  { id: "door_lr", group: "doors", label: "左后门", node: "door_lr_dummy", aliases: ["左后车门"], motion: "hinge", axis: "z", angle: -1.02 },
  { id: "door_rr", group: "doors", label: "右后门", node: "door_rr_dummy", aliases: ["右后车门"], motion: "hinge", axis: "z", angle: 1.02 },
  { id: "frunk", group: "closures", label: "前备箱", node: "bonnet_dummy", aliases: ["前舱", "引擎盖", "前机盖"], motion: "hinge", axis: "x", angle: 0.58 },
  { id: "trunk", group: "closures", label: "后备箱", node: "boot_dummy", aliases: ["尾箱", "后尾门"], motion: "hinge", axis: "x", angle: -0.82 },
];

// ── 灯光：布尔开关，与 PARTS 分离（无开合动画） ──
export const LIGHTS = [
  { id: "headlight", label: "大灯", aliases: ["车灯", "前灯", "远光", "近光"] },
  { id: "taillight", label: "尾灯", aliases: ["后灯", "刹车灯"] },
];

// ── 相机预设 ──
//    增补字段（T2，见 CHANGELOG 0003）：position/target —— 预设机位与注视点（世界坐标），
//    取自 T1 基线 studioConfig.CAMERAS 的同名预设（id 一致：hero/front/profile/detail），
//    供 T7 重写 CameraRig 时直接消费（零行为变化）。
export const CAMERA_VIEWS = [
  { id: "hero", label: "复位", order: 0, position: [6.8, 3.1, 7.6], target: [0, 0.78, 0] },
  { id: "front", label: "正面", order: 1, position: [0.2, 1.8, 8.8], target: [0, 0.75, 0] },
  { id: "profile", label: "侧面", order: 2, position: [7.9, 1.55, 0.2], target: [0.5, 0.72, 0] },
  { id: "detail", label: "细节", order: 3, position: [2.4, 1.75, 3.2], target: [0.5, 0.85, 0] },
];

// ── 交互阈值：T5 与 T7 共同读取，T8 联调时统一调参 ──
export const INTERACTION = {
  tapMaxMovePx: 6, // pointerdown→up 位移超过此值判为拖拽，不触发点击
  tapMaxDurationMs: 300, // 超过此值判为长按，不触发点击
  hitPaddingRatio: 0.02, // 命中包围盒外扩比例（薄玻璃命中容差）
  hoverHighlight: true,
  idleAutoRotateDelayMs: 8000, // 待机自转启动延时（T7 读）
  orbitOnceDurationMs: 6000, // "转一下"环绕一周时长（T7 读）
};

// ── 质量分级：T8p 判档并写入，T3/T8 消费 ──
export const QUALITY = {
  tiers: ["high", "mid", "low"],
  features: {
    high: { reflector: true, shadow: true, sweepLight: true, dprMax: 2, gridSegments: 96 },
    mid: { reflector: true, shadow: true, sweepLight: false, dprMax: 1.5, gridSegments: 64 },
    low: { reflector: false, shadow: false, sweepLight: false, dprMax: 1, gridSegments: 32 },
  },
};

// ─────────────────────────────────────────────────────────────
// T2 增补字段（非 §13.1 冻结字段；只增不改，逐条记 docs/contracts/CHANGELOG.md）
//
// 动机：§12.2 把 config/** 划给 T2 独占，T3/T4/T5/T7 只读。以下常量原本散落在
// legacy studioConfig.js 的 VEHICLES.tesla 里，若各 Agent 各自复制就会造成
// "同一模型事实多处硬编码"的契约漂移（§13.1 明确警告不得硬编码 node）。
// 故在契约里给出唯一来源；数值与 T1 基线逐项一致，零行为变化。
// ─────────────────────────────────────────────────────────────

// 车模资产与摆放（T5 的 VehicleModel 消费；对应 legacy VEHICLES.tesla.url/rotation/groundOffset）
export const MODEL_URL = assetUrl("models/tesla-model-3-2018.glb");
export const MODEL_TRANSFORM = {
  rotation: [0, Math.PI, 0],
  groundOffset: -0.025,
};

// 车模材质识别名（子串匹配，小写；T5 的 VehicleModel、T3 的 HeadlightRig 消费）
// 对应 legacy VEHICLES.tesla 的 paintNames / rimNames / lightNames / tailLightNames
export const MODEL_MATERIALS = {
  paint: ["primary", "paint_black", "putih_putih0_0", "putih002_putih0_0"],
  rims: ["wheels"],
  headlights: ["right_front_light", "left_front_light", "foglight_r", "foglight_l"],
  taillights: ["right_rear_light", "left_rear_light", "breaklight_l"],
};

// 车身固定外观（T8 增补，见 docs/contracts/CHANGELOG.md 0014）
// §3.2 已裁掉涂装/轮毂配置器，故外观不再由用户选择，固化为契约常量。
// 取值 = T1 基线 legacy studioConfig 的默认值 PAINTS.ivory / finish:12 / WHEELS.turbine，
// **零行为变化**；用途是让 T5 的 VehicleModel 在兼容 shim 删除后仍有唯一来源。
export const APPEARANCE = {
  paint: { color: "#e5dcc4", metalness: 0.55 },
  finish: 12,
  wheel: { color: "#6f706d", roughness: 0.17 },
};
