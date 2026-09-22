import React, { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { CAMERA_VIEWS, INTERACTION } from "../../config/carConfig";
import { useCarStore } from "../../state/useCarStore";
import { registerSceneAuditSource } from "../../devtools/auditHooks";
import { IDLE_MODES, IDLE_ROTATE_DEFAULTS, IdleAutoRotate, dampXYZ, distanceXYZ } from "./IdleAutoRotate";

// 预设 id → { position, target }（§13.1 CAMERA_VIEWS；T2 已把 T1 基线的机位数值并入契约）
const PRESETS = Object.fromEntries(CAMERA_VIEWS.map((v) => [v.id, { position: v.position, target: v.target }]));

// 与 StudioCanvas 的 `camera.fov` 初值保持一致
const BASE_FOV = 36;

/**
 * T8 集成期移动端适配：**竖屏下车模横向被裁**。
 *
 * 现象：390×844（aspect 0.462）下，垂直 fov 36° 对应的水平视角只有 **17.1°**，
 * 在 hero 机位（距注视点 10.46）的可视宽度约 **3.15 m**，而车长 **4.7 m** ⇒ 车头车尾必然出画。
 * 根因：§13.1 的预设机位是按**桌面横屏**标定的，而 three 的 `fov` 是**垂直**视角——
 * 竖屏时水平视角会随宽高比等比收窄，这是透视相机的固有行为，不是某个组件的 bug。
 *
 * 补偿策略：**只放不缩**，且 `aspect >= 1` 时两个系数恒为 1
 * ⇒ **桌面（横屏）行为与 T7 自测时逐字一致，不受本改动影响**。
 *   · 后退为主：距离 × clamp(1/aspect, 1, 1.8) —— 保持透视自然，不靠大广角硬撑；
 *   · 广角为辅：fov   × clamp(sqrt(1/aspect), 1, 1.35) —— 补足纵向构图，避免车在竖屏里显得过小。
 * 两者叠加后 390×844 的可视宽度约 7.9 m，车长 4.7 m 有充分余量。
 *
 * @param {number} aspect 视口宽高比（width / height）
 * @returns {{ distanceScale: number, fovScale: number }}
 */
export function responsiveCameraScale(aspect) {
  if (!Number.isFinite(aspect) || aspect <= 0 || aspect >= 1) return { distanceScale: 1, fovScale: 1 };
  const inverse = 1 / aspect;
  return {
    distanceScale: Math.min(1.8, Math.max(1, inverse)),
    fovScale: Math.min(1.35, Math.max(1, Math.sqrt(inverse))),
  };
}

/** 按距离系数把预设机位沿「注视点 → 机位」方向外推，方向不变、只改半径。 */
function scaledPreset(preset, distanceScale) {
  const [tx, ty, tz] = preset.target;
  const dx = (preset.position[0] - tx) * distanceScale;
  const dy = (preset.position[1] - ty) * distanceScale;
  const dz = (preset.position[2] - tz) * distanceScale;
  return { position: [tx + dx, ty + dy, tz + dz], target: preset.target };
}

/**
 * T7 · 相机机位与待机自转（roadmap §12.3 T7 / §13.1 / §13.3③）
 *
 * ① 预设：store.cameraView 变化 → 按 CAMERA_VIEWS 的 position/target 做阻尼插值（非瞬移）；
 * ② 指令：store.cameraCommand（'orbit-once' + 自增 token）→ 触发一次绕车一周并回正；
 * ③ 待机：空闲 INTERACTION.idleAutoRotateDelayMs 后缓速自转，任意指针/滚轮/按键/指令即停；
 * ④ 审计：向 §13.3 的注册式钩子贡献 autoRotating / orbiting / position / target / distance。
 *
 * 相机写权（互斥）：mode==='free' 时由本组件做预设阻尼、OrbitControls 处理用户拖拽/缩放；
 * mode 为 'auto'/'orbit' 时由 IdleAutoRotate 独占写权，本组件让出（见 IdleAutoRotate.jsx 头注释）。
 *
 * @param {boolean} [autoRotateEnabled] 待机自转总开关（默认 true；T8 联调可传 false 关闭）
 */
export function CameraRig({ autoRotateEnabled = true }) {
  const ref = useRef();
  const camera = useThree((s) => s.camera);
  const view = useCarStore((s) => s.cameraView);
  const cameraCommand = useCarStore((s) => s.cameraCommand);
  const bumpInteraction = useCarStore((s) => s.bumpInteraction);
  const setAutoRotate = useCarStore((s) => s.setAutoRotate);

  // T8 移动端适配：按视口宽高比补偿预设机位与 fov（横屏时两系数恒为 1，桌面行为不变）
  const aspect = useThree((s) => (s.size.height ? s.size.width / s.size.height : 1));
  const { distanceScale, fovScale } = responsiveCameraScale(aspect);

  const initial = scaledPreset(PRESETS.hero, distanceScale);
  const desiredPosition = useRef(new Vector3(...initial.position));
  const desiredTarget = useRef(new Vector3(...initial.target));
  const animating = useRef(false);

  // 与 IdleAutoRotate 共享的互斥模式：非 free 时本组件让出相机写权
  const modeRef = useRef(IDLE_MODES.FREE);
  const idleApi = useRef(null); // 由 IdleAutoRotate 回填 { notifyInteraction, startOrbit, debug }
  const frameCount = useRef(0); // DEV 诊断：帧循环存活计数

  // fov 随视口宽高比补偿（横屏 fovScale===1，与 T7 自测时的 36° 完全相同）
  useEffect(() => {
    camera.fov = BASE_FOV * fovScale;
    camera.updateProjectionMatrix();
  }, [camera, fovScale]);

  // 预设切换：先打断自转/环绕（互斥），再交给预设阻尼平滑到位
  // 依赖里带 distanceScale：旋屏（横↔竖）后按新宽高比重算机位
  useEffect(() => {
    const preset = scaledPreset(PRESETS[view] ?? PRESETS.hero, distanceScale);
    idleApi.current?.notifyInteraction(); // 内含 bumpInteraction()：预设指令也是用户输入
    desiredPosition.current.set(...preset.position);
    desiredTarget.current.set(...preset.target);
    animating.current = true;
  }, [view, distanceScale]);

  // 带令牌的预设下发（CHANGELOG 0011 → T8 受理落地 0019）：
  // `applyCameraView(viewId)` 既写 cameraView 又自增 token，因此**同值重复下发**（用户拖走后点「复位」）
  // 也能可靠触发一次到位。有了它，T7 原先那段"识别 zustand 空写"的兜底订阅（及其误命中面：
  // 任何同值空写如 setPart 写相同值都会把相机拉回预设）**已整段删除**——这正是 T7《挂载说明》§6
  // 所要求的「T2 落地 0010 后整段删除」。
  // 说明：`setCameraView` 保留原语义（纯赋值，只驱动上面的 view effect），未做任何改动。
  useEffect(() => {
    if (cameraCommand.type !== "view") return;
    const preset = scaledPreset(PRESETS[cameraCommand.viewId] ?? PRESETS.hero, distanceScale);
    idleApi.current?.notifyInteraction();
    desiredPosition.current.set(...preset.position);
    desiredTarget.current.set(...preset.target);
    animating.current = true;
  }, [cameraCommand, distanceScale]);

  // §13.3③：把相机审计字段注册进 window.__carDisplayCameraAudit()
  // 注：scene 级 autoRotate 无需在此注册——store.autoRotate 由本组件写入，本身即场景真实值。
  useEffect(() => {
    const offs = [
      registerSceneAuditSource("autoRotating", () => modeRef.current === IDLE_MODES.AUTO),
      registerSceneAuditSource("orbiting", () => modeRef.current === IDLE_MODES.ORBIT),
      registerSceneAuditSource("position", () => camera.position.toArray()),
      registerSceneAuditSource("target", () => ref.current?.target.toArray() ?? null),
      registerSceneAuditSource("distance", () => (ref.current ? camera.position.distanceTo(ref.current.target) : null)),
    ];
    return () => offs.forEach((off) => off());
  }, [camera]);

  // DEV 专用诊断（T7 私有，不属于 §13.3 契约）：帧循环是否存活、环绕内部进度
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const debug = () => ({ view, frames: frameCount.current, mode: modeRef.current, ...(idleApi.current?.debug?.() ?? {}) });
    globalThis.__carDisplayCameraDebug = debug;
    return () => {
      if (globalThis.__carDisplayCameraDebug === debug) delete globalThis.__carDisplayCameraDebug;
    };
  }, [view]);

  useFrame((_, delta) => {
    frameCount.current += 1;
    // 自转/环绕期间由 IdleAutoRotate 独占相机写权，避免同帧双写
    if (modeRef.current !== IDLE_MODES.FREE) return;
    if (!animating.current || !ref.current) return;
    dampXYZ(camera.position, desiredPosition.current, IDLE_ROTATE_DEFAULTS.dampLambdaPosition, delta);
    dampXYZ(ref.current.target, desiredTarget.current, IDLE_ROTATE_DEFAULTS.dampLambdaTarget, delta);
    ref.current.update();
    if (
      distanceXYZ(camera.position, desiredPosition.current) < IDLE_ROTATE_DEFAULTS.presetSettleEpsilon &&
      distanceXYZ(ref.current.target, desiredTarget.current) < IDLE_ROTATE_DEFAULTS.presetSettleEpsilon
    ) {
      camera.position.copy(desiredPosition.current);
      ref.current.target.copy(desiredTarget.current);
      ref.current.update();
      animating.current = false;
    }
  });

  return <>
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.055}
      enablePan={false}
      // minDistance 由 4.1（T1 基线值）下调到 3.4：§13.1 的 detail 预设机位距注视点 3.83，
      // 原值会让 detail 永远到不了位（OrbitControls 夹住距离，误差 0.27）。T8 联调可再调。
      // T8 移动端适配：上下限同步乘 distanceScale，否则竖屏外推后的机位（最大 18.8）会被夹住。
      minDistance={3.4 * distanceScale}
      maxDistance={13 * distanceScale}
      minPolarAngle={Math.PI * 0.22}
      maxPolarAngle={Math.PI * 0.48}
      onStart={() => { animating.current = false; }}
    />
    <IdleAutoRotate
      controlsRef={ref}
      camera={camera}
      modeRef={modeRef}
      apiRef={idleApi}
      enabled={autoRotateEnabled}
      orbitToken={cameraCommand.type === "orbit-once" ? cameraCommand.token : 0}
      idleDelayMs={INTERACTION.idleAutoRotateDelayMs}
      orbitDurationMs={INTERACTION.orbitOnceDurationMs}
      onInteraction={bumpInteraction}
      onAutoRotateChange={setAutoRotate}
    />
  </>;
}
