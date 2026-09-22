import React from "react";
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter } from "three";
import { ENV_COLORS } from "./envTheme";
import { useCanvasTexture } from "./useCanvasTexture";

const GRID_RADIUS = 22;
const GRID_SEGMENTS = 96;
const TEXTURE_SIZE = 1024;
const MAJOR_EVERY = 8;

// 科技网格贴图：程序化绘制，比 three 的 GridHelper 多两点能力 ——
// ① 径向 alpha 淡出（网格向远处自然消失，不会切出一条硬边）；
// ② 每 8 格一条更亮的主网格线，形成中控大屏常见的「刻度」层次。
// 纯贴图方案对 WebGPU 完全安全（无 onBeforeCompile / 无自定义着色器）。
function createGridTexture(segments) {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");

  const cell = TEXTURE_SIZE / segments;
  const lineWidth = Math.max(1, cell * 0.045);
  context.lineWidth = lineWidth;

  for (let index = 0; index <= segments; index += 1) {
    const position = index * cell;
    const isMajor = index % MAJOR_EVERY === 0;
    context.strokeStyle = isMajor ? ENV_COLORS.gridLineMajor : ENV_COLORS.gridLine;
    context.globalAlpha = isMajor ? 0.62 : 0.3;
    context.beginPath();
    context.moveTo(position, 0);
    context.lineTo(position, TEXTURE_SIZE);
    context.moveTo(0, position);
    context.lineTo(TEXTURE_SIZE, position);
    context.stroke();
  }
  context.globalAlpha = 1;

  // 径向淡出：中心保留、边缘抹掉，避免网格在圆盘边界处被硬切。
  context.globalCompositeOperation = "destination-in";
  const fade = context.createRadialGradient(
    TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE * 0.08,
    TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE * 0.5,
  );
  fade.addColorStop(0, "rgba(0,0,0,1)");
  fade.addColorStop(0.55, "rgba(0,0,0,0.92)");
  fade.addColorStop(0.86, "rgba(0,0,0,0.28)");
  fade.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = fade;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
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
 * 科技网格地面。
 *
 * @param {number} props.segments 对应 §13.1 `QUALITY.features[tier].gridSegments`，
 *                                直接决定网格密度（32/64/96）。
 */
export function TechGrid({ segments = GRID_SEGMENTS }) {
  const texture = useCanvasTexture(() => createGridTexture(segments), [segments]);

  // 贴图就绪前不渲染：材质若先以「无 map」编译一次，之后再赋值 map 不会触发
  // 着色器重编译，`USE_MAP` 始终未定义 —— 贴图的颜色与 alpha 会被整片忽略，
  // 网格退化成 color(白) × opacity 的实心灰片。详见 useCanvasTexture.js 注释。
  if (!texture) return null;

  return (
    <mesh name="cd-env-grid" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} renderOrder={1}>
      <circleGeometry args={[GRID_RADIUS, GRID_SEGMENTS]} />
      <meshBasicMaterial
        map={texture}
        transparent
        opacity={0.34}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
