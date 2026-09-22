import React, { useEffect, useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { CAMERA_VIEWS, INTERACTION } from "../../config/carConfig";
import { useCarStore } from "../../state/useCarStore";
import { registerSceneAuditSource } from "../../devtools/auditHooks";
import { IDLE_MODES, IDLE_ROTATE_DEFAULTS, IdleAutoRotate, dampXYZ, distanceXYZ } from "./IdleAutoRotate";

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
// 预设 id → { position, target }（§13.1 CAMERA_VIEWS；T2 已把 T1 基线的机位数值并入契约）
const PRESETS = Object.fromEntries(CAMERA_VIEWS.map((v) => [v.id, { position: v.position, target: v.target }]));

export function CameraRig({ autoRotateEnabled = true }) {
  const ref = useRef();
  const camera = useThree((s) => s.camera);
  const view = useCarStore((s) => s.cameraView);
  const cameraCommand = useCarStore((s) => s.cameraCommand);
  const bumpInteraction = useCarStore((s) => s.bumpInteraction);
  const setAutoRotate = useCarStore((s) => s.setAutoRotate);

  const desiredPosition = useRef(new Vector3(...PRESETS.hero.position));
  const desiredTarget = useRef(new Vector3(...PRESETS.hero.target));
  const animating = useRef(false);

  // 与 IdleAutoRotate 共享的互斥模式：非 free 时本组件让出相机写权
  const modeRef = useRef(IDLE_MODES.FREE);
  const idleApi = useRef(null); // 由 IdleAutoRotate 回填 { notifyInteraction, startOrbit, debug }
  const frameCount = useRef(0); // DEV 诊断：帧循环存活计数

  // 预设切换：先打断自转/环绕（互斥），再交给预设阻尼平滑到位
  useEffect(() => {
    const preset = PRESETS[view] ?? PRESETS.hero;
    idleApi.current?.notifyInteraction(); // 内含 bumpInteraction()：预设指令也是用户输入
    desiredPosition.current.set(...preset.position);
    desiredTarget.current.set(...preset.target);
    animating.current = true;
  }, [view]);

  // 兜底：同一预设的"重复下发"（用户拖走后点「复位」）在 §13.2 里不会改变 cameraView，
  // 因此上面的 view effect 不会触发，表现为「复位没反应」。zustand 对每次 set 都会通知订阅者，
  // 这里识别"所有字段引用都没变的空写"（即 setCameraView(当前值)）补做一次预设应用，
  // 并以 mode/指针/到位三重守卫把误命中面压到最小。
  // 局限：其他同值空写（如 setPart 写入相同值）也会命中——正解是 §13.2 给预设补一个可重复触发的
  // 令牌（与 orbitOnce 的 token 同理），已按 §13.4 登记 docs/contracts/CHANGELOG.md 交 T2；
  // T2 落地后本兜底可整段删除。
  useEffect(() => {
    const unsubscribe = useCarStore.subscribe((state, prev) => {
      if (state === prev) return;
      if (Object.keys(state).some((key) => state[key] !== prev[key])) return; // 有实际变化：不是同值空写
      if (modeRef.current !== IDLE_MODES.FREE) return; // 自转/环绕期间不抢写
      if (animating.current) return; // 预设动画进行中
      if (idleApi.current?.isPointerActive?.()) return; // 用户正在拖拽
      if (distanceXYZ(camera.position, desiredPosition.current) < IDLE_ROTATE_DEFAULTS.presetSettleEpsilon) return; // 已在位
      const preset = PRESETS[state.cameraView] ?? PRESETS.hero;
      idleApi.current?.notifyInteraction();
      desiredPosition.current.set(...preset.position);
      desiredTarget.current.set(...preset.target);
      animating.current = true;
    });
    return unsubscribe;
  }, [camera]);

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
      minDistance={3.4}
      maxDistance={13}
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
