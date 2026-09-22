/**
 * T5 拾取几何 / 手势判别的无头自测（Node 直跑，不需要浏览器）：
 *   cd app && node src/interaction/selftest/pick.selftest.mjs
 *
 * 用一个合成的"车门 + 玻璃 + 后备箱 + 大灯"场景覆盖关键路径：
 *   ① 点车门 → door_lf；② 点闭合玻璃 → window_lf（更深的 pivot 优先，不被车门抢走）；
 *   ③ 车窗打开（玻璃下滑并隐藏）后点窗洞 → window_lf（隐形加厚命中体兜底）；
 *   ④ 车窗打开时透过窗洞看到远侧车门 → 仍判 window_lf（最近命中，代理盒更近）；
 *   ⑤ 点车门钣金 → door_lf（代理盒不抢点击）；⑥ 点大灯网格 → headlight；
 *   ⑦ 手势阈值；⑧ hitTargets 的屏幕坐标回投必须命中同一部件。
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster } from "three";
import {
  buildHitAreas,
  computeHitTargets,
  isTapGesture,
  pickPartId,
  raycasterFromScreen,
} from "../partMapping.js";

let failures = 0;
let checks = 0;
function check(name, actual, expected) {
  checks += 1;
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok ? "" : `  ← 期望 ${expected}，实际 ${actual}`}`);
}

const INTERACTION = { tapMaxMovePx: 6, tapMaxDurationMs: 300, hitPaddingRatio: 0.02 };
const material = new MeshStandardMaterial();

function box(name, size, position) {
  const mesh = new Mesh(new BoxGeometry(...size), material);
  mesh.name = name;
  mesh.position.set(...position);
  return mesh;
}

function buildScene() {
  const scene = new Group();

  // 左前门：pivot(Group) → 钣金 mesh + 玻璃 mesh（玻璃自己也是一个 pivot，对应 GLB 的
  // door_lf_dummy → door_lf → door_lf_glass.0_0 结构）
  const doorPivot = new Group();
  doorPivot.name = "door_lf_dummy";
  doorPivot.position.set(-1, 0, 0);
  const doorMesh = box("door_lf_primary_0", [0.2, 0.6, 1], [0, 0, 0]);
  const glassPivot = box("door_lf_glass.0_0", [0.02, 0.4, 0.8], [0, 0.5, 0]);
  doorPivot.add(doorMesh, glassPivot);
  scene.add(doorPivot);

  // 后备箱
  const trunkPivot = new Group();
  trunkPivot.name = "boot_dummy";
  trunkPivot.position.set(2, 0, 0);
  trunkPivot.add(box("boot_primary_0", [1, 0.3, 0.8], [0, 0, 0]));
  scene.add(trunkPivot);

  // 远侧车门：仅用于"透过打开的车窗看过去"的最近命中用例
  const farPivot = new Group();
  farPivot.name = "far_door_dummy";
  farPivot.position.set(-1, 0.5, -2);
  farPivot.add(box("far_door_primary_0", [0.2, 0.6, 1], [0, 0, 0]));
  scene.add(farPivot);

  // 大灯：不属于任何部件子树
  const headlightMesh = box("chrome_Lights_head_l_right front light_0", [0.3, 0.15, 0.05], [1, 0.3, 0.4]);
  scene.add(headlightMesh);

  scene.updateMatrixWorld(true);
  return { scene, doorPivot, doorMesh, glassPivot, trunkPivot, farPivot, headlightMesh };
}

const world = buildScene();
const parts = [
  { id: "door_lf", group: "doors", label: "左前门", pivot: world.doorPivot },
  { id: "window_lf", group: "windows", label: "左前车窗", pivot: world.glassPivot },
  { id: "trunk", group: "closures", label: "后备箱", pivot: world.trunkPivot },
  { id: "door_rf", group: "doors", label: "右前门", pivot: world.farPivot },
];
const lights = [{ id: "headlight", label: "大灯", meshes: [world.headlightMesh] }];
const hitAreas = buildHitAreas({ scene: world.scene, parts, lights, interaction: INTERACTION });

const camera = new PerspectiveCamera(36, 800 / 600, 0.1, 120);
const viewport = { width: 800, height: 600, left: 0, top: 0 };
const raycaster = new Raycaster();

/** 从给定世界坐标朝 -z 打一条射线 */
function pickFrom(origin, target = [origin[0], origin[1], 0]) {
  camera.position.set(origin[0], origin[1], origin[2]);
  camera.lookAt(...target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  const screen = { x: viewport.width / 2, y: viewport.height / 2 };
  raycasterFromScreen(screen, camera, viewport, raycaster);
  const hit = pickPartId({ raycaster, hitAreas });
  return hit?.id ?? null;
}

console.log("── 命中目标编译 ──");
check("代理盒只给车窗（1 个）", hitAreas.proxies.length, 1);
check("代理盒归属 window_lf", hitAreas.proxies[0]?.id, "window_lf");
check("玻璃网格归 window_lf（更深的 pivot 优先）", hitAreas.meshToPart.get(world.glassPivot), "window_lf");
check("车门钣金归 door_lf", hitAreas.meshToPart.get(world.doorMesh), "door_lf");
check("大灯网格归 headlight", hitAreas.meshToPart.get(world.headlightMesh), "headlight");

console.log("── 拾取（车窗关闭）──");
check("点车门钣金 → door_lf", pickFrom([-1, 0, 5]), "door_lf");
check("点闭合玻璃 → window_lf", pickFrom([-1, 0.5, 5]), "window_lf");
check("点后备箱 → trunk", pickFrom([2, 0, 5]), "trunk");
check("点大灯 → headlight", pickFrom([1, 0.3, 5]), "headlight");
check("点空白处 → 无命中", pickFrom([0, 3, 5]), null);

console.log("── 拾取（车窗打开：玻璃下滑 1.0 并隐藏）──");
world.glassPivot.position.y -= 1;
world.glassPivot.visible = false;
world.scene.updateMatrixWorld(true);
check("点窗洞 → window_lf（隐形加厚命中体）", pickFrom([-1, 0.5, 5]), "window_lf");
check("点车门钣金 → 仍是 door_lf（代理盒不抢点击）", pickFrom([-1, 0, 5]), "door_lf");
check("透过窗洞看到远侧车门 → 最近命中 window_lf", pickFrom([-1, 0.5, 5], [-1, 0.5, -2]), "window_lf");
check("点远侧车门本体 → door_rf", pickFrom([-1, 0.5, -5], [-1, 0.5, -2]), "door_rf");

console.log("── 手势判别 ──");
const tap = { pointerId: 1, x: 100, y: 100, time: 0 };
check("原地 120ms → 是点击", isTapGesture(tap, { pointerId: 1, x: 102, y: 103, time: 120 }, INTERACTION), true);
check("位移 10px → 不是点击", isTapGesture(tap, { pointerId: 1, x: 110, y: 100, time: 120 }, INTERACTION), false);
check("耗时 400ms → 不是点击", isTapGesture(tap, { pointerId: 1, x: 100, y: 100, time: 400 }, INTERACTION), false);
check("位移 6px（阈值边界）→ 是点击", isTapGesture(tap, { pointerId: 1, x: 106, y: 100, time: 120 }, INTERACTION), true);
check("指针 id 不一致 → 不是点击", isTapGesture(tap, { pointerId: 2, x: 100, y: 100, time: 120 }, INTERACTION), false);
check("缺少起点 → 不是点击", isTapGesture(null, tap, INTERACTION), false);

console.log("── hitTargets（§13.3 屏幕坐标）──");
const targets = computeHitTargets({ hitAreas, camera, viewport, raycaster });
check("部件数 + 灯光数 = 命中目标数", targets.length, parts.length + lights.length);
let verified = 0;
targets.forEach((target) => {
  const shapeOk = typeof target.id === "string"
    && target.center.length === 3 && target.size.length === 3
    && typeof target.screen?.x === "number" && typeof target.screen?.y === "number";
  if (!shapeOk) return;
  raycasterFromScreen(target.screen, camera, viewport, raycaster);
  const hit = pickPartId({ raycaster, hitAreas });
  if (hit?.id === target.id) verified += 1;
});
check("每个 hitTargets.screen 回投都命中自己", verified, targets.length);
console.log(`       hitTargets: ${targets.map((t) => `${t.id}(${t.screen.x.toFixed(0)},${t.screen.y.toFixed(0)})`).join(" ")}`);

console.log(`\n${failures ? "✗" : "✓"} ${checks - failures}/${checks} 通过`);
process.exit(failures ? 1 : 0);
