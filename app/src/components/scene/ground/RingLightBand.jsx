import React from "react";
import { ENV_COLORS } from "./envTheme";

// 环形光带：中控大屏「车台」的核心视觉符号。
// 用 MeshBasicMaterial（自发光观感，不参与光照计算），toneMapped 关掉以保住冰青的纯度。
// 两个同心环拉开层次：外环偏蓝、细；内环偏青、粗且更亮。
const RINGS = [
  { radius: 5.35, tube: 0.013, color: ENV_COLORS.ringOuter, opacity: 0.72, y: 0.008 },
  { radius: 4.6, tube: 0.021, color: ENV_COLORS.ringInner, opacity: 0.95, y: 0.01 },
];

export function RingLightBand({ radiusScale = 1 }) {
  return (
    <group scale={[radiusScale, 1, radiusScale]}>
      {RINGS.map((ring) => (
        <mesh
          key={ring.radius}
          name={`cd-env-ring-${ring.radius}`}
          rotation={[Math.PI / 2, 0, 0]}
          position={[0, ring.y, 0]}
          renderOrder={3}
        >
          <torusGeometry args={[ring.radius, ring.tube, 8, 192]} />
          <meshBasicMaterial
            color={ring.color}
            transparent
            opacity={ring.opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}
