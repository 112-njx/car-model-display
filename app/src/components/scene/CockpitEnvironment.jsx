import React, { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter, SRGBColorSpace } from "three";
import { ReflectiveFloor } from "./ground/ReflectiveFloor";
import { TechGrid } from "./ground/TechGrid";
import { ContactShadow } from "./ground/ContactShadow";
import { RingLightBand } from "./ground/RingLightBand";
import { SweepLight } from "./ground/SweepLight";
import { ENV_COLORS, QUALITY_TIERS, resolveQualityFeatures } from "./ground/envTheme";
import "./ground/env.css";

// 新能源中控大屏风格的场景环境，替代 FormDrive 的三套摄影棚（StudioEnvironment）。
//
// 与旧实现的差异：
//   · 背景由纯色改为径向渐变（CanvasTexture 直接挂 scene.background，零额外 draw call）
//   · 移除 fog（旧实现用 fog 做「调色」，会把深色底洗淡）
//   · 灯光由「暖色摄影棚三点光」改为「冷白主光 + 青蓝氛围光 + 双轮廓光」
//   · 地面由纯色圆盘改为镜面反射地面 + 科技网格 + 环形光带 + 扫光
//
// 契约消费（§13.1）：本组件按 QUALITY.features 的字段名读取降级开关 ——
//   reflector / shadow / sweepLight / gridSegments
// A 段由 props 驱动（quality / qualityFeatures），B 段接入 store 后由 T8p 写入的档位驱动。
//
// 注意：features.dprMax 不在本组件消费 —— 按 §12.3，dpr 由 T8p 的 PerfProvider 统一控制。

const BACKDROP_SIZE = 512;

// 深色背景：垂直渐变打底 + 中心径向光晕叠加。
//
// 为什么不是「单一径向渐变」：three 把 scene.background 的普通 2D 纹理按屏幕比例
// 铺满（fill），径向中心会被水平拉宽成一条横贯屏幕的亮带。垂直渐变对拉伸不敏感，
// 再用一层弱径向光晕补出「车身后方有光源」的纵深感。
//
// 用 CanvasTexture 而非自定义着色器，是为了在 WebGPU 后端下同样可靠
// —— WebGPU 不支持 onBeforeCompile 着色器注入（详见《挂载说明》选型说明）。
function createBackdropTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = BACKDROP_SIZE;
  canvas.height = BACKDROP_SIZE;
  const context = canvas.getContext("2d");

  const vertical = context.createLinearGradient(0, 0, 0, BACKDROP_SIZE);
  vertical.addColorStop(0, ENV_COLORS.backdropTop);
  vertical.addColorStop(0.22, ENV_COLORS.backdropUpper);
  vertical.addColorStop(0.46, ENV_COLORS.backdropCore);
  vertical.addColorStop(0.72, ENV_COLORS.backdropLower);
  vertical.addColorStop(1, ENV_COLORS.backdropBottom);
  context.fillStyle = vertical;
  context.fillRect(0, 0, BACKDROP_SIZE, BACKDROP_SIZE);

  // 中心光晕：以车身后方为原点，用低 alpha 叠加，只加纵深、不加亮度峰值。
  const glow = context.createRadialGradient(
    BACKDROP_SIZE * 0.5, BACKDROP_SIZE * 0.5, BACKDROP_SIZE * 0.02,
    BACKDROP_SIZE * 0.5, BACKDROP_SIZE * 0.5, BACKDROP_SIZE * 0.62,
  );
  glow.addColorStop(0, `${ENV_COLORS.backdropGlow}2e`);
  glow.addColorStop(0.55, `${ENV_COLORS.backdropGlow}12`);
  glow.addColorStop(1, `${ENV_COLORS.backdropGlow}00`);
  context.fillStyle = glow;
  context.fillRect(0, 0, BACKDROP_SIZE, BACKDROP_SIZE);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function RadialBackdrop() {
  const scene = useThree((state) => state.scene);

  // 纹理在 effect 内创建、在同一 cleanup 内释放 —— 见 ground/useCanvasTexture.js
  // 顶部注释：建在 useMemo 里会被 StrictMode 的 effect 双调用释放掉。
  useEffect(() => {
    const texture = createBackdropTexture();
    const previous = scene.background;
    scene.background = texture;
    return () => {
      scene.background = previous;
      texture.dispose();
    };
  }, [scene]);

  return null;
}

/**
 * @param {object}  props
 * @param {string}  [props.quality=QUALITY_TIERS[0]] 质量档位名（§13.1 QUALITY.tiers），默认最高档
 * @param {object}  [props.qualityFeatures]            直接传入 features 对象（覆盖 quality 查表；T8 接 PerfProvider 时传入）
 * @param {number}  [props.exposure=1.0]               toneMappingExposure
 * @param {number}  [props.ringScale=1]                环形光带半径缩放（相机预设变化时微调用）
 */
export function CockpitEnvironment({
  quality = QUALITY_TIERS[0],
  qualityFeatures,
  exposure = 1.0,
  ringScale = 1,
}) {
  const renderer = useThree((state) => state.gl);
  const features = resolveQualityFeatures(quality, qualityFeatures);

  useEffect(() => {
    if (!renderer) return undefined;
    const previous = renderer.toneMappingExposure;
    renderer.toneMappingExposure = exposure;
    return () => {
      renderer.toneMappingExposure = previous;
    };
  }, [renderer, exposure]);

  return (
    <>
      <RadialBackdrop />

      {/* ── 氛围光：青蓝天光 + 近黑地面反弹，压住整体明度 ── */}
      <hemisphereLight args={[ENV_COLORS.skyGlow, ENV_COLORS.groundBounce, 0.6]} />
      <ambientLight color={ENV_COLORS.ambient} intensity={0.32} />

      {/* ── 主光：冷白，负责车身高光与投影 ── */}
      <directionalLight
        position={[5.6, 7.6, 4.6]}
        color={ENV_COLORS.key}
        intensity={2.3}
        castShadow={features.shadow}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00012}
        shadow-camera-near={0.5}
        shadow-camera-far={30}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      {/* ── 补光：青蓝，填充背光面 ── */}
      <directionalLight position={[-6.2, 4.4, -3.6]} color={ENV_COLORS.fill} intensity={1.05} />

      {/* ── 轮廓光：从车后两侧对打，勾出车身肩线 ── */}
      <directionalLight position={[-4.6, 2.1, -6.6]} color={ENV_COLORS.rimLeft} intensity={1.7} />
      <directionalLight position={[4.9, 1.8, -6.2]} color={ENV_COLORS.rimRight} intensity={1.4} />

      {/* ── 顶光：压出车顶与引擎盖的高光带 ── */}
      <spotLight
        position={[0, 8.6, 1.4]}
        color={ENV_COLORS.top}
        intensity={22}
        angle={0.82}
        penumbra={0.95}
        distance={26}
        decay={1.6}
        castShadow={features.shadow}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0002}
      />

      {/* ── 地面层 ── */}
      <ReflectiveFloor enableReflection={features.reflector} />
      <TechGrid segments={features.gridSegments} />
      <ContactShadow />
      <RingLightBand radiusScale={ringScale} />
      {features.sweepLight ? <SweepLight /> : null}
    </>
  );
}
