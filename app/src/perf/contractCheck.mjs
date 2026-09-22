/**
 * contractCheck.mjs —— T8p 与契约的对接自测（免浏览器）
 *
 * 运行：node app/src/perf/contractCheck.mjs
 *
 * 为什么需要它：`selfTest.mjs` 验的是纯逻辑（判档、采样），全程没有碰过真实契约文件。
 * 本脚本用 Vite 的 `ssrLoadModule`（与浏览器同一套转换管线）把 `config/carConfig.js`
 * 与 `devtools/auditHooks.js` **真加载进来**，验证：
 *   1. §13.1 的 `QUALITY` 形状与数值；
 *   2. `resolveFeatures()` 对真契约的映射逐档正确，脏档位退最低档；
 *   3. `registerSceneAuditSource("perf", fn)` 注册后 `sceneAudit().perf` 能读到——
 *      即 §11.1 T8p DoD 的「perf 字段能被 `__carDisplaySceneAudit()` 读到」，
 *      `sceneAudit()` 正是 `window.__carDisplaySceneAudit` 的实现本体，因此这条在 Node 里可验；
 *   4. "perf" 落进**场景**审计而非相机审计（auditHooks 有 CAMERA_KEYS 路由）。
 *
 * 不覆盖：真实渲染、真实 rAF 采样、降级页的真实 DOM 渲染——那三项需要浏览器。
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function equal(name, actual, expected) {
  check(name, Object.is(actual, expected), `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

function deepEqual(name, actual, expected) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `期望 ${JSON.stringify(expected)}，实得 ${JSON.stringify(actual)}`);
}

const server = await createServer({
  root: appRoot,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
  // 本脚本只做 ssrLoadModule，不需要依赖预打包。关掉扫描可以避免 vite:dep-scan
  // 去扫 index.html 入口时撞上 StudioCanvas.jsx 的 `import("three/webgpu")` 并打印一堆
  // 与本次验证无关的报错噪音（那些报错不影响断言，但会淹没结论）。
  optimizeDeps: { noDiscovery: true, include: [] },
});

try {
  console.log("\n[1] §13.1 QUALITY 契约形状（真加载 config/carConfig.js）");

  const carConfig = await server.ssrLoadModule("/src/config/carConfig.js");
  const { QUALITY } = carConfig;

  check("carConfig 导出了 QUALITY", Boolean(QUALITY), `实得 ${typeof QUALITY}`);
  deepEqual("tiers 为 high/mid/low", QUALITY?.tiers, ["high", "mid", "low"]);

  const FEATURE_KEYS = ["reflector", "shadow", "sweepLight", "dprMax", "gridSegments"];
  for (const tier of ["high", "mid", "low"]) {
    const features = QUALITY?.features?.[tier];
    check(`features.${tier} 存在`, Boolean(features), `实得 ${typeof features}`);
    deepEqual(`features.${tier} 的键与 §13.1 一致`, Object.keys(features ?? {}).sort(), [...FEATURE_KEYS].sort());
  }

  console.log("\n[2] resolveFeatures() 对真契约的映射（真加载 PerfProvider.jsx）");

  const { resolveFeatures } = await server.ssrLoadModule("/src/perf/PerfProvider.jsx");

  check("PerfProvider 导出了 resolveFeatures", typeof resolveFeatures === "function");
  deepEqual("high 档 → §13.1 数值", resolveFeatures(QUALITY, "high"), {
    reflector: true,
    shadow: true,
    sweepLight: true,
    dprMax: 2,
    gridSegments: 96,
  });
  deepEqual("mid 档 → §13.1 数值", resolveFeatures(QUALITY, "mid"), {
    reflector: true,
    shadow: true,
    sweepLight: false,
    dprMax: 1.5,
    gridSegments: 64,
  });
  deepEqual("low 档 → §13.1 数值", resolveFeatures(QUALITY, "low"), {
    reflector: false,
    shadow: false,
    sweepLight: false,
    dprMax: 1,
    gridSegments: 32,
  });
  deepEqual("脏档位 → 退最低档（不崩、不返回 undefined）", resolveFeatures(QUALITY, "ultra"), resolveFeatures(QUALITY, "low"));
  deepEqual("quality 为 undefined → 不抛错", resolveFeatures(undefined, "high"), {});
  deepEqual("quality 缺 tiers → 退 low", resolveFeatures({ features: QUALITY.features }, "nope"), QUALITY.features.low);

  console.log("\n[3] §13.3 perf 审计字段（真加载 devtools/auditHooks.js）");

  const auditHooks = await server.ssrLoadModule("/src/devtools/auditHooks.js");
  const { registerSceneAuditSource, sceneAudit, cameraAudit } = auditHooks;

  check("auditHooks 导出了 registerSceneAuditSource", typeof registerSceneAuditSource === "function");
  equal("未注册时 sceneAudit().perf 为 null（契约已注明消费方须判空）", sceneAudit().perf, null);

  // 用真实采样器的快照去注册，验证的是"我的产出能被审计读到"这条完整数据路径
  const { createFpsSampler } = await server.ssrLoadModule("/src/perf/fpsSampler.js");
  const sampler = createFpsSampler({
    getTier: () => "mid",
    now: () => 0,
    requestFrame: () => 1,
    cancelFrame: () => {},
    isHidden: () => false,
  });

  const unregister = registerSceneAuditSource("perf", () => sampler.getSnapshot());
  const perf = sceneAudit().perf;

  check("注册后 sceneAudit().perf 不再是 null", perf !== null, JSON.stringify(perf));
  deepEqual("perf 的键恰为 §13.3 的 {fps,dpr,tier}", Object.keys(perf ?? {}).sort(), ["dpr", "fps", "tier"]);
  equal("perf.tier 取自采样器的 getTier()", perf?.tier, "mid");
  check("perf.fps 是数字", typeof perf?.fps === "number", `实得 ${typeof perf?.fps}`);
  check("perf.dpr 是数字", typeof perf?.dpr === "number", `实得 ${typeof perf?.dpr}`);
  check("perf.tier 取值在 QUALITY.tiers 内", QUALITY.tiers.includes(perf?.tier), perf?.tier);

  check("perf 落进场景审计而非相机审计", !("perf" in cameraAudit()), JSON.stringify(Object.keys(cameraAudit())));

  // 注册函数返回的注销函数必须真的能注销（PerfProvider 在 useEffect cleanup 里依赖它）
  check("registerSceneAuditSource 返回了注销函数", typeof unregister === "function");
  unregister();
  equal("注销后 perf 回到 null", sceneAudit().perf, null);

  console.log("\n[4] 契约里的其余字段未被 T8p 触碰");

  check("T8p 未修改 carConfig（PARTS 仍是 10 项）", carConfig.PARTS?.length === 10, `实得 ${carConfig.PARTS?.length}`);
  check("T8p 未修改 carConfig（LIGHTS 仍是 2 项）", carConfig.LIGHTS?.length === 2, `实得 ${carConfig.LIGHTS?.length}`);
  check("sceneAudit 基准字段仍在", "parts" in sceneAudit() && "lights" in sceneAudit() && "hitTargets" in sceneAudit());
} finally {
  await server.close();
}

console.log(`\n${"─".repeat(56)}`);
if (failures.length === 0) {
  console.log(`✅ 全部通过：${passed} 项断言`);
  process.exit(0);
}
console.log(`❌ ${failures.length} 项失败 / 共 ${passed + failures.length} 项：`);
for (const failure of failures) console.log(`   - ${failure}`);
process.exit(1);
