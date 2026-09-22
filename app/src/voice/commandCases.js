/**
 * T6 语音控车 · parseCommand 用例集
 *
 * 用途：
 *   1. `voice.sandbox.html` 一键跑全部用例（自测页）
 *   2. Node 直跑：`node app/src/voice/commandCases.js`（本文件底部有 CLI 入口）
 *   3. T9 的 `scripts/verify-voice.mjs` 可直接 import 本文件复用同一套用例（只读）
 *
 * 覆盖：
 *   A. roadmap §6《语音指令集》全部 6 组（DoD 明确要求）
 *   B. 别名 / 同义词（位置词、部位名词、动词方向）
 *   C. 范围词展开（全部 / 前排 / 后排 / 左侧 / 右侧）
 *   D. 复合指令（连接词分句 + 动词继承）
 *   E. ASR 同音纠错
 *   F. 负例（缺动词 / 缺部位 / 未识别 / 否定 / 视角带开关动词）——必须返回空计划，绝不误动作
 */

import { describeActions } from "./commands.js";
import { parseCommandDetailed } from "./parseCommand.js";

/** §6 原文指令（DoD 逐条核对用）。 */
export const SPEC_CASES = [
  { group: "§6 车窗", text: "打开车窗", expect: [{ type: "group", id: "windows", open: true }] },
  { group: "§6 车窗", text: "关闭车窗", expect: [{ type: "group", id: "windows", open: false }] },
  { group: "§6 车门", text: "打开左前门", expect: [{ type: "part", id: "door_lf", open: true }] },
  { group: "§6 车门", text: "关闭右后门", expect: [{ type: "part", id: "door_rr", open: false }] },
  { group: "§6 前/后备箱", text: "打开前备箱", expect: [{ type: "part", id: "frunk", open: true }] },
  { group: "§6 前/后备箱", text: "打开后备箱", expect: [{ type: "part", id: "trunk", open: true }] },
  { group: "§6 灯光", text: "打开大灯", expect: [{ type: "light", id: "headlight", on: true }] },
  { group: "§6 灯光", text: "关闭大灯", expect: [{ type: "light", id: "headlight", on: false }] },
  { group: "§6 视角", text: "转一下", expect: [{ type: "camera", command: "orbit-once" }] },
  { group: "§6 视角", text: "看侧面", expect: [{ type: "camera", view: "profile" }] },
  { group: "§6 视角", text: "看正面", expect: [{ type: "camera", view: "front" }] },
  { group: "§6 视角", text: "复位", expect: [{ type: "camera", view: "hero" }] },
  {
    group: "§6 全局",
    text: "全部关闭",
    expect: [
      { type: "group", id: "windows", open: false },
      { type: "group", id: "doors", open: false },
      { type: "group", id: "closures", open: false },
      { type: "light", id: "headlight", on: false },
      { type: "light", id: "taillight", on: false },
    ],
  },
];

export const COMMAND_CASES = [
  ...SPEC_CASES,

  // ── B. 别名 / 同义词 ──
  { group: "B 别名", text: "把车窗打开", expect: [{ type: "group", id: "windows", open: true }] },
  { group: "B 别名", text: "开一下窗户", expect: [{ type: "group", id: "windows", open: true }] },
  { group: "B 别名", text: "开窗", expect: [{ type: "group", id: "windows", open: true }] },
  { group: "B 别名", text: "把玻璃降下来", expect: [{ type: "group", id: "windows", open: true }] },
  { group: "B 别名", text: "升起车窗", expect: [{ type: "group", id: "windows", open: false }] },
  { group: "B 别名", text: "把车窗都关上", expect: [{ type: "group", id: "windows", open: false }] },
  { group: "B 别名", text: "打开车门", expect: [{ type: "group", id: "doors", open: true }] },
  { group: "B 别名", text: "开门", expect: [{ type: "group", id: "doors", open: true }] },
  { group: "B 别名", text: "打开主驾车窗", expect: [{ type: "part", id: "window_lf", open: true }] },
  { group: "B 别名", text: "关闭副驾门", expect: [{ type: "part", id: "door_rf", open: false }] },
  { group: "B 别名", text: "打开左前玻璃", expect: [{ type: "part", id: "window_lf", open: true }] },
  { group: "B 别名", text: "降下左前车窗", expect: [{ type: "part", id: "window_lf", open: true }] },
  { group: "B 别名", text: "打开左后车门", expect: [{ type: "part", id: "door_lr", open: true }] },
  { group: "B 别名", text: "打开前舱", expect: [{ type: "part", id: "frunk", open: true }] },
  { group: "B 别名", text: "打开引擎盖", expect: [{ type: "part", id: "frunk", open: true }] },
  { group: "B 别名", text: "关闭尾箱", expect: [{ type: "part", id: "trunk", open: false }] },
  { group: "B 别名", text: "打开后尾门", expect: [{ type: "part", id: "trunk", open: true }] },
  { group: "B 别名", text: "打开车灯", expect: [{ type: "light", id: "headlight", on: true }] },
  { group: "B 别名", text: "关灯", expect: [{ type: "light", id: "headlight", on: false }] },
  { group: "B 别名", text: "打开远光灯", expect: [{ type: "light", id: "headlight", on: true }] },
  { group: "B 别名", text: "打开尾灯", expect: [{ type: "light", id: "taillight", on: true }] },
  { group: "B 别名", text: "关闭刹车灯", expect: [{ type: "light", id: "taillight", on: false }] },
  { group: "B 别名", text: "转一圈", expect: [{ type: "camera", command: "orbit-once" }] },
  { group: "B 别名", text: "环绕一周", expect: [{ type: "camera", command: "orbit-once" }] },
  { group: "B 别名", text: "看侧身", expect: [{ type: "camera", view: "profile" }] },
  { group: "B 别名", text: "看前脸", expect: [{ type: "camera", view: "front" }] },
  { group: "B 别名", text: "回到默认视角", expect: [{ type: "camera", view: "hero" }] },
  { group: "B 别名", text: "看细节", expect: [{ type: "camera", view: "detail" }] },

  // ── C. 范围词展开 ──
  { group: "C 范围", text: "打开四个车窗", expect: [{ type: "group", id: "windows", open: true }] },
  { group: "C 范围", text: "打开所有车门", expect: [{ type: "group", id: "doors", open: true }] },
  { group: "C 范围", text: "关闭全部车窗", expect: [{ type: "group", id: "windows", open: false }] },
  {
    group: "C 范围",
    text: "打开前排车窗",
    expect: [
      { type: "part", id: "window_lf", open: true },
      { type: "part", id: "window_rf", open: true },
    ],
  },
  {
    group: "C 范围",
    text: "关闭后排车窗",
    expect: [
      { type: "part", id: "window_lr", open: false },
      { type: "part", id: "window_rr", open: false },
    ],
  },
  {
    group: "C 范围",
    text: "打开左边车窗",
    expect: [
      { type: "part", id: "window_lf", open: true },
      { type: "part", id: "window_lr", open: true },
    ],
  },
  {
    group: "C 范围",
    text: "关闭右侧车门",
    expect: [
      { type: "part", id: "door_rf", open: false },
      { type: "part", id: "door_rr", open: false },
    ],
  },
  {
    group: "C 范围",
    text: "打开所有灯",
    expect: [
      { type: "light", id: "headlight", on: true },
      { type: "light", id: "taillight", on: true },
    ],
  },
  {
    group: "C 范围",
    text: "全部打开",
    expect: [
      { type: "group", id: "windows", open: true },
      { type: "group", id: "doors", open: true },
      { type: "group", id: "closures", open: true },
      { type: "light", id: "headlight", on: true },
      { type: "light", id: "taillight", on: true },
    ],
  },
  { group: "C 范围", text: "关闭所有", expect: [
    { type: "group", id: "windows", open: false },
    { type: "group", id: "doors", open: false },
    { type: "group", id: "closures", open: false },
    { type: "light", id: "headlight", on: false },
    { type: "light", id: "taillight", on: false },
  ] },

  // ── D. 复合指令（连接词 + 动词继承）──
  {
    group: "D 复合",
    text: "打开左前门和右后门",
    expect: [
      { type: "part", id: "door_lf", open: true },
      { type: "part", id: "door_rr", open: true },
    ],
  },
  {
    group: "D 复合",
    text: "关闭车窗和后备箱",
    expect: [
      { type: "group", id: "windows", open: false },
      { type: "part", id: "trunk", open: false },
    ],
  },
  {
    group: "D 复合",
    text: "打开全部车窗，再打开大灯",
    expect: [
      { type: "group", id: "windows", open: true },
      { type: "light", id: "headlight", on: true },
    ],
  },
  {
    group: "D 复合",
    text: "打开左前车窗和右后车窗",
    expect: [
      { type: "part", id: "window_lf", open: true },
      { type: "part", id: "window_rr", open: true },
    ],
  },
  // 动词后置（全句首个动词兜底）
  {
    group: "D 复合",
    text: "把车窗和车门都打开",
    expect: [
      { type: "group", id: "windows", open: true },
      { type: "group", id: "doors", open: true },
    ],
  },
  // 「然后/再」也是分句连接词
  {
    group: "D 复合",
    text: "打开后备箱然后打开大灯",
    expect: [
      { type: "part", id: "trunk", open: true },
      { type: "light", id: "headlight", on: true },
    ],
  },
  {
    group: "D 复合",
    text: "打开后备箱再打开前备箱",
    expect: [
      { type: "part", id: "trunk", open: true },
      { type: "part", id: "frunk", open: true },
    ],
  },
  // 视角 + 部件混说：视角不带开关动词，仍应各归各
  {
    group: "D 复合",
    text: "看侧面然后转一下",
    expect: [
      { type: "camera", view: "profile" },
      { type: "camera", command: "orbit-once" },
    ],
  },
  {
    group: "D 复合",
    text: "复位和打开车窗",
    expect: [
      { type: "camera", view: "hero" },
      { type: "group", id: "windows", open: true },
    ],
  },

  // ── E. ASR 同音纠错 ──
  { group: "E 纠错", text: "打开车床", expect: [{ type: "group", id: "windows", open: true }] },
  { group: "E 纠错", text: "打开后辈箱", expect: [{ type: "part", id: "trunk", open: true }] },
  { group: "E 纠错", text: "关闭后背箱", expect: [{ type: "part", id: "trunk", open: false }] },
  { group: "E 纠错", text: "打开前背箱", expect: [{ type: "part", id: "frunk", open: true }] },
  { group: "E 纠错", text: "看测面", expect: [{ type: "camera", view: "profile" }] },
  { group: "E 纠错", text: "打开大登", expect: [{ type: "light", id: "headlight", on: true }] },
  { group: "E 纠错", text: "打开尾登", expect: [{ type: "light", id: "taillight", on: true }] },
  { group: "E 纠错", text: "全不关闭", expect: [
    { type: "group", id: "windows", open: false },
    { type: "group", id: "doors", open: false },
    { type: "group", id: "closures", open: false },
    { type: "light", id: "headlight", on: false },
    { type: "light", id: "taillight", on: false },
  ] },
  { group: "E 纠错", text: "打开车们", expect: [{ type: "group", id: "doors", open: true }] },

  // ── F. 负例：必须返回空计划（绝不误动作）──
  { group: "F 负例", text: "", expect: [] },
  { group: "F 负例", text: "   ", expect: [] },
  { group: "F 负例", text: "今天天气不错", expect: [] },
  { group: "F 负例", text: "打开", expect: [] },
  { group: "F 负例", text: "关闭", expect: [] },
  { group: "F 负例", text: "车窗", expect: [] },
  { group: "F 负例", text: "后备箱", expect: [] },
  { group: "F 负例", text: "打开空调", expect: [] },
  { group: "F 负例", text: "打开正面", expect: [] },
  { group: "F 负例", text: "不要打开车窗", expect: [] },
  { group: "F 负例", text: "打开后备箱和", expect: [{ type: "part", id: "trunk", open: true }] },
];

/** 结构化深比较（数组顺序敏感，对象键顺序不敏感）。 */
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${key}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function deepEqual(a, b) {
  return canonical(a) === canonical(b);
}

/**
 * 跑全部用例。
 * @param {{vocabulary?:object}} [options] B 段传入 carConfig 词表
 * @returns {{total:number, passed:number, failed:Array, results:Array}}
 */
export function runCommandCases(options = {}) {
  const results = COMMAND_CASES.map((item) => {
    const detailed = parseCommandDetailed(item.text, options);
    const pass = deepEqual(detailed.actions, item.expect);
    return {
      group: item.group,
      text: item.text,
      expect: item.expect,
      actual: detailed.actions,
      pass,
      reason: detailed.reason,
      hint: detailed.hint,
      normalized: detailed.normalized,
      reply: describeActions(detailed.actions, options),
    };
  });
  const failed = results.filter((item) => !item.pass);
  return { total: results.length, passed: results.length - failed.length, failed, results };
}

// ── Node 直跑入口：node app/src/voice/commandCases.js ──
const isNodeCli =
  typeof process !== "undefined" && Array.isArray(process.argv) && /commandCases\.js$/.test(process.argv[1] || "");
if (isNodeCli) {
  const report = runCommandCases();
  const byGroup = new Map();
  for (const item of report.results) {
    const bucket = byGroup.get(item.group) || { pass: 0, total: 0 };
    bucket.total += 1;
    if (item.pass) bucket.pass += 1;
    byGroup.set(item.group, bucket);
  }
  for (const [group, bucket] of byGroup) {
    console.log(`${bucket.pass === bucket.total ? "PASS" : "FAIL"}  ${group}  ${bucket.pass}/${bucket.total}`);
  }
  for (const item of report.failed) {
    console.log(`\n✗ [${item.group}] "${item.text}"`);
    console.log(`  归一化: ${item.normalized || "(空)"}`);
    console.log(`  期望: ${canonical(item.expect)}`);
    console.log(`  实际: ${canonical(item.actual)}  reason=${item.reason}`);
  }
  console.log(`\n合计 ${report.passed}/${report.total} 通过`);
  if (report.failed.length) process.exit(1);
}
