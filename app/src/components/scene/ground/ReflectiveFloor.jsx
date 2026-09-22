import React, { useEffect, useState } from "react";
import { CanvasTexture, ClampToEdgeWrapping, DoubleSide, LinearFilter, MeshBasicMaterial } from "three";
import { ENV_COLORS } from "./envTheme";
import { useCanvasTexture } from "./useCanvasTexture";
import { useVehicleRoot } from "./useVehicleRoot";

const FLOOR_RADIUS = 26;
const FLOOR_SEGMENTS = 96;

// 地面透明度遮罩：中心偏透明（让下方倒影透出），边缘不透明（把倒影彻底遮住）。
// 灰度值即 alpha —— 黑=全透，白=不透。这一张图同时承担了「镜面感」与「倒影渐隐」。
function createFloorAlphaTexture() {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(
    size / 2, size / 2, size * 0.02,
    size / 2, size / 2, size * 0.5,
  );
  // 中心 ~0.6（倒影可见）→ 0.34 半径处已接近不透明（倒影迅速被地面吃掉）。
  // 这条「陡」曲线是倒影不糊成一大块色斑的关键：镜像倒影只在车身附近透出。
  gradient.addColorStop(0, "#9a9a9a");
  gradient.addColorStop(0.2, "#bdbdbd");
  gradient.addColorStop(0.34, "#e2e2e2");
  gradient.addColorStop(0.55, "#f6f6f6");
  gradient.addColorStop(1, "#ffffff");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

// 倒影材质参数。**每个克隆网格必须持有自己的材质实例**，见下方 VehicleReflection 注释。
function createMirrorMaterial() {
  return new MeshBasicMaterial({
    color: ENV_COLORS.reflection,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    side: DoubleSide, // Y 镜像翻转绕序，必须双面渲染
  });
}

/**
 * 镜像倒影：克隆车模根节点，整体 Y 取反后置于地面之下。
 *
 * 用剪影式倒影（单一材质、不带纹理）而非复制原 PBR 材质，原因有三：
 *   1. Y 镜像会翻转三角形绕序与法线，原 PBR 材质的光照结果必然错误；
 *   2. 剪影没有材质编译成本，draw call 增量最小；
 *   3. 中控大屏的地面倒影本就是压暗的轮廓。
 *
 * **每个网格一个材质实例**（不是全场共享一个）——这是踩坑后的硬性要求：
 * 车模各网格的几何体属性集并不一致（有无 UV、有无顶点色等）。把同一个
 * MeshBasicMaterial 实例挂到上百个这样的网格上，会击穿 three WebGPU 后端的
 * 绑定缓存，渲染时抛 `TypeError: Invalid value used as weak map key`
 * （栈：Bindings._init → Textures.updateTexture → WeakMap.set(undefined)）。
 * 该异常抛在渲染调用内部，**会直接打死 R3F 的渲染循环**。逐网格独立材质后消失。
 *
 * 已知取舍：倒影是**静态快照**，不跟随车门/车窗的开合动画。倒影经地面压暗且
 * 尺度极小，动画不同步在视觉上不可辨；换来每帧零额外矩阵同步开销。
 */
function VehicleReflection({ source }) {
  const [clone, setClone] = useState(null);

  useEffect(() => {
    if (!source) {
      setClone(null);
      return undefined;
    }
    const mirrored = source.clone(true);
    const materials = [];
    mirrored.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = false;
      object.receiveShadow = false;
      const material = createMirrorMaterial();
      materials.push(material);
      object.material = material;
      object.renderOrder = -1; // 必须先于半透明地面绘制
    });
    setClone(mirrored);
    // 材质在 effect 内创建、同一 cleanup 内释放，每次 effect 运行都持有自己的实例
    // （理由同 useCanvasTexture.js：StrictMode 会双调用 effect）。
    // cleanup 时 React 已把 <primitive> 从场景摘除，此处释放不会命中「材质已释放、
    // 网格仍被渲染」的中间态。
    return () => {
      setClone(null);
      materials.forEach((material) => material.dispose());
    };
  }, [source]);
  // 克隆体与原车模共享 geometry，本组件只归还自己创建的材质，绝不 dispose 几何。

  if (!clone) return null;
  // scale.y = -1 把整棵子树（含其自身的 position.y = groundOffset）镜像到地面之下。
  return <group name="cd-env-reflection" scale={[1, -1, 1]}><primitive object={clone} /></group>;
}

/**
 * 镜面反射地面。
 *
 * @param {object}  props
 * @param {boolean} props.enableReflection 对应 §13.1 `QUALITY.features[tier].reflector`。
 *                                          false 时只留地面本体，不克隆车模、不增 draw call。
 * 注：地面为不受光材质，故不接收阴影贴图，无需 `shadow` 降级开关
 * （`features.shadow` 仍由 CockpitEnvironment 用于灯光的 castShadow）。
 */
export function ReflectiveFloor({ enableReflection = true }) {
  const alphaTexture = useCanvasTexture(createFloorAlphaTexture, []);
  const vehicleRoot = useVehicleRoot(enableReflection);

  // 贴图就绪前不渲染地面，理由同 TechGrid：材质若先以「无 alphaMap」编译一次，
  // 之后赋值 alphaMap 不会触发重编译，`USE_ALPHAMAP` 始终未定义 ——
  // 整块地面会退化成全不透明，把下方镜像倒影完全盖死。
  if (!alphaTexture) return null;

  return (
    <>
      {enableReflection && vehicleRoot ? <VehicleReflection source={vehicleRoot} /> : null}
      <mesh name="cd-env-floor" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} renderOrder={0}>
        <circleGeometry args={[FLOOR_RADIUS, FLOOR_SEGMENTS]} />
        {/* 地面用 MeshBasicMaterial（不受光）—— 这是刻意的，不是省事。
            受光材质在本场景下数学上必然发灰：四盏平行光总辐照度约 7.4，
            即使反照率压到近黑（#05080c ≈ 0.02 线性），漫反射仍有 0.02×7.4 ≈ 0.15，
            经 ACES + sRGB 编码后约 40% 灰 —— 整块地面糊成一片亮青灰，
            倒影、网格、光带全部被压掉。车身高光又必须靠这些强光，
            不能为了压暗地面而削光。
            所以地面改为不受光：恒定深色 + alphaMap 渐隐，镜面感完全交给镜像倒影。
            代价是地面不再接收阴影贴图；「车贴地」由 ContactShadow 与模型自带烘焙阴影承担。 */}
        <meshBasicMaterial
          color={ENV_COLORS.floorBase}
          transparent
          alphaMap={alphaTexture}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}
