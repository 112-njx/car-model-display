/**
 * scripts/verify-parts.mjs —— 部件与灯光开合的自动化验证（roadmap §11.1 T9①）
 *
 * 做法：经 `window.__carDisplayStore` 逐一驱动 10 个部件 + 2 个灯光，
 * 读 `window.__carDisplaySceneAudit()` 断言**终态**（open/on）与**动画进度**（progress）。
 *
 * 只依赖 §13.3 冻结钩子，不 import 工程内部实现。分层：
 *   · 契约层（store 驱动 → audit 终态/progress 终值）—— contract-v1 上即可跑绿
 *   · 集成层（progress 反映真实动画而非 open?1:0）—— 需 T5 注册 parts 源；
 *     未注册时明确标 SKIP（不假绿），已注册但 progress 不反映动画则 FAIL
 *
 * 用法：
 *   node scripts/verify-parts.mjs                       # 默认 http://127.0.0.1:5173/
 *   node scripts/verify-parts.mjs --base-url=http://127.0.0.1:5180/ --debug-port=9222
 *   node scripts/verify-parts.mjs --report=%TEMP%/verify-parts.json --strict
 */

import {
  PART_IDS,
  PART_GROUP_IDS,
  LIGHT_IDS,
  labelOf,
  readSnapshot,
  resetToBaseline,
  run,
  delay,
  waitForHooks,
} from "./lib/cdp.mjs";

const TERMINAL_TOLERANCE = 0.01;
const SETTLE_TIMEOUT_MS = 8000;
/** 过渡采样：每 60ms 采一次，最多 1.2s，用于判断 progress 是否反映真实动画 */
const SAMPLE_INTERVAL_MS = 60;
const SAMPLE_COUNT = 20;

await run("verify-parts", async ({ session, reporter }) => {
  // ── 0. 钩子就绪 ─────────────────────────────────────────────────────────
  const initial = await waitForHooks(session);
  reporter.info(
    `页面已就绪：store=${initial.hasStore} sceneAudit=${initial.hasSceneAudit} ` +
      `cameraAudit=${initial.hasCameraAudit} voiceInject=${initial.hasVoiceInject}`,
  );
  reporter.check("审计钩子 __carDisplayStore 存在", initial.hasStore, `hasStore=${initial.hasStore}`);
  reporter.check("审计钩子 __carDisplaySceneAudit() 存在", initial.hasSceneAudit);
  reporter.check("审计钩子 __carDisplayCameraAudit() 存在", initial.hasCameraAudit);

  // ── 1. SceneAudit 结构（§13.3②）──────────────────────────────────────────
  reporter.check("parts 为 10 项全量数组", Array.isArray(initial.parts) && initial.parts.length === 10,
    `实得 ${initial.parts?.length ?? "null"} 项`);
  reporter.check(
    "parts 顺序与 §13.1 声明一致",
    JSON.stringify(initial.parts?.map((part) => part.id)) === JSON.stringify(PART_IDS),
    `实得 ${JSON.stringify(initial.parts?.map((part) => part.id))}`,
  );
  reporter.check("lights 为 2 项全量数组", Array.isArray(initial.lights) && initial.lights.length === 2,
    `实得 ${initial.lights?.length ?? "null"} 项`);
  reporter.check(
    "lights 顺序与 §13.1 声明一致",
    JSON.stringify(initial.lights?.map((light) => light.id)) === JSON.stringify(LIGHT_IDS),
    `实得 ${JSON.stringify(initial.lights?.map((light) => light.id))}`,
  );
  reporter.check(
    "每个 part 均含 {id,open,progress,bbox} 且类型正确",
    (initial.parts ?? []).every(
      (part) =>
        typeof part.id === "string" &&
        typeof part.open === "boolean" &&
        typeof part.progress === "number" &&
        (part.bbox === null || (Array.isArray(part.bbox) && part.bbox.length === 3 && part.bbox.every(Number.isFinite))),
    ),
    `首项 ${JSON.stringify(initial.parts?.[0])}`,
  );
  reporter.check(
    "每个 light 均含 {id,on} 且类型正确",
    (initial.lights ?? []).every((light) => typeof light.id === "string" && typeof light.on === "boolean"),
    `首项 ${JSON.stringify(initial.lights?.[0])}`,
  );
  reporter.check("cameraView 为字符串", typeof initial.cameraView === "string", `实得 ${JSON.stringify(initial.cameraView)}`);
  reporter.check("autoRotate 为布尔", typeof initial.autoRotate === "boolean", `实得 ${JSON.stringify(initial.autoRotate)}`);
  reporter.check("hitTargets 为数组（未注册时为 []）", Array.isArray(initial.hitTargets),
    `实得 ${Array.isArray(initial.hitTargets) ? `数组(${initial.hitTargets.length})` : JSON.stringify(initial.hitTargets)}`);
  reporter.check("perf 为 null 或 {fps,dpr,tier}", initial.perf === null || typeof initial.perf === "object",
    `实得 ${JSON.stringify(initial.perf)}`);

  // ── 2. 基线复位 ─────────────────────────────────────────────────────────
  await resetToBaseline(session);
  const baseline = await readSnapshot(session);
  reporter.check(
    "closeAll() 后全部部件与灯光为关",
    baseline.parts.every((part) => part.open === false) && baseline.lights.every((light) => light.on === false),
    `parts 开=${baseline.parts.filter((p) => p.open).length} lights 亮=${baseline.lights.filter((l) => l.on).length}`,
  );
  reporter.check(
    "关态 progress 终值为 0",
    baseline.parts.every((part) => Math.abs(part.progress) <= TERMINAL_TOLERANCE),
    `实得 ${JSON.stringify(baseline.parts.map((part) => part.progress))}`,
  );

  // ── 3. 10 个部件逐一驱动 ─────────────────────────────────────────────────
  /** 过渡采样结果：{ id, samples:number[] }，用于集成层的真实动画进度断言 */
  const transitions = [];

  for (const id of PART_IDS) {
    const name = `${labelOf(id)}（${id}）`;

    // 3.1 开：setPart(id, true) → open=true 且 progress 收敛到 1
    await session.evaluate((partId) => window.__carDisplayStore.getState().setPart(partId, true), id);
    const samples = [];
    for (let index = 0; index < SAMPLE_COUNT; index += 1) {
      const snapshot = await readSnapshot(session);
      samples.push(snapshot.parts.find((part) => part.id === id).progress);
      if (samples.at(-1) >= 1 - TERMINAL_TOLERANCE && index >= 2) break;
      await delay(SAMPLE_INTERVAL_MS);
    }
    transitions.push({ id, samples });

    let opened = null;
    try {
      await session.waitFor(
        (partId) => {
          const part = window.__carDisplaySceneAudit().parts.find((entry) => entry.id === partId);
          return part.open && part.progress >= 0.99 ? part : false;
        },
        { timeout: SETTLE_TIMEOUT_MS, interval: 60, label: `${id} 打开后 progress 收敛到 1` },
      );
    } catch (error) {
      reporter.info(`${id} 打开后未在 ${SETTLE_TIMEOUT_MS}ms 内收敛：${error.message.slice(0, 120)}`);
    }
    opened = await readSnapshot(session);

    reporter.check(`${name} 打开：audit.open=true`, opened?.parts.find((part) => part.id === id)?.open === true,
      `实得 open=${JSON.stringify(opened?.parts.find((part) => part.id === id)?.open)}`);
    reporter.check(
      `${name} 打开：progress 终值 ≈1`,
      opened !== null && Math.abs(opened.parts.find((part) => part.id === id).progress - 1) <= TERMINAL_TOLERANCE,
      `实得 ${JSON.stringify(opened?.parts.find((part) => part.id === id)?.progress)}`,
    );
    reporter.check(
      `${name} 打开：store.parts 与 audit.open 一致`,
      opened?.state?.parts?.[id] === true,
      `store=${JSON.stringify(opened?.state?.parts?.[id])} audit=${JSON.stringify(opened?.parts.find((part) => part.id === id)?.open)}`,
    );
    reporter.check(
      `${name} 过渡期 progress 恒在 [0,1]`,
      samples.every((value) => typeof value === "number" && value >= 0 && value <= 1),
      `采样 ${JSON.stringify(samples.map((value) => Number(value.toFixed(3))))}`,
    );

    // 3.2 关：setPart(id, false) → open=false 且 progress 收敛到 0
    await session.evaluate((partId) => window.__carDisplayStore.getState().setPart(partId, false), id);
    let closed = null;
    try {
      await session.waitFor(
        (partId) => {
          const part = window.__carDisplaySceneAudit().parts.find((entry) => entry.id === partId);
          return !part.open && part.progress <= 0.01 ? part : false;
        },
        { timeout: SETTLE_TIMEOUT_MS, interval: 60, label: `${id} 关闭后 progress 收敛到 0` },
      );
    } catch (error) {
      reporter.info(`${id} 关闭后未在 ${SETTLE_TIMEOUT_MS}ms 内收敛：${error.message.slice(0, 120)}`);
    }
    closed = await readSnapshot(session);
    reporter.check(
      `${name} 关闭：audit.open=false 且 progress 终值 ≈0`,
      closed !== null && closed.parts.find((part) => part.id === id).open === false &&
        Math.abs(closed.parts.find((part) => part.id === id).progress) <= TERMINAL_TOLERANCE,
      `实得 open=${JSON.stringify(closed?.parts.find((part) => part.id === id)?.open)} progress=${JSON.stringify(closed?.parts.find((part) => part.id === id)?.progress)}`,
    );
  }

  // ── 4. 集成层：progress 是否反映真实动画（需 T5 注册 parts 源）────────────
  const fractional = transitions.find((entry) =>
    entry.samples.some((value) => value > TERMINAL_TOLERANCE && value < 1 - TERMINAL_TOLERANCE),
  );
  const geometryRegistered = (baseline.parts ?? []).some((part) => Array.isArray(part.bbox));
  if (fractional) {
    reporter.pass(
      "集成层：过渡期采到真实动画进度（0<progress<1）",
      `${labelOf(fractional.id)} 采样 ${JSON.stringify(fractional.samples.map((value) => Number(value.toFixed(3))))}`,
    );
  } else if (!geometryRegistered) {
    reporter.skip(
      "集成层：过渡期采到真实动画进度（0<progress<1）",
      "T5 未集成（parts[].bbox 全为 null，未注册 parts 审计源）——契约层 progress 缺省为 open?1:0",
    );
  } else {
    reporter.fail(
      "集成层：过渡期采到真实动画进度（0<progress<1）",
      "T5 已注册 parts 源（bbox 非 null）但 progress 未反映动画过程，疑似仍为 open?1:0 缺省值",
    );
  }

  // ── 5. 2 个灯光逐一驱动 ──────────────────────────────────────────────────
  for (const id of LIGHT_IDS) {
    await session.evaluate((lightId) => window.__carDisplayStore.getState().setLight(lightId, true), id);
    const on = await readSnapshot(session);
    reporter.check(`灯光 ${id} 打开：audit.lights[].on=true`,
      on.lights.find((light) => light.id === id)?.on === true,
      `实得 ${JSON.stringify(on.lights.find((light) => light.id === id)?.on)}`);
    reporter.check(`灯光 ${id} 打开：store.lights 与 audit 一致`, on.state?.lights?.[id] === true,
      `store=${JSON.stringify(on.state?.lights?.[id])}`);

    await session.evaluate((lightId) => window.__carDisplayStore.getState().toggleLight(lightId), id);
    const off = await readSnapshot(session);
    reporter.check(`灯光 ${id} toggleLight 关闭：audit.lights[].on=false`,
      off.lights.find((light) => light.id === id)?.on === false,
      `实得 ${JSON.stringify(off.lights.find((light) => light.id === id)?.on)}`);
  }

  // ── 6. 分组与全局动作（§13.2）────────────────────────────────────────────
  await resetToBaseline(session);
  await session.evaluate(() => window.__carDisplayStore.getState().openGroup("windows"));
  const windowsOpen = await readSnapshot(session);
  reporter.check(
    "openGroup('windows')：4 个车窗全开、其余部件保持关闭",
    PART_GROUP_IDS.windows.every((id) => windowsOpen.parts.find((part) => part.id === id).open === true) &&
      [...PART_GROUP_IDS.doors, ...PART_GROUP_IDS.closures].every(
        (id) => windowsOpen.parts.find((part) => part.id === id).open === false,
      ),
    `开=${JSON.stringify(windowsOpen.parts.filter((part) => part.open).map((part) => part.id))}`,
  );

  await session.evaluate(() => window.__carDisplayStore.getState().openGroup("doors"));
  await session.evaluate(() => window.__carDisplayStore.getState().openGroup("closures"));
  const allOpen = await readSnapshot(session);
  reporter.check("openGroup 三个分组后：10 个部件全开", allOpen.parts.every((part) => part.open === true),
    `开=${allOpen.parts.filter((part) => part.open).length}/10`);

  await session.evaluate(() => {
    const state = window.__carDisplayStore.getState();
    state.setLight("headlight", true);
    state.setLight("taillight", true);
  });
  await session.evaluate(() => window.__carDisplayStore.getState().closeAll());
  const closedAll = await readSnapshot(session);
  reporter.check(
    "closeAll()：10 个部件 + 2 个灯光全部复位",
    closedAll.parts.every((part) => part.open === false) && closedAll.lights.every((light) => light.on === false),
    `部件开=${closedAll.parts.filter((part) => part.open).length} 灯亮=${closedAll.lights.filter((light) => light.on).length}`,
  );

  // ── 7. 非法 id 必须被拒绝且不污染状态（§13.2 校验策略）──────────────────
  const before = await readSnapshot(session);
  await session.evaluate(() => {
    const state = window.__carDisplayStore.getState();
    state.setPart("window_xx", true);
    state.setLight("foglight", true);
    state.setCameraView("top");
  });
  const after = await readSnapshot(session);
  reporter.check(
    "未知 id 不写入状态：parts 恒 10 键 / lights 恒 2 键",
    Object.keys(after.state.parts).length === 10 && Object.keys(after.state.lights).length === 2,
    `parts=${Object.keys(after.state.parts).length} lights=${Object.keys(after.state.lights).length}`,
  );
  reporter.check(
    "未知 id 不改变 audit 终态",
    JSON.stringify(after.parts) === JSON.stringify(before.parts) && after.cameraView === before.cameraView,
    `cameraView ${JSON.stringify(before.cameraView)} → ${JSON.stringify(after.cameraView)}`,
  );

  // ── 8. 页面运行期异常 ────────────────────────────────────────────────────
  reporter.check(
    "运行期无未捕获异常 / console.error",
    session.events.exceptions.length === 0 && session.events.consoleErrors.length === 0,
    `exceptions=${JSON.stringify(session.events.exceptions.slice(0, 3))} consoleErrors=${JSON.stringify(session.events.consoleErrors.slice(0, 3))}`,
  );

  return { transitions, pageEvents: session.events };
});
