import React, { useEffect, useRef, useState } from "react";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { CAMERAS } from "../../config/studioConfig";
import { useStudioStore } from "../../state/useStudioStore";
import { IDLE_MODES, IDLE_ROTATE_DEFAULTS, IdleAutoRotate, dampXYZ, distanceXYZ } from "./IdleAutoRotate";

/**
 * T7 · 相机机位（roadmap §12.3 T7）
 * A 段：预设阻尼曲线与 IdleAutoRotate 的互斥接线（仍读 T1 基线的旧 store，保证工程全程可跑）。
 * B 段：改读 config/carConfig.js + state/useCarStore.js，并注册 §13.3 CameraAudit。
 */
export function CameraRig() {
  const ref = useRef();
  const camera = useThree((s) => s.camera);
  const view = useStudioStore((s) => s.cameraView);
  const desiredPosition = useRef(new Vector3(...CAMERAS.hero.position));
  const desiredTarget = useRef(new Vector3(...CAMERAS.hero.target));
  const animating = useRef(false);

  // 与 IdleAutoRotate 共享的互斥模式：非 free 时本组件让出相机写权
  const modeRef = useRef(IDLE_MODES.FREE);
  const idleApi = useRef(null); // 由 IdleAutoRotate 回填 { notifyInteraction, startOrbit, debug }
  const frameCount = useRef(0); // DEV 诊断：帧循环存活计数
  // A 段占位令牌（DEV 下用 __t7DebugOrbitOnce 触发）；B 段改为读 store.cameraCommand.token
  const [orbitToken, setOrbitToken] = useState(0);

  useEffect(() => {
    const preset = CAMERAS[view];
    idleApi.current?.notifyInteraction(); // 预设切换是用户指令：先打断自转/环绕，再交给预设阻尼
    desiredPosition.current.set(...preset.position);
    desiredTarget.current.set(...preset.target);
    animating.current = true;
  }, [view]);

  // A 段临时自测入口（B 段接入 store.cameraCommand 后移除）
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const trigger = () => setOrbitToken((token) => token + 1);
    globalThis.__t7DebugOrbitOnce = trigger;
    return () => {
      if (globalThis.__t7DebugOrbitOnce === trigger) delete globalThis.__t7DebugOrbitOnce;
    };
  }, []);

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const audit = () => ({
      view,
      mode: modeRef.current,
      autoRotating: modeRef.current === IDLE_MODES.AUTO,
      orbiting: modeRef.current === IDLE_MODES.ORBIT,
      animating: animating.current,
      position: camera.position.toArray(),
      target: ref.current?.target.toArray() ?? null,
      distance: ref.current ? camera.position.distanceTo(ref.current.target) : null,
      frames: frameCount.current,
      idle: idleApi.current?.debug?.() ?? null,
    });
    globalThis.__formdriveCameraAudit = audit;
    globalThis.__formdriveCameraObject = camera;
    return () => {
      if (globalThis.__formdriveCameraAudit === audit) delete globalThis.__formdriveCameraAudit;
      if (globalThis.__formdriveCameraObject === camera) delete globalThis.__formdriveCameraObject;
    };
  }, [camera, view]);

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
      minDistance={4.1}
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
      orbitToken={orbitToken}
      enabled
      idleDelayMs={IDLE_ROTATE_DEFAULTS.idleAutoRotateDelayMs}
      orbitDurationMs={IDLE_ROTATE_DEFAULTS.orbitOnceDurationMs}
    />
  </>;
}
