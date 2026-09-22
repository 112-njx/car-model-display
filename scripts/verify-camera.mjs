/**
 * scripts/verify-camera.mjs —— 相机预设、环绕与待机自转的自动化验证（roadmap §11.1 T9④）
 *
 * 做法：经 `window.__carDisplayStore` 驱动 `setCameraView` / `orbitOnce` / `setAutoRotate` /
 * `bumpInteraction`，读 `window.__carDisplayCameraAudit()` 的
 * `view / position / target / distance / autoRotating / orbiting` 断言。
 *
 * 只依赖 §13.3 冻结钩子。分层（与其余三个脚本同一口径）：
 *   · 契约层：`view` 跟随 store、`cameraCommand.token` 自增、`sceneAudit().autoRotate` 跟随 store
 *     —— contract-v1 上即可跑绿
 *   · 集成层：机位真的移动、环绕一周回正、待机自转与交互即停 —— 需 T7 注册相机 position；
 *     未注册时明确标 SKIP，不假绿
 *
 * 用法：
 *   node scripts/verify-camera.mjs --base-url=http://127.0.0.1:5181/
 *   node scripts/verify-camera.mjs --fast        # 跳过待机自转（需等 8s 的慢用例）
 *   node scripts/verify-camera.mjs --report=%TEMP%/verify-camera.json --strict
 */

import {
  CAMERA_VIEW_IDS,
  INTERACTION,
  readSnapshot,
  resetToBaseline,
  run,
  delay,
  waitForHooks,
  waitForIntegrationSignals,
  classifyRuntimeNoise,
  checkNoReload,
} from "./lib/cdp.mjs";

const SAMPLING_INTERVAL_MS = 100;
/** 预设切换的收敛等待 */
const PRESET_SETTLE_MS = 1800;

const distanceBetween = (a, b) => (a && b ? Math.hypot(...a.map((value, index) => value - b[index])) : null);

/** 连续采样相机审计，返回时间序列（用于判断「是否真的在动」「是否回正」） */
async function sampleCamera(session, durationMs, intervalMs = SAMPLING_INTERVAL_MS) {
  const samples = [];
  const startedAt = Date.now();
  while (Date.now() - startedAt < durationMs) {
    const snapshot = await readSnapshot(session);
    samples.push({ at: Date.now() - startedAt, camera: snapshot.camera, autoRotate: snapshot.autoRotate });
    await delay(intervalMs);
  }
  return samples;
}

await run("verify-camera", async ({ session, reporter, options }) => {
  const initial = await waitForHooks(session);
  const signals = await waitForIntegrationSignals(session, { require: ["cameraRig"] });
  reporter.info(`集成信号：${JSON.stringify(signals)}`);

  // ── 1. CameraAudit 结构（§13.3③）────────────────────────────────────────
  const camera = initial.camera;
  reporter.check("__carDisplayCameraAudit() 返回对象", camera !== null && typeof camera === "object", `实得 ${JSON.stringify(camera)}`);
  reporter.check("cameraAudit.view 为字符串或 null", camera === null || typeof camera.view === "string" || camera.view === null, `实得 ${JSON.stringify(camera?.view)}`);
  reporter.check(
    "cameraAudit.position/target 为 3 元数组或 null",
    [camera?.position, camera?.target].every(
      (value) => value === null || (Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)),
    ),
    `position=${JSON.stringify(camera?.position)} target=${JSON.stringify(camera?.target)}`,
  );
  reporter.check("cameraAudit.distance 为有限数或 null", camera?.distance === null || Number.isFinite(camera?.distance), `实得 ${JSON.stringify(camera?.distance)}`);
  reporter.check("cameraAudit.autoRotating 为布尔", typeof camera?.autoRotating === "boolean", `实得 ${JSON.stringify(camera?.autoRotating)}`);
  reporter.check("cameraAudit.orbiting 为布尔", typeof camera?.orbiting === "boolean", `实得 ${JSON.stringify(camera?.orbiting)}`);

  // ── 2. 契约层：4 个预设 view 跟随 store ──────────────────────────────────
  await resetToBaseline(session);
  for (const view of CAMERA_VIEW_IDS) {
    await session.evaluate((viewId) => window.__carDisplayStore.getState().setCameraView(viewId), view);
    await delay(200);
    const snapshot = await readSnapshot(session);
    reporter.check(
      `setCameraView('${view}') → cameraAudit.view 跟随`,
      snapshot.camera.view === view,
      `实得 view=${JSON.stringify(snapshot.camera.view)}`,
    );
    reporter.check(
      `setCameraView('${view}') → sceneAudit.cameraView 与 store 一致`,
      snapshot.cameraView === view && snapshot.state.cameraView === view,
      `sceneAudit=${JSON.stringify(snapshot.cameraView)} store=${JSON.stringify(snapshot.state.cameraView)}`,
    );
  }

  // ── 3. 契约层：orbitOnce 的 token 自增（同一命令可重复触发）──────────────
  const beforeOrbit = await readSnapshot(session);
  await session.evaluate(() => window.__carDisplayStore.getState().orbitOnce());
  const afterOrbit = await readSnapshot(session);
  reporter.check(
    "orbitOnce() → cameraCommand.type='orbit-once'",
    afterOrbit.state.cameraCommand.type === "orbit-once",
    `实得 ${JSON.stringify(afterOrbit.state.cameraCommand)}`,
  );
  reporter.check(
    "orbitOnce() → cameraCommand.token 自增",
    afterOrbit.state.cameraCommand.token === beforeOrbit.state.cameraCommand.token + 1,
    `token ${beforeOrbit.state.cameraCommand.token} → ${afterOrbit.state.cameraCommand.token}`,
  );
  await session.evaluate(() => window.__carDisplayStore.getState().orbitOnce());
  const afterOrbitAgain = await readSnapshot(session);
  reporter.check(
    "orbitOnce() 可重复触发：token 再次自增",
    afterOrbitAgain.state.cameraCommand.token === afterOrbit.state.cameraCommand.token + 1,
    `token ${afterOrbit.state.cameraCommand.token} → ${afterOrbitAgain.state.cameraCommand.token}`,
  );

  // ── 4. 契约层：autoRotate 状态片与 sceneAudit 一致 ───────────────────────
  await session.evaluate(() => window.__carDisplayStore.getState().setAutoRotate(true));
  const rotateOn = await readSnapshot(session);
  reporter.check("setAutoRotate(true) → sceneAudit.autoRotate=true", rotateOn.autoRotate === true, `实得 ${JSON.stringify(rotateOn.autoRotate)}`);
  await session.evaluate(() => window.__carDisplayStore.getState().setAutoRotate(false));
  const rotateOff = await readSnapshot(session);
  reporter.check("setAutoRotate(false) → sceneAudit.autoRotate=false", rotateOff.autoRotate === false, `实得 ${JSON.stringify(rotateOff.autoRotate)}`);

  // ── 5. 集成门禁：机位由 T7 注册 ─────────────────────────────────────────
  if (!signals.cameraRig) {
    reporter.skip(
      "集成层：预设机位移动 / 环绕一周回正 / 待机自转与交互即停",
      "T7 未集成：cameraAudit.position 为 null（未注册相机审计源）。契约层断言已全绿，T7 合并后重跑。",
    );
    return { signals, layer: "contract-only" };
  }

  // ── 6. 集成层：预设切换真的把相机移到位 ─────────────────────────────────
  await resetToBaseline(session);
  const presetPositions = {};
  for (const view of CAMERA_VIEW_IDS) {
    await session.evaluate((viewId) => window.__carDisplayStore.getState().setCameraView(viewId), view);
    await delay(PRESET_SETTLE_MS);
    const settled = await readSnapshot(session);
    presetPositions[view] = settled.camera.position;
    reporter.check(
      `预设 '${view}'：机位为有限 3 元数组且 distance>0`,
      Array.isArray(settled.camera.position) && settled.camera.position.every(Number.isFinite) && settled.camera.distance > 0,
      `position=${JSON.stringify(settled.camera.position?.map((value) => Number(value.toFixed(3))))} distance=${settled.camera.distance?.toFixed(3)}`,
    );
  }
  const pairs = [["hero", "front"], ["hero", "profile"], ["front", "profile"]];
  reporter.check(
    "复位/正面/侧面三个预设的机位互不相同",
    pairs.every(([a, b]) => {
      const delta = distanceBetween(presetPositions[a], presetPositions[b]);
      return delta !== null && delta > 0.5;
    }),
    pairs.map(([a, b]) => `${a}↔${b}=${distanceBetween(presetPositions[a], presetPositions[b])?.toFixed(3)}`).join(" "),
  );

  // ── 7. 集成层：orbit-once 环绕一周并回正 ────────────────────────────────
  await session.evaluate(() => window.__carDisplayStore.getState().setCameraView("hero"));
  await delay(PRESET_SETTLE_MS);
  const orbitStart = (await readSnapshot(session)).camera.position;
  await session.evaluate(() => {
    const state = window.__carDisplayStore.getState();
    state.bumpInteraction();
    state.orbitOnce();
  });
  const orbitSamples = await sampleCamera(session, INTERACTION.orbitOnceDurationMs + 2500);
  const orbitPositions = orbitSamples.map((sample) => sample.camera.position).filter(Boolean);
  const excursion = Math.max(...orbitPositions.map((position) => distanceBetween(position, orbitStart) ?? 0));
  const finalPosition = orbitPositions.at(-1);
  const finalOffset = distanceBetween(finalPosition, orbitStart) ?? Infinity;
  const sawOrbiting = orbitSamples.some((sample) => sample.camera.orbiting === true);
  const settledOrbiting = orbitSamples.slice(-3).every((sample) => sample.camera.orbiting === false);

  reporter.check(
    "「转一下」：环绕期间 cameraAudit.orbiting=true",
    sawOrbiting,
    `采样 ${orbitSamples.length} 次，orbiting=true 出现 ${orbitSamples.filter((sample) => sample.camera.orbiting === true).length} 次`,
  );
  reporter.check(
    "「转一下」：相机确实绕行（最大偏离起始机位 > 0.5）",
    excursion > 0.5,
    `最大偏离 ${excursion.toFixed(3)}`,
  );
  reporter.check(
    "「转一下」：环绕结束后 orbiting=false",
    settledOrbiting,
    `末 3 次采样 orbiting=${JSON.stringify(orbitSamples.slice(-3).map((sample) => sample.camera.orbiting))}`,
  );
  reporter.check(
    "「转一下」：环绕一周后回正（终位接近起始机位）",
    finalOffset < Math.max(excursion * 0.25, 0.5),
    `终位偏离起始 ${finalOffset.toFixed(3)}（最大偏离 ${excursion.toFixed(3)}）`,
  );

  // ── 8. 集成层：待机自转与交互即停 ───────────────────────────────────────
  if (options.fast) {
    reporter.skip(
      "待机自转：空闲后启动 / 交互即停",
      `--fast 已跳过（该用例需等待 idleAutoRotateDelayMs=${INTERACTION.idleAutoRotateDelayMs}ms）`,
    );
  } else {
    await session.evaluate(() => {
      const state = window.__carDisplayStore.getState();
      state.setCameraView("hero");
      state.setAutoRotate(false);
      state.bumpInteraction();
    });
    await delay(PRESET_SETTLE_MS);
    const idleStart = (await readSnapshot(session)).camera.position;

    // 8.1 空闲到阈值后应自动启动
    const idleSamples = await sampleCamera(session, INTERACTION.idleAutoRotateDelayMs + 5000);
    const idleOnset = idleSamples.find((sample) => sample.camera.autoRotating === true);
    reporter.check(
      `待机自转：空闲约 ${INTERACTION.idleAutoRotateDelayMs}ms 后 autoRotating=true`,
      Boolean(idleOnset),
      idleOnset
        ? `首次观测到 autoRotating=true 于 ${idleOnset.at}ms`
        : `采样 ${idleSamples.length} 次（${INTERACTION.idleAutoRotateDelayMs + 5000}ms）始终为 false`,
    );

    if (idleOnset) {
      const afterOnset = idleSamples.filter((sample) => sample.at > idleOnset.at && sample.camera.position);
      const drift = Math.max(...afterOnset.map((sample) => distanceBetween(sample.camera.position, idleStart) ?? 0));
      reporter.check("待机自转：相机确实在转动（机位发生变化）", drift > 0.1, `机位最大变化 ${drift.toFixed(3)}`);

      // 8.2 交互即停
      await session.evaluate(() => window.__carDisplayStore.getState().bumpInteraction());
      await delay(600);
      const afterBump = await readSnapshot(session);
      reporter.check(
        "交互即停：bumpInteraction() 后 autoRotating=false",
        afterBump.camera.autoRotating === false,
        `实得 autoRotating=${JSON.stringify(afterBump.camera.autoRotating)}`,
      );
    }

    // 8.3 指针拖拽即停 + 拖拽旋转仍可用（继承能力）
    await session.evaluate(() => {
      const state = window.__carDisplayStore.getState();
      state.setAutoRotate(true);
      state.bumpInteraction();
    });
    await delay(400);
    const canvas = await session.evaluate(() => {
      const rect = document.querySelector("canvas")?.getBoundingClientRect();
      return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
    });
    if (!canvas) {
      reporter.fail("指针拖拽旋转可用", "页面中找不到 canvas 元素");
    } else {
      const center = { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
      const beforeDrag = await readSnapshot(session);
      await session.mouse.drag(center, { x: center.x + 120, y: center.y + 20 });
      await delay(500);
      const afterDrag = await readSnapshot(session);
      const moved = distanceBetween(afterDrag.camera.position, beforeDrag.camera.position) ?? 0;
      reporter.check("指针拖拽旋转可用（机位随拖拽改变）", moved > 0.05, `机位变化 ${moved.toFixed(4)}`);
      reporter.check(
        "指针拖拽即停自转：拖拽后 autoRotating=false",
        afterDrag.camera.autoRotating === false,
        `实得 autoRotating=${JSON.stringify(afterDrag.camera.autoRotating)}`,
      );
    }
  }

  // ── 8.5 本轮是否被中途重载 ──────────────────────────────────────────────
  // 重载会清空相机与 store 状态（T8 同时在改代码时 Vite 会整页刷新），本轮结果不可信。
  checkNoReload(reporter, session);

  // ── 9. 页面运行期异常 ───────────────────────────────────────────────────
  // 经负责人裁定的已知偏差（见 scripts/lib/cdp.mjs 的 KNOWN_DEVIATIONS）单独标注，不并入 PASS；
  // 其余任何异常仍然 FAIL —— 本断言**只**对登记在册的窄特征放行，不遮蔽回归。
  const { known: knownExceptions, unknown: unknownExceptions } = classifyRuntimeNoise(
    reporter,
    session.events.exceptions,
  );
  reporter.check(
    "运行期无非已知偏差的未捕获异常 / console.error",
    unknownExceptions.length === 0 && session.events.consoleErrors.length === 0,
    `非已知偏差异常=${JSON.stringify(unknownExceptions.slice(0, 3))} consoleErrors=${JSON.stringify(session.events.consoleErrors.slice(0, 3))}` +
      (knownExceptions.length ? `（另有 ${knownExceptions.length} 条已裁定偏差，见 KNOWN 明细）` : ""),
  );

  return { signals, presetPositions, layer: "contract+integration" };
});
