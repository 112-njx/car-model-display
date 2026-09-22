import React, { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, ClampToEdgeWrapping, LinearFilter } from "three";
import { ENV_COLORS } from "./envTheme";
import { useCanvasTexture } from "./useCanvasTexture";

const TEXTURE_WIDTH = 256;
const TEXTURE_HEIGHT = 64;
const SWEEP_LENGTH = 34;
const SWEEP_WIDTH = 2.6;
const RADIANS_PER_SECOND = 0.19; // 约 33 秒一圈，属「轻微扫光」，不抢主体

// 扫光贴图：长度方向两端渐隐（头部最亮、尾部拖尾），宽度方向中间亮、两侧淡。
function createSweepTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_WIDTH;
  canvas.height = TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");

  // 宽度方向：中间亮，边缘淡（先铺一层横向渐变，再用长度方向渐变相乘）
  const across = context.createLinearGradient(0, 0, 0, TEXTURE_HEIGHT);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = across;
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

  // 长度方向：起点 0 → 头部峰值 → 拖尾衰减
  context.globalCompositeOperation = "destination-in";
  const along = context.createLinearGradient(0, 0, TEXTURE_WIDTH, 0);
  along.addColorStop(0, "rgba(0,0,0,0)");
  along.addColorStop(0.16, "rgba(0,0,0,0.5)");
  along.addColorStop(0.46, "rgba(0,0,0,0.86)");
  along.addColorStop(0.62, "rgba(0,0,0,1)");
  along.addColorStop(0.78, "rgba(0,0,0,0.3)");
  along.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = along;
  context.fillRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
  context.globalCompositeOperation = "source-over";

  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * 轻微扫光：一条贴地光带绕车缓慢扫掠。
 * 对应 §13.1 `QUALITY.features[tier].sweepLight` —— 该字段为 false 时由
 * CockpitEnvironment 直接不挂载本组件，因此本组件不做内部开关。
 */
export function SweepLight({ opacity = 0.15, speed = RADIANS_PER_SECOND }) {
  const group = useRef();
  const texture = useCanvasTexture(createSweepTexture, []);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * speed;
  });

  // 贴图就绪前不渲染，理由同 TechGrid（避免材质先以无 map 状态编译）。
  if (!texture) return null;

  return (
    <group ref={group}>
      <mesh
        name="cd-env-sweep"
        rotation={[-Math.PI / 2, 0, 0]}
        position={[SWEEP_LENGTH / 2 - 3, 0.016, 0]}
        renderOrder={4}
      >
        <planeGeometry args={[SWEEP_LENGTH, SWEEP_WIDTH]} />
        <meshBasicMaterial
          map={texture}
          color={ENV_COLORS.sweep}
          transparent
          opacity={opacity}
          depthWrite={false}
          blending={AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
