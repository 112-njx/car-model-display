/**
 * scripts/verify-pick.mjs —— 3D 点击拾取控车的自动化验证（roadmap §11.1 T9②）
 *
 * 做法：读 `window.__carDisplaySceneAudit().hitTargets[]` 的 `screen` 屏幕坐标，
 * 经 CDP `Input.dispatchMouseEvent` / `Input.dispatchTouchEvent` 派发**真实指针事件**，
 * 断言部件开合翻转。必含「拖拽位移不触发点击」用例（§13.1 INTERACTION.tapMaxMovePx）。
 *
 * 只依赖 §13.3 冻结钩子。`hitTargets` 由 T5 注册，未注册时为 `[]` —— 此时**整体 SKIP**
 * 并打印原因（不假绿），而不是 FAIL。用例：
 *   ① hitTargets 结构合法性（id 必须来自 §13.1、坐标须在视口内、尺寸为正）
 *   ② 每个部件/灯光：鼠标点击 → 开合翻转 → 再点一次 → 翻回
 *   ③ 拖拽位移 > tapMaxMovePx 不触发点击（且应真的转动了相机）
 *   ④ 长按 > tapMaxDurationMs 不触发点击
 *   ⑤ 触摸点按 → 开合翻转；触摸拖拽 → 不触发
 *   ⑥ 命中即反馈：bumpInteraction 推进 lastInteractionAt + pushToast
 *
 * 用法：
 *   node scripts/verify-pick.mjs --base-url=http://127.0.0.1:5181/
 *   node scripts/verify-pick.mjs --mobile          # 手机视口（375×812）
 *   node scripts/verify-pick.mjs --report=%TEMP%/verify-pick.json --strict
 */

import {
  PART_IDS,
  LIGHT_IDS,
  INTERACTION,
  labelOf,
  readSnapshot,
  resetToBaseline,
  run,
  delay,
  waitForHooks,
  waitForIntegrationSignals,
} from "./lib/cdp.mjs";

/** 拖拽距离：取冻结阈值的 10 倍，确保远超 tapMaxMovePx=6 */
const DRAG_DISTANCE_PX = INTERACTION.tapMaxMovePx * 10;
/** 长按时长：取冻结阈值的 2 倍，确保远超 tapMaxDurationMs=300 */
const LONG_PRESS_MS = INTERACTION.tapMaxDurationMs * 2;
/** 一次点击后等待状态落定的时间 */
const SETTLE_MS = 900;

const knownIds = new Set([...PART_IDS, ...LIGHT_IDS]);

await run("verify-pick", async ({ session, reporter, options }) => {
  const initial = await waitForHooks(session);

  // ── 0. 集成门禁：hitTargets 由 T5 注册 ──────────────────────────────────
  const signals = await waitForIntegrationSignals(session);
  reporter.info(`集成信号：${JSON.stringify(signals)}`);
  if (!signals.pick) {
    reporter.skip(
      "verify-pick 全部用例",
      "T5 未集成：hitTargets 为空数组（§13.3 规定未注册时为 []）。" +
        "本脚本对「符合契约但尚未接入拾取」的页面不做假绿判定；T5 合并后重跑。",
    );
    return { signals, skippedAll: true };
  }

  // ── 1. hitTargets 结构合法性 ────────────────────────────────────────────
  const snapshot = await readSnapshot(session);
  const targets = snapshot.hitTargets;
  reporter.info(`hitTargets ${targets.length} 项：${targets.map((target) => target.id).join(", ")}`);
  reporter.check(
    "每个 hitTarget 均含 {id,center,size,screen} 且类型正确",
    targets.every(
      (target) =>
        typeof target.id === "string" &&
        Array.isArray(target.center) && target.center.length === 3 && target.center.every(Number.isFinite) &&
        Array.isArray(target.size) && target.size.length === 3 && target.size.every((value) => Number.isFinite(value) && value > 0) &&
        target.screen && Number.isFinite(target.screen.x) && Number.isFinite(target.screen.y),
    ),
    `首项 ${JSON.stringify(targets[0])}`,
  );
  reporter.check(
    "hitTargets[].id 全部来自 §13.1（PARTS ∪ LIGHTS）",
    targets.every((target) => knownIds.has(target.id)),
    `越界 id：${JSON.stringify(targets.filter((target) => !knownIds.has(target.id)).map((target) => target.id))}`,
  );
  reporter.check(
    "10 个部件全部有命中目标",
    PART_IDS.every((id) => targets.some((target) => target.id === id)),
    `缺失：${JSON.stringify(PART_IDS.filter((id) => !targets.some((target) => target.id === id)))}`,
  );
  reporter.check(
    "hitTargets[].screen 坐标在视口内",
    targets.every(
      (target) => target.screen.x >= 0 && target.screen.y >= 0 &&
        target.screen.x <= options.width && target.screen.y <= options.height,
    ),
    `越界：${JSON.stringify(targets.filter((t) => t.screen.x < 0 || t.screen.y < 0 || t.screen.x > options.width || t.screen.y > options.height).map((t) => `${t.id}(${Math.round(t.screen.x)},${Math.round(t.screen.y)})`))}`,
  );

  /** 每次点击前重读坐标：部件开合会移动几何，屏幕坐标随之变化 */
  const locate = async (id) => {
    const current = await readSnapshot(session);
    return current.hitTargets?.find((target) => target.id === id) ?? null;
  };

  await resetToBaseline(session);

  // ── 2. 每个部件：点击 → 开合翻转 → 再点 → 翻回 ──────────────────────────
  for (const id of PART_IDS) {
    const name = `${labelOf(id)}（${id}）`;
    const target = await locate(id);
    if (!target) {
      reporter.skip(`${name} 点击开合`, "hitTargets 中无该部件（可能被遮挡或未建立命中体）");
      continue;
    }

    await session.mouse.click(target.screen.x, target.screen.y);
    await delay(SETTLE_MS);
    const opened = await readSnapshot(session);
    const openedPart = opened.parts.find((part) => part.id === id);
    reporter.check(
      `${name} 鼠标点击：open 由 false 翻转为 true`,
      openedPart.open === true,
      `点击 (${Math.round(target.screen.x)},${Math.round(target.screen.y)}) 后 open=${JSON.stringify(openedPart.open)} progress=${openedPart.progress.toFixed(3)}`,
    );

    // 再点一次翻回；部件打开后几何已移动，必须重读坐标
    const again = await locate(id);
    if (!again) {
      reporter.skip(
        `${name} 再次点击关闭`,
        "部件打开后 hitTargets 中不再出现该 id（无法再点中）——T5 命中体设计待确认，已用 store 复位",
      );
      await session.evaluate((partId) => window.__carDisplayStore.getState().setPart(partId, false), id);
      await delay(SETTLE_MS);
      continue;
    }
    await session.mouse.click(again.screen.x, again.screen.y);
    await delay(SETTLE_MS);
    const closed = await readSnapshot(session);
    reporter.check(
      `${name} 再次点击：open 由 true 翻回 false`,
      closed.parts.find((part) => part.id === id).open === false,
      `点击 (${Math.round(again.screen.x)},${Math.round(again.screen.y)}) 后 open=${JSON.stringify(closed.parts.find((part) => part.id === id).open)}`,
    );
  }

  // ── 3. 灯光命中（T5 若为灯光建立命中体）────────────────────────────────
  const lightTargets = (await readSnapshot(session)).hitTargets.filter((target) => LIGHT_IDS.includes(target.id));
  if (lightTargets.length === 0) {
    reporter.skip("灯光命中目标点击", "hitTargets 中无灯光项（§11.1 T5 未强制要求为灯光建立命中体）");
  } else {
    for (const target of lightTargets) {
      await session.mouse.click(target.screen.x, target.screen.y);
      await delay(SETTLE_MS);
      const clicked = await readSnapshot(session);
      reporter.check(
        `灯光 ${target.id} 点击：on 翻转为 true`,
        clicked.lights.find((light) => light.id === target.id)?.on === true,
        `实得 ${JSON.stringify(clicked.lights.find((light) => light.id === target.id)?.on)}`,
      );
      await session.evaluate((lightId) => window.__carDisplayStore.getState().setLight(lightId, false), target.id);
      await delay(200);
    }
  }

  // ── 4. 拖拽位移不触发点击（核心负向用例）───────────────────────────────
  const dragId = PART_IDS.find((id) => id.startsWith("door_")) ?? PART_IDS[0];
  const dragTarget = await locate(dragId);
  if (!dragTarget) {
    reporter.skip("拖拽位移不触发点击", `hitTargets 中无 ${dragId}`);
  } else {
    await resetToBaseline(session);
    const from = { x: dragTarget.screen.x, y: dragTarget.screen.y };
    const to = { x: from.x + DRAG_DISTANCE_PX, y: from.y + 12 };
    const cameraBefore = (await readSnapshot(session)).camera;

    await session.mouse.drag(from, to);
    await delay(SETTLE_MS);

    const afterDrag = await readSnapshot(session);
    reporter.check(
      `拖拽 ${DRAG_DISTANCE_PX}px（> tapMaxMovePx=${INTERACTION.tapMaxMovePx}）不触发点击`,
      afterDrag.parts.find((part) => part.id === dragId).open === false,
      `${labelOf(dragId)} open=${JSON.stringify(afterDrag.parts.find((part) => part.id === dragId).open)}（期望 false）`,
    );
    reporter.check(
      "拖拽期间无部件被误开",
      afterDrag.parts.every((part) => part.open === false),
      `被误开：${JSON.stringify(afterDrag.parts.filter((part) => part.open).map((part) => part.id))}`,
    );

    if (Array.isArray(cameraBefore?.position) && Array.isArray(afterDrag.camera?.position)) {
      const moved = Math.hypot(
        ...afterDrag.camera.position.map((value, index) => value - cameraBefore.position[index]),
      );
      reporter.check(
        "拖拽确实转动了相机（证明确实发生了拖拽而非事件被吞）",
        moved > 0.05,
        `相机位移 ${moved.toFixed(4)}`,
      );
    } else {
      reporter.skip("拖拽确实转动了相机", "T7 未注册相机 position（无法读取机位）");
    }
  }

  // ── 5. 长按不触发点击 ───────────────────────────────────────────────────
  const pressTarget = await locate(PART_IDS[0]);
  if (!pressTarget) {
    reporter.skip("长按不触发点击", `hitTargets 中无 ${PART_IDS[0]}`);
  } else {
    await resetToBaseline(session);
    const point = { x: pressTarget.screen.x, y: pressTarget.screen.y };
    await session.mouse.move(point.x, point.y);
    await session.mouse.press(point.x, point.y);
    await delay(LONG_PRESS_MS);
    await session.mouse.release(point.x, point.y);
    await delay(SETTLE_MS);
    const afterPress = await readSnapshot(session);
    reporter.check(
      `长按 ${LONG_PRESS_MS}ms（> tapMaxDurationMs=${INTERACTION.tapMaxDurationMs}）不触发点击`,
      afterPress.parts.find((part) => part.id === PART_IDS[0]).open === false,
      `${labelOf(PART_IDS[0])} open=${JSON.stringify(afterPress.parts.find((part) => part.id === PART_IDS[0]).open)}（期望 false）`,
    );
  }

  // ── 6. 触摸点按 / 触摸拖拽 ──────────────────────────────────────────────
  const touchId = PART_IDS[0];
  const touchTarget = await locate(touchId);
  if (!touchTarget) {
    reporter.skip("触摸点按开合", `hitTargets 中无 ${touchId}`);
  } else {
    await resetToBaseline(session);
    await session.touch.tap(touchTarget.screen.x, touchTarget.screen.y);
    await delay(SETTLE_MS);
    const afterTap = await readSnapshot(session);
    reporter.check(
      `${labelOf(touchId)} 触摸点按：open 翻转为 true`,
      afterTap.parts.find((part) => part.id === touchId).open === true,
      `实得 open=${JSON.stringify(afterTap.parts.find((part) => part.id === touchId).open)}`,
    );

    await resetToBaseline(session);
    const touchFrom = { x: touchTarget.screen.x, y: touchTarget.screen.y };
    await session.touch.drag(touchFrom, { x: touchFrom.x + DRAG_DISTANCE_PX, y: touchFrom.y + 12 });
    await delay(SETTLE_MS);
    const afterTouchDrag = await readSnapshot(session);
    reporter.check(
      `触摸拖拽 ${DRAG_DISTANCE_PX}px 不触发点击`,
      afterTouchDrag.parts.every((part) => part.open === false),
      `被误开：${JSON.stringify(afterTouchDrag.parts.filter((part) => part.open).map((part) => part.id))}`,
    );
  }

  // ── 7. 命中即反馈：bumpInteraction + pushToast（§11.1 T5⑤）──────────────
  await resetToBaseline(session);
  const feedbackTarget = await locate(PART_IDS.find((id) => id.startsWith("door_")) ?? PART_IDS[0]);
  if (!feedbackTarget) {
    reporter.skip("命中即反馈（bumpInteraction + toast）", "无可点中的命中目标");
  } else {
    const before = await readSnapshot(session);
    await session.mouse.click(feedbackTarget.screen.x, feedbackTarget.screen.y);
    await delay(SETTLE_MS);
    const after = await readSnapshot(session);
    reporter.check(
      "点击后 bumpInteraction 推进 lastInteractionAt",
      after.state.lastInteractionAt > before.state.lastInteractionAt,
      `${before.state.lastInteractionAt} → ${after.state.lastInteractionAt}`,
    );
    reporter.check(
      "点击后 pushToast 产生中文反馈",
      after.state.toast.length > before.state.toast.length &&
        after.state.toast.every((item) => typeof item.text === "string" && item.text.length > 0),
      `toast 数 ${before.state.toast.length} → ${after.state.toast.length}，末条 ${JSON.stringify(after.state.toast.at(-1)?.text)}`,
    );
  }

  // ── 8. 页面运行期异常 ───────────────────────────────────────────────────
  reporter.check(
    "运行期无未捕获异常 / console.error",
    session.events.exceptions.length === 0 && session.events.consoleErrors.length === 0,
    `exceptions=${JSON.stringify(session.events.exceptions.slice(0, 3))} consoleErrors=${JSON.stringify(session.events.consoleErrors.slice(0, 3))}`,
  );

  return { signals, targetCount: targets.length };
});
