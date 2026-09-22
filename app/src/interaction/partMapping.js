/**
 * T5 拾取几何 —— 契约无关的纯函数层（不依赖 React、不依赖 store）。
 *
 * 设计要点（A 段，见 docs/debug.md）：
 * 1. 命中目标有两层：① 部件 pivot 子树内的真实 mesh（像素级精确，随开合动画一起运动）；
 *    ② 薄玻璃等"开合后不可见/已移走"的部件，补一个**闭合位姿的隐形加厚命中盒**（解析 OBB，
 *    不产生任何 draw call），否则车窗打开后玻璃 visible=false 就再也点不回去。
 * 2. 命中判定取"最近命中"，真实 mesh 与代理盒一起排序：代理盒只在射线确实穿过它时才参与，
 *    且真实网格通常更近，因此不会抢走车门等实心部件的点击。
 * 3. 部件一律用 id 引用；node 名由 config 提供，本文件不硬编码任何 node。
 */
import { Box3, Matrix4, Vector3 } from "three";

/** 默认需要"隐形加厚命中体"的分组：车窗为滑动玻璃，开启后网格被隐藏 */
export const DEFAULT_PROXY_GROUPS = ["windows"];

/** 代理盒最小厚度（相对部件最长边），避免极薄玻璃的 OBB 太扁导致斜射线漏命中 */
export const PROXY_MIN_THICKNESS_RATIO = 0.06;

/** 采样顶点生成"可点击屏幕坐标"时，每个部件最多取多少个候选点 */
const MAX_SCREEN_CANDIDATES = 48;

const _box = new Box3();
const _box2 = new Box3();
const _matrix = new Matrix4();
const _vector = new Vector3();
const _point = new Vector3();

/** pivot 子树内的全部 mesh（命中目标的几何来源） */
export function collectMeshes(root) {
  const meshes = [];
  if (!root) return meshes;
  root.traverse((object) => {
    if (object.isMesh && object.geometry) meshes.push(object);
  });
  return meshes;
}

/** 从 scene 根算起的层级深度：用于"同一 mesh 落在多个部件子树时归给更具体的部件" */
export function objectDepth(object, root) {
  let depth = 0;
  for (let node = object; node && node !== root; node = node.parent) depth += 1;
  return depth;
}

/**
 * 建立部件描述表。
 * @param parts  [{ id, label, group?, pivot, meshes? }] pivot 由调用方解析（config 的 node 字段）
 * @param lights [{ id, label, meshes }] 灯光不是 pivot，直接给 mesh 集合
 */
export function buildPartDescriptors({ parts = [], lights = [], proxyGroups = DEFAULT_PROXY_GROUPS }) {
  const descriptors = parts
    .filter((part) => part.pivot)
    .map((part) => ({
      id: part.id,
      label: part.label ?? part.id,
      kind: "part",
      group: part.group ?? null,
      pivot: part.pivot,
      meshes: part.meshes ?? collectMeshes(part.pivot),
      needsProxy: part.hitProxy ?? proxyGroups.includes(part.group),
    }));
  const lightDescriptors = lights
    .filter((light) => light.meshes?.length)
    .map((light) => ({
      id: light.id,
      label: light.label ?? light.id,
      kind: "light",
      group: "lights",
      pivot: null,
      meshes: light.meshes,
      needsProxy: false,
    }));
  return [...descriptors, ...lightDescriptors];
}

/** mesh → 部件 id：部件优先于灯光，同层冲突时取 pivot 更深的部件 */
export function buildMeshPartMap(scene, descriptors) {
  const claims = new Map();
  const claim = (mesh, descriptor, depth) => {
    const existing = claims.get(mesh);
    if (!existing || depth > existing.depth) claims.set(mesh, { id: descriptor.id, depth });
  };
  descriptors
    .filter((descriptor) => descriptor.kind === "part")
    .forEach((descriptor) => {
      const depth = objectDepth(descriptor.pivot, scene);
      descriptor.meshes.forEach((mesh) => claim(mesh, descriptor, depth));
    });
  descriptors
    .filter((descriptor) => descriptor.kind === "light")
    .forEach((descriptor) => {
      // 灯光只认领没有被任何部件子树覆盖的网格（例：尾灯网格在 boot_dummy 内 → 仍归后备箱）
      descriptor.meshes.forEach((mesh) => {
        if (!claims.has(mesh)) claim(mesh, descriptor, -1);
      });
    });
  return new Map([...claims].map(([mesh, { id }]) => [mesh, id]));
}

/**
 * 闭合位姿包围盒 → 记录在 pivot **父节点局部坐标系**里，
 * 命中时用父节点当前世界矩阵重建，因此车门打开时命中盒会跟着车门走，而不是留在原地。
 */
export function buildHitProxy(descriptor, { paddingRatio = 0, minThicknessRatio = PROXY_MIN_THICKNESS_RATIO } = {}) {
  const pivot = descriptor.pivot;
  const parent = pivot?.parent;
  if (!parent) return null;
  parent.updateWorldMatrix(true, false);
  const worldBox = new Box3().setFromObject(pivot);
  if (worldBox.isEmpty()) return null;
  const localBox = worldBox.clone().applyMatrix4(_matrix.copy(parent.matrixWorld).invert());
  const size = localBox.getSize(new Vector3());
  const maxSize = Math.max(size.x, size.y, size.z) || 1;
  const pad = maxSize * paddingRatio;
  const minThickness = maxSize * minThicknessRatio;
  const center = localBox.getCenter(new Vector3());
  return {
    id: descriptor.id,
    parent,
    center: center.toArray(),
    size: [
      Math.max(size.x + pad * 2, minThickness),
      Math.max(size.y + pad * 2, minThickness),
      Math.max(size.z + pad * 2, minThickness),
    ],
  };
}

/** 命中区集合：真实网格 + 代理盒 + 反查表 */
export function buildHitAreas({ scene, parts, lights, interaction = {}, proxyGroups = DEFAULT_PROXY_GROUPS }) {
  const descriptors = buildPartDescriptors({ parts, lights, proxyGroups });
  const meshToPart = buildMeshPartMap(scene, descriptors);
  const meshes = [...meshToPart.keys()];
  const proxies = descriptors
    .filter((descriptor) => descriptor.needsProxy)
    .map((descriptor) => buildHitProxy(descriptor, {
      paddingRatio: interaction.hitPaddingRatio ?? 0,
      minThicknessRatio: PROXY_MIN_THICKNESS_RATIO,
    }))
    .filter(Boolean);
  return {
    descriptors,
    byId: new Map(descriptors.map((descriptor) => [descriptor.id, descriptor])),
    meshToPart,
    meshes,
    proxies,
  };
}

function proxyBox(proxy) {
  // 注意：min / max 必须用两个不同的临时向量。若复用同一个 Vector3，
  // Box3.set 收到的两个实参会指向同一对象，得到零体积的退化盒。
  _box2.min.set(
    proxy.center[0] - proxy.size[0] * 0.5,
    proxy.center[1] - proxy.size[1] * 0.5,
    proxy.center[2] - proxy.size[2] * 0.5,
  );
  _box2.max.set(
    proxy.center[0] + proxy.size[0] * 0.5,
    proxy.center[1] + proxy.size[1] * 0.5,
    proxy.center[2] + proxy.size[2] * 0.5,
  );
  return _box2;
}

/**
 * 射线拾取：真实网格与代理盒一起按距离排序，取最近命中。
 * 返回 { id, distance, point, source } 或 null。
 */
export function pickPartId({ raycaster, hitAreas }) {
  if (!raycaster || !hitAreas) return null;
  const hits = [];
  if (hitAreas.meshes.length) {
    raycaster.intersectObjects(hitAreas.meshes, false).forEach((hit) => {
      const id = hitAreas.meshToPart.get(hit.object);
      if (id) hits.push({ id, distance: hit.distance, point: hit.point.clone(), source: "mesh" });
    });
  }
  const ray = raycaster.ray;
  hitAreas.proxies.forEach((proxy) => {
    const inverse = _matrix.copy(proxy.parent.matrixWorld).invert();
    const localRay = ray.clone().applyMatrix4(inverse);
    const localPoint = localRay.intersectBox(proxyBox(proxy), new Vector3());
    if (!localPoint) return;
    const worldPoint = localPoint.applyMatrix4(proxy.parent.matrixWorld);
    hits.push({ id: proxy.id, distance: worldPoint.distanceTo(ray.origin), point: worldPoint, source: "proxy" });
  });
  if (!hits.length) return null;
  hits.sort((a, b) => a.distance - b.distance);
  return hits[0];
}

/** 代理盒当前的世界包围盒（父节点局部 OBB → 世界 AABB） */
export function proxyWorldBox(proxy) {
  return proxyBox(proxy).clone().applyMatrix4(proxy.parent.matrixWorld);
}

/** 部件当前的命中区世界包围盒（真实网格 ∪ 代理盒） */
export function partWorldBox(descriptor, hitAreas) {
  const box = new Box3();
  if (descriptor.pivot) {
    box.union(_box.setFromObject(descriptor.pivot));
  } else {
    // 灯光（或 pivot 解析失败的部件）没有 pivot，直接并集自己的 mesh
    (descriptor.meshes ?? []).forEach((mesh) => box.union(_box.setFromObject(mesh)));
  }
  hitAreas.proxies
    .filter((proxy) => proxy.id === descriptor.id)
    .forEach((proxy) => box.union(proxyWorldBox(proxy)));
  return box.isEmpty() ? null : box;
}

/**
 * 世界坐标 → 屏幕像素。
 * viewport = { width, height, left, top }：width/height 为 canvas 的 CSS 尺寸，
 * left/top 为 canvas 在视口中的偏移。带上 left/top 后返回值可直接当 clientX/clientY 用，
 * T9 的 CDP 脚本无需再换算。
 */
export function projectToScreen(point, camera, viewport) {
  const ndc = _vector.copy(point).project(camera);
  return {
    x: (ndc.x * 0.5 + 0.5) * viewport.width + (viewport.left ?? 0),
    y: (-ndc.y * 0.5 + 0.5) * viewport.height + (viewport.top ?? 0),
  };
}

function insideViewport(screen, viewport) {
  const left = viewport.left ?? 0;
  const top = viewport.top ?? 0;
  return screen.x >= left && screen.y >= top
    && screen.x <= left + viewport.width && screen.y <= top + viewport.height;
}

function screenToRaycaster(screen, camera, viewport, raycaster) {
  const x = screen.x - (viewport.left ?? 0);
  const y = screen.y - (viewport.top ?? 0);
  const ndc = { x: (x / viewport.width) * 2 - 1, y: -(y / viewport.height) * 2 + 1 };
  raycaster.setFromCamera(ndc, camera);
  return raycaster;
}

function samplePartPoints(descriptor) {
  const points = [];
  const budget = Math.max(1, Math.floor(MAX_SCREEN_CANDIDATES / Math.max(1, descriptor.meshes.length)));
  descriptor.meshes.forEach((mesh) => {
    const position = mesh.geometry?.attributes?.position;
    if (!position) return;
    const stride = Math.max(1, Math.floor(position.count / budget));
    for (let index = 0; index < position.count; index += stride) {
      points.push(_point.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld).clone());
      if (points.length >= MAX_SCREEN_CANDIDATES) return;
    }
  });
  return points;
}

/**
 * 取一个"能真正点到该部件"的屏幕像素坐标，供 T9 的 CDP 脚本派发点击。
 * 依次尝试：包围盒中心 → 部件表面采样点；每个候选都用回投射线验证首个命中确实是本部件，
 * 全部不通过时退回包围盒中心的投影（可能落在视口外，由 T9 自行判断）。
 */
function representativeScreen(descriptor, hitAreas, camera, viewport, raycaster) {
  const box = partWorldBox(descriptor, hitAreas);
  if (!box) return null;
  const candidates = [box.getCenter(new Vector3()), ...samplePartPoints(descriptor)];
  let fallback = null;
  for (const candidate of candidates) {
    const screen = projectToScreen(candidate, camera, viewport);
    if (!fallback) fallback = screen;
    if (!insideViewport(screen, viewport)) continue;
    if (raycaster) {
      const hit = pickPartId({ raycaster: screenToRaycaster(screen, camera, viewport, raycaster), hitAreas });
      if (!hit || hit.id !== descriptor.id) continue;
    }
    return screen;
  }
  return fallback;
}

/**
 * §13.3 hitTargets：每部件包围盒 center/size（世界坐标）+ 当前相机下的屏幕像素坐标。
 * 屏幕坐标每次调用重新投影，相机移动后依然有效。
 */
export function computeHitTargets({ hitAreas, camera, viewport, raycaster }) {
  if (!hitAreas || !camera || !viewport) return [];
  return hitAreas.descriptors
    .map((descriptor) => {
      const box = partWorldBox(descriptor, hitAreas);
      if (!box) return null;
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      return {
        id: descriptor.id,
        center: center.toArray(),
        size: size.toArray(),
        screen: representativeScreen(descriptor, hitAreas, camera, viewport, raycaster),
      };
    })
    .filter((target) => target && target.screen);
}

/**
 * 手势判别：pointerdown → pointerup 的位移与时长阈值。
 * 纯函数，便于单测；OrbitControls 是否真的转动了相机由调用方另行判定。
 */
export function isTapGesture(start, end, interaction = {}) {
  const { tapMaxMovePx = 6, tapMaxDurationMs = 300 } = interaction;
  if (!start || !end) return false;
  if (start.pointerId !== end.pointerId) return false;
  if (end.time - start.time > tapMaxDurationMs) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) <= tapMaxMovePx;
}

/** 由屏幕像素反算 NDC 并设置射线，供 usePartPick 与自测脚本共用 */
export function raycasterFromScreen(screen, camera, viewport, raycaster) {
  return screenToRaycaster(screen, camera, viewport, raycaster);
}
