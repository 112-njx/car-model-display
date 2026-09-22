/**
 * T5 命中目标层 —— 为每个可交互部件建立命中目标。
 *
 * 1. `usePartHitAreas()`：把"部件 pivot 子树 mesh + 薄玻璃的隐形加厚命中盒"编译成一份
 *    可直接喂给射线拾取的命中区集合（见 partMapping.js 的设计说明）。
 * 2. `<PartHitAreas debug />`：把命中区画成线框盒，用于人工/脚本核对"玻璃点中率"。
 *    默认渲染 null（零开销），加 `?cdHit=1` 或在开发时显式传 debug 才显示。
 *
 * 本组件挂在模型 group 之外的场景根上，因此线框盒直接使用世界坐标。
 */
import React, { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DoubleSide, Vector3 } from "three";
import { buildHitAreas, partWorldBox, proxyWorldBox } from "./partMapping";

const PROXY_COLOR = new Color("#38bdf8");
const PART_COLOR = new Color("#fbbf24");

/** 是否开启命中区可视化：URL 带 ?cdHit=1 时默认开启 */
export function hitDebugFromLocation(search = globalThis.location?.search ?? "") {
  return new URLSearchParams(search).has("cdHit");
}

/**
 * 编译命中区。scene / parts / lights / interaction 任一变化都会重建；
 * 调用方需保证 parts 的 pivot 已解析（见 VehicleModel 的 resolvePivot）。
 */
export function usePartHitAreas({ scene, parts, lights, interaction }) {
  return useMemo(
    () => buildHitAreas({ scene, parts, lights, interaction }),
    [scene, parts, lights, interaction],
  );
}

function hitTargetsOf(hitAreas) {
  if (!hitAreas) return [];
  const list = hitAreas.descriptors.map((descriptor) => ({
    key: descriptor.id,
    color: PART_COLOR,
    opacity: 0.45,
    boxOf: () => partWorldBox(descriptor, hitAreas),
  }));
  hitAreas.proxies.forEach((proxy) => list.push({
    key: `${proxy.id}:proxy`,
    color: PROXY_COLOR,
    opacity: 0.9,
    boxOf: () => proxyWorldBox(proxy),
  }));
  return list;
}

/**
 * 悬停高亮的补充层：车窗这类"开启后网格被隐藏/移走"的部件，emissive 提亮没有可见对象，
 * 改为把隐形加厚命中盒画成一块半透明青色玻璃，悬停反馈依然明确。
 * 非代理部件（车门/前后备箱）由 usePartPick 的 emissive 提亮负责，这里不渲染。
 */
export function PartHoverHighlight({ hitAreas, hoveredId }) {
  const mesh = useRef(null);
  const center = useMemo(() => new Vector3(), []);
  const size = useMemo(() => new Vector3(), []);
  const proxy = useMemo(
    () => (hitAreas && hoveredId ? hitAreas.proxies.find((item) => item.id === hoveredId) ?? null : null),
    [hitAreas, hoveredId],
  );

  // 注意：这里必须写 position/scale（让 three 每帧自己 updateMatrix），
  // 不能设 matrixAutoUpdate={false} 再直接改 matrix —— 那样 matrixWorldNeedsUpdate 保持 false，
  // matrixWorld 不会重算，盒子会钉死在原点。
  useFrame(() => {
    if (!mesh.current || !proxy) return;
    const box = proxyWorldBox(proxy);
    box.getCenter(center);
    box.getSize(size);
    mesh.current.position.copy(center);
    mesh.current.scale.set(size.x || 1e-4, size.y || 1e-4, size.z || 1e-4);
  });

  if (!proxy) return null;
  return (
    <mesh ref={mesh} renderOrder={998} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color={PROXY_COLOR}
        transparent
        opacity={0.22}
        depthWrite={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

export function PartHitAreas({ hitAreas, debug }) {
  const show = debug ?? hitDebugFromLocation();
  const boxes = useRef([]);
  const targets = useMemo(() => hitTargetsOf(hitAreas), [hitAreas]);
  const center = useMemo(() => new Vector3(), []);
  const size = useMemo(() => new Vector3(), []);

  // 同 PartHoverHighlight：写 position/scale，不写 matrix（见那里的注释）
  useFrame(() => {
    if (!show) return;
    targets.forEach((target, index) => {
      const mesh = boxes.current[index];
      if (!mesh) return;
      const box = target.boxOf();
      mesh.visible = Boolean(box);
      if (!box) return;
      box.getCenter(center);
      box.getSize(size);
      mesh.position.copy(center);
      mesh.scale.set(size.x || 1e-4, size.y || 1e-4, size.z || 1e-4);
    });
  });

  if (!show || !hitAreas) return null;
  return (
    <group>
      {targets.map((target, index) => (
        <mesh
          key={target.key}
          ref={(node) => { boxes.current[index] = node; }}
          renderOrder={999}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={target.color} wireframe transparent opacity={target.opacity} depthTest={false} />
        </mesh>
      ))}
    </group>
  );
}
