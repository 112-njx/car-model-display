/**
 * VehicleModel.jsx —— 车模加载、开合动画、灯光发光，以及 **T5 的 3D 点击拾取接线**。
 *
 * 契约接线（Wave 1 T5）：
 *   ① 部件一律用 §13.1 的 `id` 引用（`PARTS[].id`），本文件不硬编码任何 GLB 节点名；
 *      节点名只从 `PARTS[].node` 读，经 `resolvePivot` 解析。
 *   ② 开合状态读写 `useCarStore`（`state.parts[id]`），点击命中 → `togglePart`；
 *      灯光 → `toggleLight`；每次交互 `bumpInteraction()` + `pushToast`。
 *   ③ 阈值统一读 `carConfig.INTERACTION`。
 *   ④ 命中区由 `interaction/**` 编译；`hitTargets` 与 `parts`(progress/bbox) 经
 *      `registerSceneAuditSource` 注册进 §13.3 的 `window.__carDisplaySceneAudit()`。
 *
 * 本文件是 roadmap §12.2 划给 T5 的独占文件（全 Wave 1 唯一修改方）。
 *
 * T8 集成期收口：车身外观改读契约常量 `carConfig.APPEARANCE`（CHANGELOG 0016）、
 * 首屏加载进度改读 `useCarStore.loading`（CHANGELOG 0015）。本文件已**不再引用** legacy
 * `studioConfig.js` 与兼容 shim `useStudioStore.js`——两者均已按 §12.4 第 5 步删除。
 */
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Box3, Color, Euler, MathUtils, Matrix4, Raycaster, Vector3 } from "three";
import { APPEARANCE, INTERACTION, LIGHTS, MODEL_MATERIALS, MODEL_TRANSFORM, MODEL_URL, PARTS } from "../../config/carConfig";
import { useCarStore } from "../../state/useCarStore";
import { useVehicleGLTF } from "../../hooks/useVehicleGLTF";
import { registerSceneAuditSource } from "../../devtools/auditHooks";
import { PartHitAreas, PartHoverHighlight, usePartHitAreas } from "../../interaction/PartHitAreas";
import { usePartPick } from "../../interaction/usePartPick";
import { computeHitTargets, partWorldBox } from "../../interaction/partMapping";

const LIGHT_IDS = new Set(LIGHTS.map((light) => light.id));
const ITEM_LABELS = new Map([...PARTS, ...LIGHTS].map((item) => [item.id, item.label]));
const SLIDE_DAMPING = 1.65;
const HINGE_DAMPING = 6.5;

/**
 * 解析部件 pivot。
 * 先按 `PARTS[].node` 精确匹配；失败时退化为"剥掉非字母数字字符"的归一化比对——
 * 这一步是必需的：GLB 实测节点名是 `door_lf_glass.0_0`，而契约里的 `node` 写作
 * `door_lf_glass0_0`，只有归一化后才对得上（T1 基线同款兜底）。
 */
function resolvePivot(scene, nodeName) {
  if (!nodeName) return null;
  const exactMatch = scene.getObjectByName(nodeName);
  if (exactMatch) return exactMatch;
  const normalizedTarget = nodeName.replace(/[^a-z0-9_-]/gi, "").toLowerCase();
  let normalizedMatch = null;
  scene.traverse((object) => {
    if (!normalizedMatch && object.name.replace(/[^a-z0-9_-]/gi, "").toLowerCase() === normalizedTarget) normalizedMatch = object;
  });
  return normalizedMatch;
}

function matchesAny(value, needles) {
  return needles.some((needle) => value.includes(needle));
}

/** 用两点 k-means 估出左右大灯锚点（T3 的 HeadlightRig 经 __formdriveHeadlightAnchors 消费） */
function measureHeadlightAnchors(lightObjects, transform) {
  const points = [];
  const point = new Vector3();
  lightObjects.forEach((object) => {
    const positions = object.geometry?.attributes?.position;
    if (!positions) return;
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld).applyMatrix4(transform);
      points.push(point.clone());
    }
  });
  if (points.length < 2) return null;
  let leftX = Math.min(...points.map(({ x }) => x));
  let rightX = Math.max(...points.map(({ x }) => x));
  let left = new Vector3();
  let right = new Vector3();
  for (let pass = 0; pass < 8; pass += 1) {
    left = new Vector3(); right = new Vector3();
    let leftCount = 0; let rightCount = 0;
    points.forEach((sample) => {
      if (Math.abs(sample.x - leftX) <= Math.abs(sample.x - rightX)) { left.add(sample); leftCount += 1; }
      else { right.add(sample); rightCount += 1; }
    });
    if (leftCount) left.multiplyScalar(1 / leftCount);
    if (rightCount) right.multiplyScalar(1 / rightCount);
    leftX = left.x; rightX = right.x;
  }
  return left.x <= right.x ? { left: left.toArray(), right: right.toArray() } : { left: right.toArray(), right: left.toArray() };
}

function VehicleModelInstance() {
  const setLoadingSceneReady = useCarStore((store) => store.setLoadingSceneReady);
  const sceneReady = useCarStore((store) => store.loading.sceneReady);
  const parts = useCarStore((store) => store.parts);
  const lights = useCarStore((store) => store.lights);
  // 车身固定外观（§3.2 已裁掉涂装/轮毂配置器 → 契约常量，CHANGELOG 0014）
  const paint = APPEARANCE.paint;
  const finish = APPEARANCE.finish;
  const wheel = APPEARANCE.wheel;
  const group = useRef();
  const headlightLevel = useRef(0);
  const tailLightLevel = useRef(0);
  const camera = useThree((store) => store.camera);
  const gl = useThree((store) => store.gl);

  // 字节级加载进度追踪：T1 记录 04/05 经人工裁定「本轮修」，T5 重写本文件时按约定保持等价写法
  // （`trackInitialTransfer && !sceneReady`，其中 trackInitialTransfer 恒真）。首屏就绪后停止追踪。
  const trackInitialTransfer = true;
  const source = useVehicleGLTF(MODEL_URL, trackInitialTransfer && !sceneReady);

  useEffect(() => {
    let finalFrame;
    const firstFrame = window.requestAnimationFrame(() => {
      finalFrame = window.requestAnimationFrame(setLoadingSceneReady);
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (finalFrame) window.cancelAnimationFrame(finalFrame);
    };
  }, [setLoadingSceneReady]);

  const model = useMemo(() => {
    // All mutations belong to one fresh clone. This keeps rendered meshes,
    // materials and moving-part pivots aligned when StrictMode re-runs memos.
    const scene = source.scene.clone(true);
    const collections = { paint: new Set(), rims: new Set(), lights: new Set(), tailLights: new Set(), headLens: new Set(), tailLens: new Set() };
    const lightObjects = new Set();
    // T5: 灯光命中目标需要"按灯分组"的 mesh 集合（与 collections 同源，材质名匹配）
    const lightMeshSets = { headlight: new Set(), taillight: new Set() };
    scene.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const originals = Array.isArray(object.material) ? object.material : [object.material];
      const clones = originals.map((material) => material.clone());
      object.material = Array.isArray(object.material) ? clones : clones[0];
      const objectName = object.name.toLowerCase();
      clones.forEach((material) => {
        const name = `${objectName} ${material.name.toLowerCase()}`;
        material.envMapIntensity = 2.45;
        if (matchesAny(name, MODEL_MATERIALS.paint)) collections.paint.add(material);
        if (matchesAny(name, MODEL_MATERIALS.rims)) collections.rims.add(material);
        if (matchesAny(name, MODEL_MATERIALS.headlights)) { collections.lights.add(material); lightObjects.add(object); lightMeshSets.headlight.add(object); }
        if (matchesAny(name, MODEL_MATERIALS.taillights)) { collections.tailLights.add(material); lightMeshSets.taillight.add(object); }
        // 灯组外透镜：材质同为 tembus_red.0（opacity≈0.82），被前 1 个、后 3 个 mesh 共用，
        // 必须按 mesh 名区分前后且先判前（depan）再判后（tembus_red 会同时命中前罩材质名）。
        if (matchesAny(name, MODEL_MATERIALS.headlightLens)) collections.headLens.add(material);
        else if (matchesAny(name, MODEL_MATERIALS.taillightLens)) collections.tailLens.add(material);
      });
    });

    scene.updateMatrixWorld(true);
    const pivots = Object.fromEntries(PARTS.map((part) => [part.id, resolvePivot(scene, part.node)]));
    scene.updateMatrixWorld(true);
    const bounds = new Box3().setFromObject(scene);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    const scale = 5.65 / Math.max(size.x, size.z);
    scene.position.set(-center.x, -bounds.min.y, -center.z);
    scene.updateMatrixWorld(true);
    const modelRotation = new Euler(...MODEL_TRANSFORM.rotation);
    const lightTransform = new Matrix4().makeRotationFromEuler(modelRotation).scale(new Vector3(scale, scale, scale));
    const headlightBounds = new Box3();
    lightObjects.forEach((object) => headlightBounds.expandByObject(object));
    headlightBounds.applyMatrix4(lightTransform);
    const headlightAnchors = measureHeadlightAnchors(lightObjects, lightTransform);
    const headlightGeometry = [...lightObjects].map((object) => ({
      name: object.name,
      center: new Box3().setFromObject(object).getCenter(new Vector3()).multiplyScalar(scale).applyEuler(modelRotation).toArray(),
    }));

    const rotations = Object.fromEntries(Object.entries(pivots).map(([id, pivot]) => [id, pivot?.rotation.clone()]));
    const slideTargets = {};
    PARTS.forEach((part) => {
      const pivot = pivots[part.id];
      if (part.motion !== "slide" || !pivot?.parent) return;
      const worldStart = pivot.getWorldPosition(new Vector3());
      const glassBounds = new Box3().setFromObject(pivot);
      const glassHeight = glassBounds.max.y - glassBounds.min.y;
      const travelDistance = Math.max(part.travel / scale, glassHeight + 0.08 / scale);
      const localStart = pivot.parent.worldToLocal(worldStart.clone());
      const localEnd = pivot.parent.worldToLocal(worldStart.clone().add(new Vector3(0, -travelDistance, 0)));
      const materials = new Set();
      pivot.traverse((object) => {
        if (!object.isMesh) return;
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
      });
      slideTargets[part.id] = {
        target: pivot,
        base: pivot.position.clone(),
        travel: localEnd.sub(localStart),
        materials: [...materials].map((material) => ({
          material,
          opacity: material.opacity,
          transparent: material.transparent,
          depthWrite: material.depthWrite,
        })),
      };
    });
    return {
      scene,
      scale,
      pivots,
      rotations,
      slideTargets,
      headlightGeometry,
      headlightBounds: { min: headlightBounds.min.toArray(), max: headlightBounds.max.toArray() },
      headlightAnchors,
      materials: Object.fromEntries(Object.entries(collections).map(([key, value]) => [key, [...value]])),
      lightMeshes: Object.fromEntries(Object.entries(lightMeshSets).map(([key, value]) => [key, [...value]])),
    };
  }, [source.scene]);

  // T3 的 HeadlightRig 与本文件的帧循环经这两个 legacy 全局交换数据（T3 接线前保持兼容）
  useEffect(() => {
    const runtimeAnchors = { vehicle: "tesla", ...model.headlightAnchors };
    globalThis.__formdriveHeadlightAnchors = runtimeAnchors;
    return () => {
      if (globalThis.__formdriveHeadlightAnchors === runtimeAnchors) delete globalThis.__formdriveHeadlightAnchors;
    };
  }, [model.headlightAnchors]);

  useEffect(() => {
    const preset = paint;
    model.materials.paint.forEach((material) => {
      material.color.set(preset.color);
      material.metalness = Math.min(preset.metalness, 0.55);
      material.roughness = 0.11 + finish * 0.0045;
      material.vertexColors = false;
      if (material.emissive instanceof Color) material.emissive.set("#111111");
      if ("clearcoat" in material) material.clearcoat = 1 - finish * 0.006;
      material.needsUpdate = true;
    });
  }, [paint, finish, model]);

  useEffect(() => {
    const preset = wheel;
    model.materials.rims.forEach((material) => {
      material.color.set(preset.color); material.metalness = 0.9; material.roughness = preset.roughness; material.needsUpdate = true;
    });
  }, [wheel, model]);

  useEffect(() => {
    model.materials.lights.forEach((material) => {
      if (!(material.emissive instanceof Color)) material.emissive = new Color("#fff0cf");
      material.emissive.set("#fff0cf"); material.emissiveIntensity = 0; material.needsUpdate = true;
    });
    model.materials.tailLights.forEach((material) => {
      if (!(material.emissive instanceof Color)) material.emissive = new Color("#ff2338");
      material.emissive.set("#ff2338"); material.emissiveIntensity = 0; material.needsUpdate = true;
    });
    // 灯组外透镜：记录 GLB 原始外观（opacity≈0.82、depthWrite=true），关灯态零自发光、原样显示
    model.materials.headLens.forEach((material) => {
      if (!(material.emissive instanceof Color)) material.emissive = new Color("#fff2d8");
      material.emissive.set("#fff2d8");
      material.userData.baseOpacity = material.opacity;
      material.userData.baseDepthWrite = material.depthWrite;
      material.emissiveIntensity = 0;
      material.needsUpdate = true;
    });
    model.materials.tailLens.forEach((material) => {
      if (!(material.emissive instanceof Color)) material.emissive = new Color("#ff2338");
      material.emissive.set("#ff2338");
      material.userData.baseOpacity = material.opacity;
      material.userData.baseDepthWrite = material.depthWrite;
      material.emissiveIntensity = 0;
      material.needsUpdate = true;
    });
  }, [model]);

  /* ── T5 接线：命中区 → 拾取 → store ── */
  const hitParts = useMemo(() => PARTS.map((part) => ({
    id: part.id,
    group: part.group,
    label: part.label,
    pivot: model.pivots[part.id],
  })), [model]);
  const hitLights = useMemo(() => LIGHTS.map((light) => ({
    id: light.id,
    label: light.label,
    meshes: model.lightMeshes[light.id] ?? [],
  })), [model]);
  const hitAreas = usePartHitAreas({ scene: model.scene, parts: hitParts, lights: hitLights, interaction: INTERACTION });

  const handlePick = useCallback((id) => {
    const store = useCarStore.getState();
    const label = ITEM_LABELS.get(id) ?? id;
    store.bumpInteraction();
    if (LIGHT_IDS.has(id)) {
      const next = !store.lights[id];
      store.toggleLight(id);
      store.pushToast(`${label}已${next ? "开启" : "关闭"}`, next ? "success" : "info");
      return;
    }
    const next = !store.parts[id];
    store.togglePart(id);
    store.pushToast(`${label}已${next ? "打开" : "关闭"}`, next ? "success" : "info");
  }, []);

  const bumpInteraction = useCallback(() => useCarStore.getState().bumpInteraction(), []);

  const pick = usePartPick({
    hitAreas,
    interaction: INTERACTION,
    onPick: handlePick,
    onPointerActivity: bumpInteraction,
    highlight: INTERACTION.hoverHighlight !== false,
  });

  /** §13.3 hitTargets：世界包围盒 center/size + 当前相机下的屏幕像素坐标（供 T9 的 CDP 脚本精准点击） */
  const auditRaycaster = useRef(new Raycaster());
  const computeTargets = useCallback(() => {
    const rect = gl.domElement.getBoundingClientRect();
    return computeHitTargets({
      hitAreas,
      camera,
      viewport: { width: rect.width || 1, height: rect.height || 1, left: rect.left, top: rect.top },
      raycaster: auditRaycaster.current,
    });
  }, [camera, gl, hitAreas]);

  /** §13.3 的 parts 源（CHANGELOG 0006）：补上开合动画进度与包围盒尺寸，供 T9 断言中间态 */
  const computePartAudit = useCallback(() => Object.fromEntries(PARTS.map((part) => {
    const pivot = model.pivots[part.id];
    let progress = parts[part.id] ? 1 : 0;
    if (pivot && part.motion === "slide") {
      const slide = model.slideTargets[part.id];
      if (slide && slide.travel.lengthSq() > 0) {
        progress = MathUtils.clamp(pivot.position.distanceTo(slide.base) / slide.travel.length(), 0, 1);
      }
    } else if (pivot) {
      const base = model.rotations[part.id];
      if (base && part.angle) {
        progress = MathUtils.clamp(Math.abs(pivot.rotation[part.axis] - base[part.axis]) / Math.abs(part.angle), 0, 1);
      }
    }
    const box = partWorldBox({ id: part.id, pivot }, hitAreas);
    return [part.id, { progress, bbox: box ? box.getSize(new Vector3()).toArray() : null }];
  })), [hitAreas, model, parts]);

  useEffect(() => {
    const unregisterHitTargets = registerSceneAuditSource("hitTargets", computeTargets);
    const unregisterParts = registerSceneAuditSource("parts", computePartAudit);
    return () => {
      unregisterHitTargets();
      unregisterParts();
    };
  }, [computePartAudit, computeTargets]);

  // DEV-only 命中探针：给定屏幕像素返回部件 id，用于量"点中率"与排查误命中。
  // §13.3 的冻结审计面不含它，T9 的正式断言仍走 __carDisplaySceneAudit()。
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    const probe = (x, y) => pick.pickAt(x, y)?.id ?? null;
    globalThis.__carDisplayPickAt = probe;
    return () => {
      if (globalThis.__carDisplayPickAt === probe) delete globalThis.__carDisplayPickAt;
    };
  }, [pick]);

  useFrame((_, delta) => {
    if (group.current) globalThis.__formdriveActiveTransform = {
      position: group.current.position.toArray(),
      yaw: group.current.rotation.y - MODEL_TRANSFORM.rotation[1],
      moving: false,
    };
    const livePaint = paint;
    model.materials.paint.forEach((material) => {
      material.color.set(livePaint.color);
      material.metalness = Math.min(livePaint.metalness, 0.55);
    });
    const headlightOn = Boolean(lights.headlight);
    const tailLightOn = Boolean(lights.taillight);
    headlightLevel.current = MathUtils.damp(headlightLevel.current, headlightOn ? 1 : 0, headlightOn ? 6.2 : 10.5, delta);
    tailLightLevel.current = MathUtils.damp(tailLightLevel.current, tailLightOn ? 1 : 0, tailLightOn ? 7.2 : 11.5, delta);
    const headlightGlow = MathUtils.smootherstep(headlightLevel.current, 0, 1);
    const tailLightGlow = MathUtils.smootherstep(tailLightLevel.current, 0, 1);
    // 灯光材质的 emissiveIntensity 由本帧循环独占写入；悬停高亮需要给它一个下限才看得见
    const hovered = pick.hoveredRef.current;
    model.materials.lights.forEach((material) => {
      material.emissiveIntensity = Math.max(headlightGlow * 2.7, hovered === "headlight" ? 1.6 : 0);
    });
    model.materials.tailLights.forEach((material) => {
      material.emissiveIntensity = Math.max(tailLightGlow * 3.2, hovered === "taillight" ? 1.6 : 0);
    });
    // 灯组外透镜驱动（bugfix：原模型透镜 opacity≈0.82，开灯时把内部发光体完全挡住，
    // 开关灯在车模上无任何视觉变化）。前透镜开灯时降透明度并关深度写入，让内部 LED
    // 灯带透出；后透镜是红色灯罩，开灯时透镜自身红色发光，还原真实尾灯外观。
    const headLensGlow = Math.max(headlightGlow, hovered === "headlight" ? 0.35 : 0);
    const tailLensGlow = Math.max(tailLightGlow, hovered === "taillight" ? 0.35 : 0);
    model.materials.headLens.forEach((material) => {
      const baseOpacity = material.userData.baseOpacity ?? 0.82;
      material.opacity = baseOpacity + (0.22 - baseOpacity) * headLensGlow;
      material.depthWrite = headLensGlow < 0.5 ? (material.userData.baseDepthWrite ?? true) : false;
      material.emissiveIntensity = headLensGlow * 0.8;
    });
    model.materials.tailLens.forEach((material) => {
      const baseOpacity = material.userData.baseOpacity ?? 0.82;
      material.opacity = baseOpacity + (0.95 - baseOpacity) * tailLensGlow;
      material.depthWrite = tailLensGlow < 0.5 ? (material.userData.baseDepthWrite ?? true) : false;
      material.emissiveIntensity = tailLensGlow * 2.4;
    });
    PARTS.forEach((part) => {
      const pivot = model.pivots[part.id];
      if (!pivot) return;
      const isOpen = Boolean(parts[part.id]);
      if (part.motion === "slide") {
        const slide = model.slideTargets[part.id];
        if (!slide) return;
        const { target, base, travel, materials } = slide;
        target.position.x = MathUtils.damp(target.position.x, base.x + (isOpen ? travel.x : 0), SLIDE_DAMPING, delta);
        target.position.y = MathUtils.damp(target.position.y, base.y + (isOpen ? travel.y : 0), SLIDE_DAMPING, delta);
        target.position.z = MathUtils.damp(target.position.z, base.z + (isOpen ? travel.z : 0), SLIDE_DAMPING, delta);
        // Fully lowered panes belong inside the door cavity. Fade each mesh in
        // a compound pane together so imported trim layers cannot remain behind.
        const slideProgress = travel.lengthSq() > 0 ? target.position.distanceTo(base) / travel.length() : Number(isOpen);
        const glassMask = 1 - MathUtils.smootherstep(slideProgress, 0.14, 0.68);
        materials.forEach(({ material, opacity, transparent, depthWrite }) => {
          material.opacity = opacity * glassMask;
          const nextTransparent = glassMask < 0.995 || transparent;
          if (material.transparent !== nextTransparent) {
            material.transparent = nextTransparent;
            material.needsUpdate = true;
          }
          material.depthWrite = glassMask > 0.995 ? depthWrite : false;
        });
        target.visible = glassMask > 0.015;
        return;
      }
      const base = model.rotations[part.id];
      if (!base) return;
      pivot.rotation[part.axis] = MathUtils.damp(pivot.rotation[part.axis], base[part.axis] + (isOpen ? part.angle : 0), HINGE_DAMPING, delta);
    });
  });

  return (
    <>
      <group ref={group} scale={model.scale} position={[0, MODEL_TRANSFORM.groundOffset, 0]} rotation={MODEL_TRANSFORM.rotation}><primitive object={model.scene} /></group>
      {/* 命中区可视化（URL 带 ?cdHit=1）与车窗悬停高亮；挂在模型 group 之外的场景根上，用世界坐标 */}
      <PartHitAreas hitAreas={hitAreas} />
      <PartHoverHighlight hitAreas={hitAreas} hoveredId={pick.hoveredId} />
    </>
  );
}

export function VehicleModel() {
  return <VehicleModelInstance />;
}
