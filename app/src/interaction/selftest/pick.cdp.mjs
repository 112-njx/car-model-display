/**
 * T5 真实浏览器拾取自测（CDP，无新增依赖，沿用 T1 的 scripts/verify-*.mjs 模式）。
 *
 * 前置：① `npm run dev` 已在运行；② 一个开了远程调试端口的 Chromium（Edge/Chrome）。
 * 用法：
 *   node src/interaction/selftest/pick.cdp.mjs [devServerUrl] [debugPort] [viewportW] [viewportH]
 * 默认 http://127.0.0.1:5175/ 、12319 、1280x800
 *
 * 覆盖：10 个部件 + 2 个灯光的真实鼠标点击开合、拖拽不误触发、触摸点按、
 *       hitTargets 屏幕坐标可用性、玻璃部件命中覆盖率（点中率）。
 * 终态一律读 §13.3 的 __carDisplaySceneAudit()（不依赖 T5 私有的调试钩子）。
 */
const baseUrl = process.argv[2] ?? "http://127.0.0.1:5175/";
const debugPort = Number(process.argv[3] ?? 12319);
const viewportWidth = Number(process.argv[4] ?? 1280);
const viewportHeight = Number(process.argv[5] ?? 800);

const target = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(baseUrl)}`, { method: "PUT" })
  .then((response) => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const consoleErrors = [];
let commandId = 0;

socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  } else if (message.method === "Runtime.exceptionThrown") {
    consoleErrors.push(message.params.exceptionDetails.text ?? "exception");
  } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
    consoleErrors.push(message.params.entry.text);
  }
});
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++commandId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const evaluate = async (expression) => {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

let failures = 0;
let checks = 0;
function check(name, actual, expected) {
  checks += 1;
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok ? "" : `  ← 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`}`);
}

async function mouseClick(x, y) {
  const common = { x, y, button: "left", clickCount: 1 };
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...common, button: "none" });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", ...common });
  await delay(40);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...common });
  await delay(180);
}

async function mouseDrag(x, y, dx, dy) {
  const common = { button: "left", clickCount: 1 };
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, ...common });
  for (let step = 1; step <= 6; step += 1) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + (dx * step) / 6, y: y + (dy * step) / 6, button: "left" });
    await delay(16);
  }
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, ...common });
  await delay(220);
}

async function touchTap(x, y) {
  const point = [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }];
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point });
  await delay(50);
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await delay(200);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Log.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: viewportWidth, height: viewportHeight, deviceScaleFactor: 1, mobile: false,
});
await send("Page.navigate", { url: baseUrl });
await delay(7000);

/** 从 §13.3 的 __carDisplaySceneAudit() 读出 10 部件 + 2 灯光的终态 */
const readState = async () => evaluate(`(() => {
  const audit = window.__carDisplaySceneAudit();
  return {
    open: Object.fromEntries(audit.parts.map((part) => [part.id, part.open])),
    lights: Object.fromEntries(audit.lights.map((light) => [light.id, light.on])),
  };
})()`);

const ready = await evaluate(`(() => ({
  hasAudit: typeof window.__carDisplaySceneAudit === 'function',
  hasStore: typeof window.__carDisplayStore?.getState === 'function',
  targets: typeof window.__carDisplaySceneAudit === 'function' ? window.__carDisplaySceneAudit().hitTargets.length : 0,
  canvas: (() => { const c = document.querySelector('canvas'); if (!c) return null; const r = c.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), left: Math.round(r.left), top: Math.round(r.top) }; })(),
}))()`);
console.log("── 环境 ──");
console.log(`       canvas=${JSON.stringify(ready.canvas)} hitTargets=${ready.targets} store=${ready.hasStore}`);
check("§13.3① __carDisplayStore 可用", ready.hasStore, true);
if (!ready.hasAudit || !ready.targets) {
  console.log("✗ 页面未就绪（__carDisplaySceneAudit().hitTargets 不可用），中止");
  process.exit(1);
}

const targets = await evaluate("window.__carDisplaySceneAudit().hitTargets");
console.log("── hitTargets ──");
targets.forEach((t) => console.log(`       ${t.id.padEnd(10)} screen=(${t.screen.x.toFixed(0)},${t.screen.y.toFixed(0)}) size=[${t.size.map((v) => v.toFixed(2)).join(",")}]`));
check("hitTargets 覆盖 10 部件 + 2 灯光", targets.length, 12);
check("每条都带 center/size/screen", targets.every((t) => t.center.length === 3 && t.size.length === 3 && Number.isFinite(t.screen.x)), true);
check("屏幕坐标都落在 canvas 内", targets.every((t) => t.screen.x >= ready.canvas.left && t.screen.x <= ready.canvas.left + ready.canvas.w
  && t.screen.y >= ready.canvas.top && t.screen.y <= ready.canvas.top + ready.canvas.h), true);

const PART_IDS = ["window_lf", "window_rf", "window_lr", "window_rr", "door_lf", "door_rf", "door_lr", "door_rr", "frunk", "trunk"];
const LIGHT_IDS = ["headlight", "taillight"];
const screenOf = Object.fromEntries(targets.map((t) => [t.id, t.screen]));

console.log("── 桌面鼠标点击：10 部件 + 2 灯光开合 ──");
for (const id of [...PART_IDS, ...LIGHT_IDS]) {
  const point = screenOf[id];
  if (!point) { check(`${id} 有命中目标`, false, true); continue; }
  await mouseClick(point.x, point.y);
  const afterFirst = await readState();
  const bucket = LIGHT_IDS.includes(id) ? afterFirst.lights : afterFirst.open;
  check(`点击 ${id} → 打开`, Boolean(bucket[id]), true);
  await mouseClick(point.x, point.y);
  const afterSecond = await readState();
  const bucket2 = LIGHT_IDS.includes(id) ? afterSecond.lights : afterSecond.open;
  check(`再点 ${id} → 关闭`, Boolean(bucket2[id]), false);
}

console.log("── 拖拽旋转不误触发点击 ──");
const doorPoint = screenOf.door_lf;
const before = await readState();
await mouseDrag(doorPoint.x, doorPoint.y, 90, 30);
const afterDrag = await readState();
check("拖拽 90px 后 door_lf 状态不变", afterDrag.open.door_lf ?? false, before.open.door_lf ?? false);
check("拖拽后相机确实转动了", await evaluate("(() => { const c = window.__formdriveCameraObject; return Boolean(c); })()"), true);

console.log("── 触摸点按（手机路径）──");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await delay(900);
const mobileTargets = await evaluate("window.__carDisplaySceneAudit().hitTargets");
const mobileScreen = Object.fromEntries(mobileTargets.map((t) => [t.id, t.screen]));
check("手机视口下仍有 12 个命中目标", mobileTargets.length, 12);
for (const id of ["window_lf", "door_lf", "trunk"]) {
  const point = mobileScreen[id];
  await touchTap(point.x, point.y);
  const state = await readState();
  check(`触摸点按 ${id} → 打开`, Boolean(state.open[id]), true);
  await touchTap(point.x, point.y);
  const state2 = await readState();
  check(`再触摸 ${id} → 关闭`, Boolean(state2.open[id]), false);
}

console.log("── 玻璃部件命中覆盖率（点中率）──");
const coverage = await evaluate(`(() => {
  const targets = window.__carDisplaySceneAudit().hitTargets;
  const out = {};
  for (const id of ['window_lf','window_rf','window_lr','window_rr']) {
    const t = targets.find((item) => item.id === id);
    if (!t) { out[id] = null; continue; }
    // 以命中目标屏幕坐标为中心，在 ±12px 的方格里打 5x5 = 25 条射线
    let hit = 0; let total = 0;
    for (let dx = -12; dx <= 12; dx += 6) {
      for (let dy = -12; dy <= 12; dy += 6) {
        total += 1;
        if (window.__carDisplayPickAt(t.screen.x + dx, t.screen.y + dy) === id) hit += 1;
      }
    }
    out[id] = Math.round((hit / total) * 100);
  }
  return out;
})()`);
Object.entries(coverage).forEach(([id, rate]) => check(`玻璃 ${id} 点中率 ≥90%`, rate, rate !== null && rate >= 90 ? rate : `不足(${rate}%)`));

const windowCoverage = Object.values(coverage).filter((rate) => typeof rate === "number");
const average = windowCoverage.length ? windowCoverage.reduce((sum, rate) => sum + rate, 0) / windowCoverage.length : 0;
console.log(`       四窗平均点中率 ${average.toFixed(1)}%`);

console.log("── 控制台错误 ──");
check("无运行时错误", consoleErrors.length, 0);
if (consoleErrors.length) consoleErrors.slice(0, 5).forEach((text) => console.log(`       ${text}`));

console.log(`\n${failures ? "✗" : "✓"} ${checks - failures}/${checks} 通过`);
await send("Page.close").catch(() => {});
process.exit(failures ? 1 : 0);
