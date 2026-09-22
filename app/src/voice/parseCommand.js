/**
 * T6 语音控车 · parseCommand —— 中文指令文本 → 动作计划（纯函数）
 *
 * 依据：roadmap §6《语音指令集》+ §13.1（部件/灯光/视角 id 冻结）
 * 约束：**纯函数，无副作用、不读 store、不碰 DOM**，因此可在 Node 里直接跑用例（见 commandCases.js）。
 *
 * 解析策略（由粗到细）：
 *   1. 归一化（全角→半角、去空白、标点与连接词→分隔符、同音纠错）
 *   2. 按连接词/标点分句 —— 支持「打开左前门和右后门」这类复合指令，后句可继承前句动词
 *   3. 每句内做**最长匹配**：先命中目标（部件/组/灯光/视角/环绕），再命中动词与范围词
 *   4. 目标为组时按范围词展开：全部 → group 动作；前排/后排/左侧/右侧 → 展开成多个 part 动作
 *
 * 输出计划形状见 commands.js 顶部注释；无法执行时返回空数组 []。
 */

import {
  DEFAULT_VOCABULARY,
  NEGATION_TERMS,
  REASON_HINTS,
  normalizeText,
  partIdsForScope,
  splitFragments,
} from "./commands.js";

/** 在文本中找第一个（最长的）命中词条。词表已按 surface 长度降序排好。 */
function matchEntry(normalized, entries) {
  for (const entry of entries) {
    if (normalized.includes(entry.surface)) return entry;
  }
  return null;
}

/** 动词识别：最长优先（「打开」优先于「开」）。 */
function matchVerb(normalized, verbs) {
  for (const verb of verbs) {
    if (normalized.includes(verb.surface)) return verb.value;
  }
  return null;
}

/** 范围词识别：最长优先（「全部」优先于「全」）。 */
function matchScope(normalized, scopes) {
  for (const scope of scopes) {
    if (normalized.includes(scope.surface)) return scope.value;
  }
  return null;
}

function hasNegation(normalized) {
  return NEGATION_TERMS.some((term) => normalized.includes(term));
}

/** 「全部打开 / 全部关闭」：所有组 + 所有灯光一起动作。 */
function allActions(vocabulary, open) {
  return [
    ...vocabulary.partGroups.map((group) => ({ type: "group", id: group.id, open })),
    ...vocabulary.lights.map((light) => ({ type: "light", id: light.id, on: open })),
  ];
}

/**
 * 解析单个分句。
 * @param {string} fragment 归一化后的单个分句
 * @param {object} vocabulary
 * @param {string|null} carriedVerb 前一分句的动词（向后继承）
 * @param {string|null} fallbackVerb 全句第一个出现的动词（向前继承，处理「把车窗和车门都打开」）
 * @returns {{actions?:Array, verb?:string|null, reason?:string}}
 */
function parseFragment(fragment, vocabulary, carriedVerb, fallbackVerb) {
  const target = matchEntry(fragment, vocabulary.entries);
  const ownVerb = matchVerb(fragment, vocabulary.verbs);

  // 视角 / 环绕：不带「打开/关闭」。若同句出现开关动词，说明是误识别，不执行。
  // 注意这里只看本分句自己的动词——继承来的动词不应把「复位」误判成非法指令。
  if (target && (target.kind === "view" || target.kind === "orbit")) {
    if (ownVerb) return { reason: "verb-with-view" };
    if (target.kind === "orbit") return { actions: [{ type: "camera", command: "orbit-once" }], verb: null };
    return { actions: [{ type: "camera", view: target.id }], verb: null };
  }

  const verb = ownVerb || carriedVerb || fallbackVerb;
  const open = verb === "open";

  // 无目标：若带动词且出现「全部」范围词，视为全局开关
  if (!target) {
    if (ownVerb && matchScope(fragment, vocabulary.scopes) === "all") {
      return { actions: allActions(vocabulary, open), verb: ownVerb };
    }
    if (ownVerb) return { reason: "missing-target" };
    return { reason: "unrecognized" };
  }

  if (!verb) return { reason: "missing-verb" };

  if (target.kind === "part") {
    return { actions: [{ type: "part", id: target.id, open }], verb };
  }

  if (target.kind === "group") {
    const scope = matchScope(fragment, vocabulary.scopes);
    if (scope && scope !== "all") {
      const ids = partIdsForScope(vocabulary, target.id, scope);
      if (ids.length) {
        return { actions: ids.map((id) => ({ type: "part", id, open })), verb };
      }
    }
    return { actions: [{ type: "group", id: target.id, open }], verb };
  }

  if (target.kind === "light") {
    const scope = matchScope(fragment, vocabulary.scopes);
    if (scope === "all") {
      return { actions: vocabulary.lights.map((light) => ({ type: "light", id: light.id, on: open })), verb };
    }
    return { actions: [{ type: "light", id: target.id, on: open }], verb };
  }

  return { reason: "unrecognized" };
}

/**
 * 解析中文语音指令，返回动作计划与诊断信息。
 * @param {unknown} input 识别文本
 * @param {{vocabulary?:object}} [options] B 段传入 carConfig 派生的词表
 * @returns {{text:string, normalized:string, fragments:string[], actions:Array, reason:string|null, hint:string|null}}
 */
export function parseCommandDetailed(input, options = {}) {
  const vocabulary = options.vocabulary || DEFAULT_VOCABULARY;
  const text = typeof input === "string" ? input : "";
  const normalized = normalizeText(text);

  const fail = (reason) => ({
    text,
    normalized,
    fragments: [],
    actions: [],
    reason,
    hint: REASON_HINTS[reason] || REASON_HINTS.unrecognized,
  });

  if (!normalized) return fail("empty");
  if (hasNegation(normalized)) return fail("negation");

  const fragments = splitFragments(normalized);
  const actions = [];
  let carriedVerb = null;
  let lastReason = "unrecognized";

  // 全句第一个显式动词：作为「本分句无动词且前面也没出现过动词」时的兜底，
  // 使「把车窗和车门都打开」「打开后备箱然后打开大灯」这类语序也能完整执行。
  let fallbackVerb = null;
  for (const fragment of fragments) {
    const verb = matchVerb(fragment, vocabulary.verbs);
    if (verb) {
      fallbackVerb = verb;
      break;
    }
  }

  for (const fragment of fragments) {
    const result = parseFragment(fragment, vocabulary, carriedVerb, fallbackVerb);
    if (result.actions && result.actions.length) {
      actions.push(...result.actions);
      if (result.verb) carriedVerb = result.verb;
    } else if (result.reason) {
      lastReason = result.reason;
    }
  }

  if (!actions.length) return { ...fail(lastReason), fragments };

  return { text, normalized, fragments, actions, reason: null, hint: null };
}

/** 解析中文语音指令，只返回动作计划（roadmap §11.1 约定的输出形状）。 */
export function parseCommand(input, options = {}) {
  return parseCommandDetailed(input, options).actions;
}
