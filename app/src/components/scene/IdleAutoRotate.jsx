import { useCallback, useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";

/**
 * T7 · 待机自转与指令环绕（roadmap §12.3 T7 / §13.1 INTERACTION / §13.3 CameraAudit）
 *
 * 职责：空闲定时器 → 缓速自转；cameraCommand='orbit-once' → 绕车一周回正；
 *       自转 / 环绕 / 用户拖拽三者互斥。本组件不渲染任何可见内容（return null），
 *       由 CameraRig 自包含挂载，因此 T8 无需为 T7 改 App.jsx。
 *
 * 分层：① 纯函数层（无 React / 无 store / 无 three，可在任意上下文断言）
 *       ② 状态机与帧循环（自转/环绕期间独占相机写权）
 *
 * 相机写权归属（互斥的唯一实现手段）：
 *   mode === 'free'  → OrbitControls 与 CameraRig 的预设阻尼负责（用户拖拽/缩放正常）
 *   mode === 'auto'  → 本组件独占写相机位置
 *   mode === 'orbit' → 本组件独占写相机位置
 * 模式经共享的 modeRef 暴露给 CameraRig，后者在非 free 时跳过预设阻尼，避免同帧双写。
 */

// ─────────────────────────────────────────────────────────────
// 默认参数：与 §13.1 INTERACTION 的冻结值一致。
// A 段以此独立自测；B 段由 carConfig.INTERACTION 覆盖（此处保留为兜底）。
// ─────────────────────────────────────────────────────────────
export const IDLE_ROTATE_DEFAULTS = {
  idleAutoRotateDelayMs: 8000, // §13.1 idleAutoRotateDelayMs
  orbitOnceDurationMs: 6000,   // §13.1 orbitOnceDurationMs
  autoRotateSpeed: 0.16,       // rad/s ≈ 39s 一周（"缓速"，约为 OrbitControls autoRotateSpeed=2 的 0.77 倍）
  autoRotateRampLambda: 1.6,   // 自转起步的阻尼系数（约 1.5s 加速到速，避免"猛地一转"）
  dampLambdaPosition: 4.8,     // 预设位移阻尼（与 T1 基线 CameraRig 同值）
  dampLambdaTarget: 5.2,       // 预设注视点阻尼（与基线同值）
  presetSettleEpsilon: 0.006,  // 预设到位阈值（与基线同值）
  maxFrameDelta: 0.1,          // 单帧步长上限：切后台回来时避免角度跳变
};

/** 互斥状态机的三个模式 */
export const IDLE_MODES = { FREE: "free", AUTO: "auto", ORBIT: "orbit" };

/** orbit-once 的扫掠角：整整一周（回正 = 回到触发时的方位角） */
export const ORBIT_SWEEP_RAD = Math.PI * 2;

// ─────────────────────────────────────────────────────────────
// ① 纯函数层
// ─────────────────────────────────────────────────────────────

export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** 指数阻尼：与 three 的 MathUtils.damp 同式（帧率无关的趋近） */
export function damp(current, target, lambda, delta) {
  return current + (target - current) * (1 - Math.exp(-lambda * delta));
}

/** 平滑缓动（smoothstep）：orbit-once 的"damp 曲线"——两端角速度为 0，起步/收尾都不生硬 */
export function orbitEase(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** orbit-once 在进度 p 处的方位角（从 startAzimuth 扫过 sweepRad 后精确回正） */
export function orbitAzimuthAt(startAzimuth, p, sweepRad = ORBIT_SWEEP_RAD) {
  return startAzimuth + sweepRad * orbitEase(p);
}

/**
 * 分量读写：three.Vector3 用 .x/.y/.z，数组用下标。
 * 注意：three.Vector3 **不支持** 下标访问（v[0] 为 undefined），因此不能混用，
 * 否则会读出 undefined（→ NaN 相机坐标）或把分量写到 `"0"` 这种野属性上（→ 阻尼失效）。
 */
const isVec3 = (v) => typeof v?.x === "number";
export const readXYZ = (v) => (isVec3(v) ? [v.x, v.y, v.z] : [v[0], v[1], v[2]]);
export const writeXYZ = (v, x, y, z) => {
  if (isVec3(v)) { v.x = x; v.y = y; v.z = z; } else { v[0] = x; v[1] = y; v[2] = z; }
};

/** 以 target 为原点解算相机球坐标（three 的 Spherical 约定） */
export function sphericalOf(position, target) {
  const [px, py, pz] = readXYZ(position);
  const [tx, ty, tz] = readXYZ(target);
  const dx = px - tx;
  const dy = py - ty;
  const dz = pz - tz;
  const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return {
    radius,
    polar: radius === 0 ? 0 : Math.acos(clamp(dy / radius, -1, 1)),
    azimuth: Math.atan2(dx, dz),
  };
}

/** 球坐标 → 位置（sphericalOf 的逆运算），返回 [x,y,z] */
export function positionOf(azimuth, polar, radius, target) {
  const [tx, ty, tz] = readXYZ(target);
  const sinPolar = Math.sin(polar);
  return [
    tx + radius * sinPolar * Math.sin(azimuth),
    ty + radius * Math.cos(polar),
    tz + radius * sinPolar * Math.cos(azimuth),
  ];
}

/** 逐分量阻尼推进一组姿态（current 被就地改写，兼容 Vector3 / 数组） */
export function dampXYZ(current, desired, lambda, delta) {
  const [cx, cy, cz] = readXYZ(current);
  const [dx, dy, dz] = readXYZ(desired);
  writeXYZ(current, damp(cx, dx, lambda, delta), damp(cy, dy, lambda, delta), damp(cz, dz, lambda, delta));
}

/** 两点距离（用于预设到位判定） */
export function distanceXYZ(a, b) {
  const [ax, ay, az] = readXYZ(a);
  const [bx, by, bz] = readXYZ(b);
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2);
}

/** 空闲判定：距上次交互是否已超过阈值 */
export function isIdleElapsed(now, lastInteractionAt, delayMs) {
  return now - lastInteractionAt >= delayMs;
}

// ─────────────────────────────────────────────────────────────
// ② 状态机与帧循环
// ─────────────────────────────────────────────────────────────

/**
 * @param {object}   props
 * @param {object}   props.controlsRef    OrbitControls 实例 ref（读 target / 交还控制权）
 * @param {object}   props.camera         three 相机（useThree((s) => s.camera)）
 * @param {object}   props.modeRef        与 CameraRig 共享的模式对象（.current ∈ IDLE_MODES）
 * @param {object}   [props.apiRef]       回填 { notifyInteraction, startOrbit }，供 CameraRig 调用
 * @param {number}   [props.orbitToken]   自增令牌：值变化即触发一次 orbit-once（0 = 无命令）
 * @param {boolean}  [props.enabled]      总开关（默认 true：待机自转默认生效）
 * @param {number}   [props.idleDelayMs]  待机延时（§13.1）
 * @param {number}   [props.orbitDurationMs] 环绕时长（§13.1）
 * @param {number}   [props.speed]        自转角速度 rad/s
 * @param {Function} [props.onInteraction]   任意用户输入时回调（B 段接 store.bumpInteraction）
 * @param {Function} [props.onAutoRotateChange] (bool) 自转开始/停止（B 段接 store.setAutoRotate）
 * @param {Function} [props.onOrbitChange]      (bool) 环绕开始/结束（B 段供 CameraAudit.orbiting）
 * @param {Function} [props.onModeChange]       (mode) 模式变化（审计/调试用）
 */
export function IdleAutoRotate({
  controlsRef,
  camera,
  modeRef,
  apiRef,
  orbitToken = 0,
  enabled = true,
  idleDelayMs = IDLE_ROTATE_DEFAULTS.idleAutoRotateDelayMs,
  orbitDurationMs = IDLE_ROTATE_DEFAULTS.orbitOnceDurationMs,
  speed = IDLE_ROTATE_DEFAULTS.autoRotateSpeed,
  onInteraction,
  onAutoRotateChange,
  onOrbitChange,
  onModeChange,
}) {
  // 帧循环只读 ref：避免闭包过期与每帧重渲染
  const lastInteractionAtRef = useRef(Date.now());
  const pointerActiveRef = useRef(false); // 指针按下期间不进入自转（避免与用户拖拽抢写相机）
  const rampRef = useRef(0);
  const orbitRef = useRef(null); // { startAzimuth, polar, radius, target:[x,y,z], elapsed }
  const lastTokenRef = useRef(orbitToken);

  // 回调经 ref 间接调用：既保证监听器只注册一次，又保证回调永远是最新的
  const cbRef = useRef({});
  cbRef.current = { onInteraction, onAutoRotateChange, onOrbitChange, onModeChange };

  const setMode = useCallback(
    (mode) => {
      if (modeRef.current === mode) return;
      modeRef.current = mode;
      cbRef.current.onModeChange?.(mode);
    },
    [modeRef],
  );

  /** 退出自转（互斥：任何输入 / 环绕指令都会先走这里） */
  const exitAuto = useCallback(() => {
    if (modeRef.current !== IDLE_MODES.AUTO) return;
    rampRef.current = 0;
    cbRef.current.onAutoRotateChange?.(false);
  }, [modeRef]);

  /** 任意用户输入（指针/滚轮/按键/语音/按钮）→ 立即停转 + 重置空闲计时 */
  const notifyInteraction = useCallback(() => {
    lastInteractionAtRef.current = Date.now();
    const mode = modeRef.current;
    if (mode === IDLE_MODES.AUTO) exitAuto();
    if (mode === IDLE_MODES.ORBIT) {
      orbitRef.current = null; // 环绕被用户打断，立即交还控制权（不回正，从当前角度继续）
      cbRef.current.onOrbitChange?.(false);
    }
    setMode(IDLE_MODES.FREE);
    cbRef.current.onInteraction?.();
  }, [exitAuto, modeRef, setMode]);

  /** 进入自转 */
  const enterAuto = useCallback(() => {
    rampRef.current = 0;
    setMode(IDLE_MODES.AUTO);
    cbRef.current.onAutoRotateChange?.(true);
  }, [setMode]);

  /** 启动一次 orbit-once：从当前方位角出发，扫掠一周后精确回正 */
  const startOrbit = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls || !camera) return;
    const target = readXYZ(controls.target);
    const { azimuth, polar, radius } = sphericalOf(camera.position, target);
    if (!Number.isFinite(azimuth) || !Number.isFinite(polar) || !Number.isFinite(radius) || radius === 0) return;
    // 半径与极角取触发瞬间的值：回正只回方位角，不重置用户此前的缩放/俯仰
    orbitRef.current = { startAzimuth: azimuth, polar, radius, target, elapsed: 0 };
    exitAuto(); // 互斥：环绕优先于自转
    setMode(IDLE_MODES.ORBIT);
    cbRef.current.onOrbitChange?.(true);
    lastInteractionAtRef.current = Date.now();
    cbRef.current.onInteraction?.();
  }, [camera, controlsRef, exitAuto, setMode]);

  /** 环绕收尾：交还控制权（位置已精确回正） */
  const finishOrbit = useCallback(() => {
    orbitRef.current = null;
    cbRef.current.onOrbitChange?.(false);
    setMode(IDLE_MODES.FREE);
    lastInteractionAtRef.current = Date.now();
  }, [setMode]);

  /** 写入相机姿态；出现非有限值即拒绝写入并自愈（NaN 会污染投影矩阵，进而让渲染器报错） */
  const writePose = useCallback((x, y, z) => {
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return false;
    camera.position.set(x, y, z);
    camera.lookAt(controlsRef.current.target); // 只传 Vector3：three 的 lookAt 不接受数组
    return true;
  }, [camera, controlsRef]);

  // 把控制权 API 暴露给 CameraRig（预设切换需要先打断自转/环绕）
  useEffect(() => {
    if (!apiRef) return undefined;
    apiRef.current = {
      notifyInteraction,
      startOrbit,
      // 指针是否按下中（CameraRig 的"重复下发预设"兜底要据此避开拖拽期间）
      isPointerActive: () => pointerActiveRef.current,
      // DEV 诊断：自测脚本据此判断"模式已切但帧循环未推进"这类状态
      debug: () => ({
        mode: modeRef.current,
        hasOrbit: !!orbitRef.current,
        orbitElapsed: orbitRef.current?.elapsed ?? null,
        ramp: rampRef.current,
        idleForMs: Date.now() - lastInteractionAtRef.current,
      }),
    };
    return () => {
      if (apiRef.current?.notifyInteraction === notifyInteraction) apiRef.current = null;
    };
  }, [apiRef, modeRef, notifyInteraction, startOrbit]);

  // 自增 token → 触发环绕；同一命令重复下达（token 递增）可重复触发
  useEffect(() => {
    if (lastTokenRef.current === orbitToken) return;
    lastTokenRef.current = orbitToken;
    if (!enabled || orbitToken === 0) return;
    startOrbit();
  }, [enabled, orbitToken, startOrbit]);

  // 任意指针/滚轮/按键即停：挂在 window 捕获相，先于 OrbitControls 自己的 domElement 监听执行，
  // 因此指针按下当帧模式已回到 free，用户这一次拖拽不会被吞掉（无需禁用 controls）。
  useEffect(() => {
    if (!enabled) return undefined;
    const onInput = () => notifyInteraction();
    const onPointerDown = () => { pointerActiveRef.current = true; notifyInteraction(); };
    const onPointerRelease = () => { pointerActiveRef.current = false; notifyInteraction(); };
    const options = { capture: true, passive: true };
    const pairs = [
      ["pointerdown", onPointerDown],
      ["touchstart", onPointerDown],
      ["pointerup", onPointerRelease],
      ["pointercancel", onPointerRelease],
      ["wheel", onInput],
      ["keydown", onInput],
    ];
    pairs.forEach(([type, fn]) => globalThis.addEventListener(type, fn, options));
    return () => pairs.forEach(([type, fn]) => globalThis.removeEventListener(type, fn, options));
  }, [enabled, notifyInteraction]);

  useFrame((_, rawDelta) => {
    const controls = controlsRef.current;
    if (!controls || !camera) return;
    const delta = Math.min(rawDelta, IDLE_ROTATE_DEFAULTS.maxFrameDelta);
    const mode = modeRef.current;

    // ① 空闲判定：free 且静默超过阈值、且指针未按下 → 缓速自转
    if (
      enabled
      && mode === IDLE_MODES.FREE
      && !pointerActiveRef.current
      && isIdleElapsed(Date.now(), lastInteractionAtRef.current, idleDelayMs)
    ) {
      enterAuto();
    }

    const active = modeRef.current;
    if (active === IDLE_MODES.ORBIT) {
      const orbit = orbitRef.current;
      if (!orbit) return;
      orbit.elapsed += delta; // 秒（useFrame 的 delta 单位）
      // 注意单位：orbitDurationMs 是毫秒（§13.1），此处统一到秒再算进度
      const progress = clamp01(orbit.elapsed / Math.max(orbitDurationMs / 1000, 1e-3));
      const azimuth = orbitAzimuthAt(orbit.startAzimuth, progress);
      const [x, y, z] = positionOf(azimuth, orbit.polar, orbit.radius, orbit.target);
      if (!writePose(x, y, z)) { finishOrbit(); return; }
      if (progress >= 1) finishOrbit(); // 精确回正（orbitEase(1)=1 → 方位角回到起点）
      return;
    }

    if (active === IDLE_MODES.AUTO) {
      // 起步用阻尼加速，避免自转"啪"地开始
      rampRef.current = damp(rampRef.current, speed, IDLE_ROTATE_DEFAULTS.autoRotateRampLambda, delta);
      // 半径/极角每帧从当前位置反解 → 用户的缩放与俯仰被完整保留，只推进方位角
      const { azimuth, polar, radius } = sphericalOf(camera.position, controls.target);
      const [x, y, z] = positionOf(azimuth + rampRef.current * delta, polar, radius, controls.target);
      if (!writePose(x, y, z)) notifyInteraction();
    }
  });

  return null;
}
