/**
 * scripts/verify-voice.mjs —— 语音控车的自动化验证（roadmap §11.1 T9③）
 *
 * 做法：经 `window.__carDisplayVoiceInject(ctor)` 注入
 * `scripts/mocks/speech-recognition-mock.js`，回放 §6 全部指令集，
 * 断言 store 动作（parts / lights / cameraView / cameraCommand）与 toast；
 * 最后传 `null` 恢复真实实现并断言 `voice.supported` 复原（§13.3④）。
 *
 * 只依赖 §13.3 冻结钩子。T6 未集成（`__carDisplayVoiceInject` 不存在）时**整体 SKIP**
 * —— T2 刻意未提供 stub，正是为了让本脚本不拿到假绿（见 store-contract.md §4.6）。
 *
 * 用法：
 *   node scripts/verify-voice.mjs --base-url=http://127.0.0.1:5181/
 *   node scripts/verify-voice.mjs --report=%TEMP%/verify-voice.json --strict
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  PART_IDS,
  PART_GROUP_IDS,
  LIGHT_IDS,
  VOICE_STATUSES,
  readSnapshot,
  resetToBaseline,
  run,
  delay,
  waitForHooks,
  waitForIntegrationSignals,
  classifyRuntimeNoise,
  checkNoReload,
} from "./lib/cdp.mjs";

const MOCK_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "mocks", "speech-recognition-mock.js");
/** 单条指令执行后的最长等待（语音链路含识别→解析→执行→toast，比同步 action 慢） */
const COMMAND_TIMEOUT_MS = 3000;

const allClosed = (ids) => Object.fromEntries(ids.map((id) => [id, false]));
const opened = (ids) => Object.fromEntries(ids.map((id) => [id, true]));

/**
 * §6 指令集 + §12.3 T6 的别名/范围词，逐条给出**完整期望状态**（全量比对，
 * 能抓出「打开车窗」把车门也开了这类过度触发）。`before` 为用例前置状态。
 */
const CASES = [
  { say: "打开车窗", note: "§6 全部车窗开", after: { parts: opened(PART_GROUP_IDS.windows) } },
  {
    say: "关闭车窗",
    note: "§6 全部车窗合",
    before: { parts: opened(PART_GROUP_IDS.windows) },
    after: { parts: allClosed(PART_IDS) },
  },
  { say: "打开左前门", note: "§6 指定车门开", after: { parts: opened(["door_lf"]) } },
  {
    say: "关闭右后门",
    note: "§6 指定车门合",
    before: { parts: opened(["door_rr"]) },
    after: { parts: allClosed(PART_IDS) },
  },
  { say: "打开前备箱", note: "§6 前备箱开", after: { parts: opened(["frunk"]) } },
  { say: "打开后备箱", note: "§6 后备箱开", after: { parts: opened(["trunk"]) } },
  { say: "打开大灯", note: "§6 大灯开", after: { lights: { headlight: true, taillight: false } } },
  {
    say: "关闭大灯",
    note: "§6 大灯关",
    before: { lights: { headlight: true, taillight: false } },
    after: { lights: allClosed(LIGHT_IDS) },
  },
  { say: "打开尾灯", note: "§13.1 LIGHTS 尾灯（别名：后灯/刹车灯）", after: { lights: { headlight: false, taillight: true } } },
  { say: "转一下", note: "§6 视角环绕一周", after: { orbitOnce: true } },
  { say: "看侧面", note: "§6 看侧面", after: { cameraView: "profile" } },
  { say: "看正面", note: "§6 看正面", after: { cameraView: "front" } },
  { say: "复位", note: "§12.3 T6 复位视角", after: { cameraView: "hero" } },
  {
    say: "全部关闭",
    note: "§6 复位所有部件与灯光",
    before: { parts: opened(PART_IDS), lights: { headlight: true, taillight: true } },
    after: { parts: allClosed(PART_IDS), lights: allClosed(LIGHT_IDS) },
  },
  { say: "打开全部车门", note: "§12.3 T6 范围词「全部」", after: { parts: opened(PART_GROUP_IDS.doors) } },
  { say: "打开所有玻璃", note: "§13.1 别名「玻璃」+ 范围词「所有」", after: { parts: opened(PART_GROUP_IDS.windows) } },
  {
    say: "关上左前窗",
    note: "§13.1 别名「左前窗」+ 动词「关上」",
    before: { parts: opened(["window_lf"]) },
    after: { parts: allClosed(PART_IDS) },
  },
  { say: "打开车灯", note: "§13.1 别名「车灯」", after: { lights: { headlight: true, taillight: false } } },
];

/**
 * 把「只列出被打开项」的期望补全为**全量**期望：未列出的部件一律视为关闭。
 *
 * 必要性（R1 轮实测的脚本缺陷）：CASES 里 `opened([...])` 只写被打开的**子集**（如 4 个车窗），
 * 而全量比对要求键数相等 ⇒ 子集与 10 键的实际状态**永远不等**，`matches` 恒为假、
 * 表现为「断言 FAIL 但 diffOf 说状态一致」的自相矛盾。
 * 补全后既修掉该缺陷，又保留「抓过度触发」的严格性（如「打开车窗」若把车门也开了仍会被抓到）。
 */
function normalize(expected, ids) {
  const full = Object.fromEntries(ids.map((id) => [id, false]));
  return { ...full, ...(expected ?? {}) };
}

/** 期望状态与页面快照是否一致（逐键比对，避免 JSON 键序干扰） */
function matches(snapshot, expected) {
  const sameMap = (actual, wanted) =>
    Object.keys(wanted).length === Object.keys(actual ?? {}).length &&
    Object.keys(wanted).every((key) => actual?.[key] === wanted[key]);
  if (expected.parts && !sameMap(snapshot.state.parts, normalize(expected.parts, PART_IDS))) return false;
  if (expected.lights && !sameMap(snapshot.state.lights, normalize(expected.lights, LIGHT_IDS))) return false;
  if (expected.cameraView && snapshot.state.cameraView !== expected.cameraView) return false;
  if (expected.orbitOnce && snapshot.state.cameraCommand?.type !== "orbit-once") return false;
  return true;
}

const diffOf = (snapshot, expected) => {
  const lines = [];
  // 同样补全为全量：否则「某个部件**本应关闭却开着**」这类过度触发/漏复位会漏报
  for (const [key, wanted] of Object.entries(expected.parts ? normalize(expected.parts, PART_IDS) : {})) {
    const actual = snapshot.state.parts?.[key];
    if (actual !== wanted) lines.push(`parts.${key} 期望 ${wanted} 实得 ${actual}`);
  }
  for (const [key, wanted] of Object.entries(expected.lights ? normalize(expected.lights, LIGHT_IDS) : {})) {
    const actual = snapshot.state.lights?.[key];
    if (actual !== wanted) lines.push(`lights.${key} 期望 ${wanted} 实得 ${actual}`);
  }
  if (expected.cameraView && snapshot.state.cameraView !== expected.cameraView) {
    lines.push(`cameraView 期望 ${expected.cameraView} 实得 ${snapshot.state.cameraView}`);
  }
  if (expected.orbitOnce && snapshot.state.cameraCommand?.type !== "orbit-once") {
    lines.push(`cameraCommand.type 期望 orbit-once 实得 ${JSON.stringify(snapshot.state.cameraCommand)}`);
  }
  return lines.slice(0, 4).join("；") || "状态一致";
};

await run("verify-voice", async ({ session, reporter }) => {
  const initial = await waitForHooks(session);
  const signals = await waitForIntegrationSignals(session, { require: ["voice"] });
  reporter.info(`集成信号：${JSON.stringify(signals)}`);

  // ── 0. 集成门禁：注入点由 T6 提供 ───────────────────────────────────────
  if (!signals.voice) {
    reporter.skip(
      "verify-voice 全部用例",
      "T6 未集成：window.__carDisplayVoiceInject 不存在（T2 刻意未提供 stub，" +
        "以免本脚本把「stub 存在」误判为「注入成功」）。T6 合并后重跑。",
    );
    return { signals, skippedAll: true };
  }

  const supportedBefore = initial.state.voice.supported;
  reporter.info(`注入前 voice.supported = ${JSON.stringify(supportedBefore)}，voice.status = ${JSON.stringify(initial.state.voice.status)}`);

  // ── 1. 注入 mock（§13.3④）───────────────────────────────────────────────
  const mockSource = await readFile(MOCK_PATH, "utf8");
  await session.evaluate(mockSource);
  const installed = await session.evaluate(() => typeof window.__carDisplaySpeechRecognitionMock?.Ctor === "function");
  reporter.check("语音 mock 脚本已注入页面并暴露 Ctor", installed === true, `installed=${JSON.stringify(installed)}`);
  if (!installed) return { signals, aborted: "mock 注入失败" };

  await session.evaluate(() => window.__carDisplayVoiceInject(window.__carDisplaySpeechRecognitionMock.Ctor));
  const afterInject = await readSnapshot(session);
  reporter.check(
    "注入 mock 后 voice.supported 变为 true（§13.3④ 硬性要求）",
    afterInject.state.voice.supported === true,
    `实得 ${JSON.stringify(afterInject.state.voice.supported)}`,
  );
  reporter.check(
    "注入后 voice.status 仍属 §13.2 枚举",
    VOICE_STATUSES.includes(afterInject.state.voice.status),
    `实得 ${JSON.stringify(afterInject.state.voice.status)}`,
  );

  // ── 2. 找到「开始识别」的驱动入口 ───────────────────────────────────────
  /**
   * 驱动入口优先级：
   * ① `window.__carDisplayVoiceStart()` —— T8 受理 CHANGELOG 0010（原 T9 建议的方案①）后新增的
   *    **程序化入口**，对已挂载控制器批量下发 start，返回受影响数量（未挂载返回 0、不抛错）。
   *    这是确定性最强的路径，不受 T4/T6 的样式与挂载改动影响，故**优先使用**。
   * ② 退化路径：点 UI 入口（§12.1 冻结的 `cd-voice-` 前缀，或 T8 新增的 `data-testid="cd-voice-toggle"`）。
   *    仅在 ① 不可用（未受理/未挂载）时使用，并在 [INFO] 里注明走了退化路径。
   */
  const triggerVoiceStart = async () => {
    const driven = await session.evaluate(() => {
      if (typeof window.__carDisplayVoiceStart !== "function") return null;
      const affected = window.__carDisplayVoiceStart();
      return { affected, count: window.__carDisplayVoiceControllerCount?.() ?? null };
    });
    if (driven) return { via: "__carDisplayVoiceStart()", ...driven };
    return null;
  };

  /** 退化路径：点 T6/T4 的语音入口（§12.1 冻结的 `cd-voice-` 类名前缀 + T8 的 data-testid） */
  const triggerVoiceEntry = async () => {
    const clicked = await session.evaluate(() => {
      const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const candidates = [...document.querySelectorAll('button, [role="button"], [data-testid="cd-voice-toggle"], [class*="cd-voice"]')]
        .filter((element) => isVisible(element))
        .filter(
          (element) =>
            /cd-voice/i.test(typeof element.className === "string" ? element.className : "") ||
            /语音|麦克风|说话|按下说话/.test(element.textContent ?? "") ||
            /语音|麦克风|说话/.test(element.getAttribute("aria-label") ?? ""),
        );
      const target = candidates[0];
      if (!target) return null;
      target.click();
      return {
        tag: target.tagName,
        className: typeof target.className === "string" ? target.className : "",
        text: (target.textContent ?? "").trim().slice(0, 24),
      };
    });
    if (!clicked) return null;
    // 等实例出现（T6 可能是懒创建）
    const startedAt = Date.now();
    while (Date.now() - startedAt < 3000) {
      if (await session.evaluate(() => window.__carDisplaySpeechRecognitionMock.listening().length > 0)) return clicked;
      await delay(150);
    }
    return clicked;
  };

  let instances = await session.evaluate(() => window.__carDisplaySpeechRecognitionMock.instances.length);
  let entry = null;
  if (instances === 0) {
    // 优先程序化入口（CHANGELOG 0010 方案①）；不可用再退化为点 UI
    entry = await triggerVoiceStart();
    if (!entry) entry = await triggerVoiceEntry();
  }
  instances = await session.evaluate(() => window.__carDisplaySpeechRecognitionMock.instances.length);
  reporter.info(
    `mock 实例数 = ${instances}${entry ? `，驱动入口 ${JSON.stringify(entry)}` : ""}` +
      `，listening = ${await session.evaluate(() => window.__carDisplaySpeechRecognitionMock.listening().length)}`,
  );
  if (entry?.via === "__carDisplayVoiceStart()") {
    reporter.check(
      "程序化驱动入口 __carDisplayVoiceStart() 生效（CHANGELOG 0010 方案①已受理落地）",
      entry.affected > 0,
      `受影响控制器数=${entry.affected}，控制器总数=${entry.count}`,
    );
  }

  if (instances === 0) {
    reporter.skip(
      "§6 指令集回放（18 条）",
      "注入成功但识别实例数为 0：T6 未在无 UI 交互时创建 SpeechRecognition，" +
        "且未能通过 `cd-voice-` 入口点开（见上方 [INFO]）。" +
        "需 T6/T8 提供一个可被自动化驱动的「开始识别」入口（已登记 docs/contracts/CHANGELOG.md）。",
    );
    return { signals, instances };
  }

  // ── 3. 逐条回放 §6 指令集 ───────────────────────────────────────────────
  const caseResults = [];
  for (const item of CASES) {
    const expected = item.after;
    // 3.1 复位 + 前置状态（一律经 store action，不直写 state）
    await resetToBaseline(session);
    if (item.before?.parts || item.before?.lights) {
      await session.evaluate((before) => {
        const state = window.__carDisplayStore.getState();
        for (const [id, open] of Object.entries(before.parts ?? {})) if (open) state.setPart(id, true);
        for (const [id, on] of Object.entries(before.lights ?? {})) if (on) state.setLight(id, true);
      }, item.before);
      await delay(150);
    }

    const before = await readSnapshot(session);
    const deliveriesBefore = await session.evaluate(() => window.__carDisplaySpeechRecognitionMock.deliveries);
    const tokenBefore = before.state.cameraCommand?.token ?? 0;

    // 3.2 回放
    const receivers = await session.evaluate((text) => window.__carDisplaySpeechRecognitionMock.say(text), item.say);

    // 3.3 等状态落定
    const startedAt = Date.now();
    let snapshot = await readSnapshot(session);
    while (!matches(snapshot, expected) && Date.now() - startedAt < COMMAND_TIMEOUT_MS) {
      await delay(100);
      snapshot = await readSnapshot(session);
    }

    const record = {
      say: item.say,
      note: item.note,
      receivers,
      ok: matches(snapshot, expected),
      diff: diffOf(snapshot, expected),
      toast: snapshot.state.toast.map((entry) => entry.text).slice(-2),
      transcript: snapshot.state.voice.transcript,
      lastCommand: snapshot.state.voice.lastCommand,
      deliveriesBefore,
    };
    caseResults.push(record);

    reporter.check(`「${item.say}」→ ${item.note}`, record.ok, record.ok ? `toast=${JSON.stringify(record.toast.at(-1))}` : record.diff);
    reporter.check(`「${item.say}」识别结果已投递到识别链路`, receivers > 0, `收到结果的实例数 ${receivers}`);

    if (expected.orbitOnce) {
      reporter.check(
        `「${item.say}」cameraCommand.token 自增（可重复触发）`,
        snapshot.state.cameraCommand.token > tokenBefore && snapshot.state.cameraCommand.type === "orbit-once",
        `token ${tokenBefore} → ${snapshot.state.cameraCommand.token}`,
      );
    }
    reporter.check(
      `「${item.say}」产生 toast 反馈`,
      snapshot.state.toast.length > before.state.toast.length,
      `toast 数 ${before.state.toast.length} → ${snapshot.state.toast.length}`,
    );
    reporter.check(
      `「${item.say}」写入 voice.transcript`,
      typeof snapshot.state.voice.transcript === "string" && snapshot.state.voice.transcript.length > 0,
      `transcript=${JSON.stringify(snapshot.state.voice.transcript)}`,
    );
    reporter.check(
      `「${item.say}」写入 voice.lastCommand`,
      snapshot.state.voice.lastCommand !== null && snapshot.state.voice.lastCommand !== undefined,
      `lastCommand=${JSON.stringify(snapshot.state.voice.lastCommand)}`,
    );
  }

  // ── 4. 错误路径：权限拒绝（§11.1 T6 降级路径）───────────────────────────
  await resetToBaseline(session);
  // **只在未在听时才 start**：mock 刻意实现为「重复 start() 抛 InvalidStateError」（与真实
  // SpeechRecognition 语义一致，T9-01 已自测）。若链路已经处于 listening，再调一次会直接抛错，
  // 把整个脚本打断 —— R1 轮实测踩过。故先判 listening 再决定是否驱动。
  await session.evaluate(() => {
    const mock = window.__carDisplaySpeechRecognitionMock;
    if (mock.listening().length === 0) mock.instances.at(-1)?.start?.();
  });
  const receiversOnError = await session.evaluate(() => window.__carDisplaySpeechRecognitionMock.fail("not-allowed", "用户拒绝麦克风权限"));
  await delay(400);
  const afterError = await readSnapshot(session);
  reporter.check(
    "识别错误事件被反映到 voice 片（status='error' 或 error 非空）",
    afterError.state.voice.status === "error" || afterError.state.voice.error !== null,
    `receivers=${receiversOnError} status=${JSON.stringify(afterError.state.voice.status)} error=${JSON.stringify(afterError.state.voice.error)}`,
  );
  reporter.check(
    "错误后 voice.status 仍属 §13.2 枚举",
    VOICE_STATUSES.includes(afterError.state.voice.status),
    `实得 ${JSON.stringify(afterError.state.voice.status)}`,
  );

  // ── 5. 传 null 恢复真实实现（§13.3④）────────────────────────────────────
  await session.evaluate(() => window.__carDisplayVoiceInject(null));
  await delay(300);
  const afterRestore = await readSnapshot(session);
  reporter.check(
    "传 null 后 voice.supported 复原为注入前的值",
    afterRestore.state.voice.supported === supportedBefore,
    `注入前 ${JSON.stringify(supportedBefore)} → 恢复后 ${JSON.stringify(afterRestore.state.voice.supported)}`,
  );

  // ── 5.5 本轮是否被中途重载 ──────────────────────────────────────────────
  // 重载会清空注入的 mock 与 store 状态（T8 同时在改代码时 Vite 会整页刷新），本轮结果不可信。
  checkNoReload(reporter, session);

  // ── 6. 页面运行期异常 ───────────────────────────────────────────────────
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

  return { signals, instances, caseResults, supportedBefore };
});
