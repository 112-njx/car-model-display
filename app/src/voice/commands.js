/**
 * T6 语音控车 · 指令词表 / 别名表 / 纠错表 / 计划执行映射
 *
 * 依据：roadmap §6《语音指令集》+ §13.1（PART_GROUPS / PARTS / LIGHTS / CAMERA_VIEWS 的 id 冻结）
 *
 * 分层约定（重要）：
 *   1. 本文件是**词表层**，不 import store、不 import carConfig，A 段（契约无关阶段）可独立自测。
 *   2. `DEFAULT_*` 是 §13.1 规格的镜像，仅作 A 段兜底；B 段由 `buildVocabulary(carConfig)` 用真实
 *      carConfig 覆盖 —— 即 **id / label / aliases 的最终来源是 carConfig**，本文件只补充面向
 *      语音识别的结构词与同义词（`EXTRA_ALIASES` / `GROUP_NOUNS` / `POSITION_TERMS` / 动词 / 范围词 / 纠错表）。
 *   3. 部件一律用 §13.1 冻结的逻辑 id 引用，绝不出现 GLB 节点名。
 *
 * 计划（ActionPlan）形状 —— parseCommand 的输出，也是 executePlan 的输入：
 *   { type: 'part',   id: partId,  open: boolean }
 *   { type: 'group',  id: groupId, open: boolean }
 *   { type: 'light',  id: lightId, on:   boolean }
 *   { type: 'camera', view: viewId }            // 预设视角
 *   { type: 'camera', command: 'orbit-once' }   // 「转一下」环绕一周
 */

// ══════════════════════════════════════════════════════════════════════
// 1. §13.1 默认表（A 段兜底；B 段以 carConfig 为准）
// ══════════════════════════════════════════════════════════════════════

export const DEFAULT_PART_GROUPS = [
  { id: "windows", label: "车窗", order: 1 },
  { id: "doors", label: "车门", order: 2 },
  { id: "closures", label: "前/后备箱", order: 3 },
];

export const DEFAULT_PARTS = [
  { id: "window_lf", group: "windows", label: "左前车窗", aliases: ["左前窗", "左前玻璃", "主驾车窗"] },
  { id: "window_rf", group: "windows", label: "右前车窗", aliases: ["右前窗", "副驾车窗"] },
  { id: "window_lr", group: "windows", label: "左后车窗", aliases: ["左后窗"] },
  { id: "window_rr", group: "windows", label: "右后车窗", aliases: ["右后窗"] },
  { id: "door_lf", group: "doors", label: "左前门", aliases: ["左前车门", "主驾门"] },
  { id: "door_rf", group: "doors", label: "右前门", aliases: ["右前车门", "副驾门"] },
  { id: "door_lr", group: "doors", label: "左后门", aliases: ["左后车门"] },
  { id: "door_rr", group: "doors", label: "右后门", aliases: ["右后车门"] },
  { id: "frunk", group: "closures", label: "前备箱", aliases: ["前舱", "引擎盖", "前机盖"] },
  { id: "trunk", group: "closures", label: "后备箱", aliases: ["尾箱", "后尾门"] },
];

export const DEFAULT_LIGHTS = [
  { id: "headlight", label: "大灯", aliases: ["车灯", "前灯", "远光", "近光"] },
  { id: "taillight", label: "尾灯", aliases: ["后灯", "刹车灯"] },
];

export const DEFAULT_CAMERA_VIEWS = [
  { id: "hero", label: "复位", order: 0 },
  { id: "front", label: "正面", order: 1 },
  { id: "profile", label: "侧面", order: 2 },
  { id: "detail", label: "细节", order: 3 },
];

// ══════════════════════════════════════════════════════════════════════
// 2. 结构词：动词 / 范围 / 方位 / 部位名词 / 视角 / 环绕
// ══════════════════════════════════════════════════════════════════════

/** 打开类动词。含车窗语义的「降下/摇下」——车窗 open=true 即玻璃降下。 */
export const VERB_OPEN = [
  "帮我打开", "打开一下", "打开", "开启一下", "开启", "开一下", "开开", "张开", "掀开",
  "降下来", "降下", "摇下来", "摇下", "放下来", "放下", "落下来",
  "亮起来", "点亮", "亮起", "开",
];

/** 关闭类动词。「升起」对应车窗 open=false。 */
export const VERB_CLOSE = [
  "帮我关闭", "关闭一下", "关闭", "关上", "关掉", "合上", "收起来", "收起",
  "升起来", "升起", "抬起来", "熄灭", "灭掉", "关",
];

/** 范围词。all = 整组；front/rear/left/right = 子集（展开成多个 part 动作）。 */
export const SCOPE_TERMS = {
  all: ["全部一起", "全部", "所有", "全都", "一切", "整车", "整台", "整个", "四个", "4个", "四扇", "4扇", "四门", "四窗", "全"],
  front: ["前面两个", "前面俩", "前两", "前排", "前侧", "前部"],
  rear: ["后面两个", "后面俩", "后两", "后排", "后侧", "后部"],
  left: ["左侧", "左边", "左面", "左"],
  right: ["右侧", "右边", "右面", "右"],
};

/** 范围 → 部件 id 的位置后缀（与 §13.1 冻结 id 的 `_lf` / `_rf` / `_lr` / `_rr` 对应）。 */
export const SCOPE_POSITIONS = {
  front: ["lf", "rf"],
  rear: ["lr", "rr"],
  left: ["lf", "lr"],
  right: ["rf", "rr"],
};

/** 位置词 → 部件 id 后缀。用于组合出「左前车窗」这类具体部件说法。 */
export const POSITION_TERMS = {
  lf: ["左前方", "左前侧", "左前", "前左", "主驾驶", "主驾", "驾驶位", "驾驶员侧", "司机位", "司机侧"],
  rf: ["右前方", "右前侧", "右前", "前右", "副驾驶", "副驾", "副驾位", "乘客位", "助手位"],
  lr: ["左后方", "左后侧", "左后排", "左后", "后左", "后排左"],
  rr: ["右后方", "右后侧", "右后排", "右后", "后右", "后排右"],
};

/** 组 id → 该组的部位名词（含单字「窗」「门」）。用于「车窗」整体说法与位置组合。 */
export const GROUP_NOUNS = {
  windows: ["车窗玻璃", "车窗", "窗户", "窗玻璃", "玻璃窗", "车玻璃", "侧窗", "玻璃", "窗"],
  doors: ["车门板", "车门", "门板", "门"],
};

/** 灯光补充别名（carConfig 的 aliases 之外的语音同义词）。 */
export const EXTRA_ALIASES = {
  headlight: ["前照灯", "远光灯", "近光灯", "车头灯", "前大灯", "大灯组", "头灯", "前灯组"],
  taillight: ["后尾灯", "尾灯组", "后灯组", "刹车灯组", "后尾灯组"],
  frunk: ["前行李箱", "前备厢", "前背箱", "前盖", "车头盖", "前引擎盖", "前舱盖"],
  trunk: ["后尾箱", "后行李箱", "行李箱", "后备厢", "后背箱", "后盖", "车尾盖", "后厢盖", "尾门"],
};

/** 视角补充说法（carConfig 的 label 之外的语音同义词）。 */
export const EXTRA_VIEW_TERMS = {
  hero: ["视角复位", "恢复视角", "默认视角", "原始视角", "回到默认", "恢复原位", "回到原位", "回原位", "归位", "回正", "回到初始"],
  front: ["切换到正面", "看正面", "看前脸", "前脸", "正前方", "看车头", "车头视角", "看前面", "前面"],
  profile: ["切换到侧面", "看侧面", "看侧边", "侧面视角", "侧身", "侧边", "看侧身"],
  detail: ["细节视角", "看细节", "看局部", "特写", "局部"],
};

/** 「转一下」类环绕指令。 */
export const ORBIT_TERMS = [
  "转一圈看看", "转一下看看", "环绕一周看看", "环绕一圈", "环绕一周", "绕车一圈", "旋转一圈", "旋转一下",
  "转一圈", "转一下", "转一转", "转个圈", "绕一圈",
];

/** 否定词。命中即拒绝执行——做错方向比不做更糟。 */
export const NEGATION_TERMS = ["不要", "不用", "别", "取消", "停止", "算了"];

/**
 * 本车模**没有**的部件/功能。
 * 必须显式拦截：像「天窗」「氛围灯」这类词含有「窗」「灯」，不拦就会误命中车窗/大灯而**执行错动作**。
 * （「空调」「导航」等不含部位词的，本来就会落到未识别，列在这里是为了给出更准确的中文提示。）
 */
export const UNSUPPORTED_TERMS = [
  // 含部位词、不拦就会误命中
  "全景天窗", "电动天窗", "天窗", "挡风玻璃", "车门锁", "氛围灯", "阅读灯", "雾灯", "双闪",
  // 不含部位词（本来就会落到未识别），列出来是为了给出更准确的中文提示
  "雨刮", "雨刷", "后视镜", "车顶", "轮毂", "轮胎", "安全带", "空调", "座椅", "按摩", "音乐", "歌曲", "导航", "地图", "电话", "蓝牙",
];

/** 连接词：把「打开左前门和右后门」拆成两条指令。归一化阶段被替换为分隔符。 */
export const CONJUNCTIONS = ["以及", "还有", "同时", "并且", "然后", "接着", "之后", "和", "跟", "与", "再"];

/**
 * 纠错表（ASR 同音/近音误识别 → 规范说法）。归一化阶段按顺序做子串替换。
 * 只收录**不会与合法指令冲突**的替换：左侧任一短语在合法指令中都不应出现。
 */
export const HOMOPHONE_FIXES = [
  ["车床", "车窗"],
  ["车创", "车窗"],
  ["车箱", "车窗"],
  ["窗互", "窗户"],
  ["车们", "车门"],
  ["后备厢", "后备箱"],
  ["后辈箱", "后备箱"],
  ["后背箱", "后备箱"],
  ["后贝箱", "后备箱"],
  ["后尾厢", "后备箱"],
  ["前备厢", "前备箱"],
  ["前背箱", "前备箱"],
  ["前贝箱", "前备箱"],
  ["引形盖", "引擎盖"],
  ["引擎盖", "引擎盖"],
  ["大登", "大灯"],
  ["大灯组", "大灯组"],
  ["车登", "车灯"],
  ["前登", "前灯"],
  ["尾登", "尾灯"],
  ["伟灯", "尾灯"],
  ["后登", "后灯"],
  ["测面", "侧面"],
  ["侧脸", "侧面"],
  ["复为", "复位"],
  ["复回", "复位"],
  ["复住", "复位"],
  ["全不", "全部"],
  ["全步", "全部"],
  ["关必", "关闭"],
  ["关比", "关闭"],
  ["装一圈", "转一圈"],
  ["装一下", "转一下"],
];

/** 无法执行时的中文提示（按 parseCommandDetailed 的 reason 取）。 */
export const REASON_HINTS = {
  empty: "没有听清，请再说一次。",
  unrecognized: "没听懂这条指令。可以说「打开车窗」「关闭左前门」「打开大灯」「看侧面」「转一下」「全部关闭」。",
  "missing-target": "没听出要控制哪个部位。可以说「打开车窗」「关闭后备箱」。",
  "missing-verb": "没听出是打开还是关闭。可以说「打开车窗」或「关闭车窗」。",
  "verb-with-view": "视角指令不带「打开/关闭」。可以说「看侧面」「复位」「转一下」。",
  negation: "暂不支持否定指令，请直接说要执行的动作。",
  "unsupported-part": "本车模没有这个部件或功能。可以控制：车窗、车门、前/后备箱、大灯、尾灯、视角。",
};

// ══════════════════════════════════════════════════════════════════════
// 3. 文本归一化
// ══════════════════════════════════════════════════════════════════════

/** 分隔符（连接词与标点归一化后统一用它，供分句使用）。 */
const SEP = String.fromCharCode(1); // 分句分隔符（不可打印，避免与指令文本冲突）

const PUNCTUATION_RE = /[，。！？、；：,.!?;:…·~～"'“”‘’（）()【】\[\]{}<>《》|/\\—-]+/g;

const FULLWIDTH_RE = /[！-～]/g;

/**
 * 归一化：全角→半角、去空白、标点与连接词→分隔符、同音纠错。
 * @param {unknown} input
 * @returns {string} 归一化后的字符串（分句分隔符用 SEP 常量表示）
 */
export function normalizeText(input) {
  if (typeof input !== "string") return "";
  let text = input.replace(FULLWIDTH_RE, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  text = text.replace(/　/g, " ");
  text = text.toLowerCase();
  text = text.replace(PUNCTUATION_RE, SEP);
  for (const word of CONJUNCTIONS) text = text.split(word).join(SEP);
  text = text.replace(/\s+/g, "");
  for (const [from, to] of HOMOPHONE_FIXES) text = text.split(from).join(to);
  return text.split(SEP).filter(Boolean).join(SEP);
}

/** 把归一化文本拆成独立分句（连接词/标点切分），空段丢弃。 */
export function splitFragments(normalized) {
  return String(normalized)
    .split(SEP)
    .map((part) => part.trim())
    .filter(Boolean);
}

// ══════════════════════════════════════════════════════════════════════
// 4. 词表构建（默认表 ∪ carConfig ∪ 结构词）
// ══════════════════════════════════════════════════════════════════════

/** 长词优先排序：匹配时先试更长的说法，避免「车窗」抢走「左前车窗」。 */
function byLengthDesc(list) {
  return list.slice().sort((a, b) => b.surface.length - a.surface.length);
}

function unique(list) {
  return Array.from(new Set(list.filter(Boolean)));
}

function normalizeList(list) {
  return unique((list || []).map((item) => normalizeText(item)).filter(Boolean));
}

/**
 * 构建匹配词表。
 * @param {{partGroups?:Array, parts?:Array, lights?:Array, cameraViews?:Array}} [source]
 *        B 段传入 carConfig 的 PART_GROUPS / PARTS / LIGHTS / CAMERA_VIEWS；A 段留空用默认表。
 */
export function buildVocabulary(source = {}) {
  const partGroups = source.partGroups || DEFAULT_PART_GROUPS;
  const parts = source.parts || DEFAULT_PARTS;
  const lights = source.lights || DEFAULT_LIGHTS;
  const cameraViews = source.cameraViews || DEFAULT_CAMERA_VIEWS;

  const entries = [];
  const seen = new Map(); // surface → 是否已占用（先到先得：label/aliases 优先于生成词）

  const push = (surface, kind, id) => {
    const key = normalizeText(surface);
    if (!key || key.includes(SEP)) return;
    if (seen.has(key)) return;
    seen.set(key, true);
    entries.push({ surface: key, kind, id });
  };

  // 4.0 本车模没有的功能：必须最先占位，避免「天窗」被「窗」、「氛围灯」被「灯」抢走
  for (const surface of UNSUPPORTED_TERMS) push(surface, "unsupported", "unsupported");

  // 4.1 部件：label + aliases + 补充别名 + 位置×名词 组合
  for (const part of parts) {
    for (const surface of [part.label, ...(part.aliases || []), ...(EXTRA_ALIASES[part.id] || [])]) {
      push(surface, "part", part.id);
    }
    const nouns = GROUP_NOUNS[part.group] || [];
    const position = Object.keys(POSITION_TERMS).find((pos) => new RegExp(`_${pos}$`).test(part.id));
    if (position) {
      for (const posTerm of POSITION_TERMS[position]) {
        for (const noun of nouns) push(`${posTerm}${noun}`, "part", part.id);
      }
    }
  }

  // 4.2 组：PART_GROUPS.label + 部位名词
  for (const group of partGroups) {
    for (const surface of [group.label, ...(GROUP_NOUNS[group.id] || [])]) {
      push(surface, "group", group.id);
    }
  }

  // 4.3 灯光：label + aliases + 补充别名（单字「灯」兜底指大灯）
  for (const light of lights) {
    for (const surface of [light.label, ...(light.aliases || []), ...(EXTRA_ALIASES[light.id] || [])]) {
      push(surface, "light", light.id);
    }
  }
  if (lights.length && !seen.has(normalizeText("灯"))) push("灯", "light", lights[0].id);

  // 4.4 视角预设：label + 补充说法
  for (const view of cameraViews) {
    for (const surface of [view.label, ...(EXTRA_VIEW_TERMS[view.id] || [])]) {
      push(surface, "view", view.id);
    }
  }

  // 4.5 环绕：「转一下」类
  const orbit = [];
  for (const surface of ORBIT_TERMS) {
    const key = normalizeText(surface);
    if (key && !seen.has(key)) {
      seen.set(key, true);
      orbit.push({ surface: key, kind: "orbit", id: "orbit-once" });
    }
  }

  const verbs = byLengthDesc([
    ...VERB_OPEN.map((surface) => ({ surface: normalizeText(surface), value: "open" })),
    ...VERB_CLOSE.map((surface) => ({ surface: normalizeText(surface), value: "close" })),
  ]);

  const scopes = [];
  for (const [scope, terms] of Object.entries(SCOPE_TERMS)) {
    for (const term of normalizeList(terms)) scopes.push({ surface: term, value: scope });
  }

  return {
    partGroups,
    parts,
    lights,
    cameraViews,
    entries: byLengthDesc([...entries, ...orbit]),
    verbs,
    scopes: byLengthDesc(scopes),
  };
}

/** A 段兜底词表（§13.1 镜像 + 结构词）。 */
export const DEFAULT_VOCABULARY = buildVocabulary();

// ══════════════════════════════════════════════════════════════════════
// 5. 查询辅助
// ══════════════════════════════════════════════════════════════════════

export function getPart(vocabulary, id) {
  return vocabulary.parts.find((part) => part.id === id) || null;
}

export function getGroup(vocabulary, id) {
  return vocabulary.partGroups.find((group) => group.id === id) || null;
}

export function getLight(vocabulary, id) {
  return vocabulary.lights.find((light) => light.id === id) || null;
}

export function getView(vocabulary, id) {
  return vocabulary.cameraViews.find((view) => view.id === id) || null;
}

/** 取组内某个位置（lf/rf/lr/rr）的部件 id；无则 null。 */
export function findPartIdByPosition(vocabulary, groupId, position) {
  const part = vocabulary.parts.find(
    (item) => item.group === groupId && new RegExp(`_${position}$`).test(item.id),
  );
  return part ? part.id : null;
}

/** 范围 → 该组内展开的部件 id 列表（顺序固定：lf,rf / lf,lr / rf,rr / lr,rr）。 */
export function partIdsForScope(vocabulary, groupId, scope) {
  const positions = SCOPE_POSITIONS[scope];
  if (!positions) return [];
  return positions.map((position) => findPartIdByPosition(vocabulary, groupId, position)).filter(Boolean);
}

// ══════════════════════════════════════════════════════════════════════
// 6. 计划 → 中文回执 / 计划 → store 动作
// ══════════════════════════════════════════════════════════════════════

function labelOf(vocabulary, kind, id) {
  if (kind === "part") return getPart(vocabulary, id)?.label || id;
  if (kind === "group") return getGroup(vocabulary, id)?.label || id;
  if (kind === "light") return getLight(vocabulary, id)?.label || id;
  if (kind === "view") return getView(vocabulary, id)?.label || id;
  return id;
}

/** 计划是否等价于「全部打开 / 全部关闭」（用于回执文案收短）。 */
function allState(plan, vocabulary) {
  const groups = plan.filter((action) => action.type === "group");
  const lights = plan.filter((action) => action.type === "light");
  if (groups.length !== vocabulary.partGroups.length || lights.length !== vocabulary.lights.length) return null;
  if (plan.some((action) => action.type === "part" || action.type === "camera")) return null;
  const openValues = new Set(groups.map((action) => action.open));
  const onValues = new Set(lights.map((action) => action.on));
  if (openValues.size !== 1 || onValues.size !== 1) return null;
  const open = groups[0].open;
  if (lights[0].on !== open) return null;
  return open;
}

/**
 * 计划 → 中文回执文案（用于 toast / 字幕）。
 * @param {Array} plan parseCommand 的输出
 * @param {{vocabulary?:object}} [options]
 */
export function describeActions(plan, options = {}) {
  const vocabulary = options.vocabulary || DEFAULT_VOCABULARY;
  if (!Array.isArray(plan) || !plan.length) return "";
  const whole = allState(plan, vocabulary);
  if (whole !== null) return whole ? "全部打开" : "全部关闭";
  return plan
    .map((action) => {
      if (action.type === "part") return `${action.open ? "打开" : "关闭"}${labelOf(vocabulary, "part", action.id)}`;
      if (action.type === "group") return `${action.open ? "打开" : "关闭"}全部${labelOf(vocabulary, "group", action.id)}`;
      if (action.type === "light") return `${action.on ? "打开" : "关闭"}${labelOf(vocabulary, "light", action.id)}`;
      if (action.type === "camera") {
        if (action.command === "orbit-once") return "环绕一周";
        // hero 是「复位」语义，用「复位视角」比「切换到复位视角」通顺
        if (action.view === "hero") return "复位视角";
        return `切换到${labelOf(vocabulary, "view", action.view)}视角`;
      }
      return "";
    })
    .filter(Boolean)
    .join("、");
}

/**
 * 执行计划。只依赖 §13.2 冻结的 action 名字，因此 A 段可用假 actions 自测、B 段直接传真实 store。
 * @param {Array} plan
 * @param {{setPart:Function, openGroup:Function, closeGroup:Function, setLight:Function,
 *          setCameraView:Function, orbitOnce:Function, bumpInteraction?:Function}} api
 * @returns {{ applied: Array<string> }}
 */
export function executePlan(plan, api) {
  const applied = [];
  if (!Array.isArray(plan) || !plan.length) return { applied };
  for (const action of plan) {
    if (action.type === "part") {
      api.setPart(action.id, action.open);
      applied.push(`${action.open ? "open" : "close"}:${action.id}`);
    } else if (action.type === "group") {
      if (action.open) api.openGroup(action.id);
      else api.closeGroup(action.id);
      applied.push(`${action.open ? "open" : "close"}:group:${action.id}`);
    } else if (action.type === "light") {
      api.setLight(action.id, action.on);
      applied.push(`${action.on ? "on" : "off"}:${action.id}`);
    } else if (action.type === "camera") {
      if (action.command === "orbit-once") api.orbitOnce();
      else api.setCameraView(action.view);
      applied.push(`camera:${action.command || action.view}`);
    }
  }
  // §13.2：所有用户输入都必须 bumpInteraction（待机自转复位信号）——每条指令调一次。
  if (typeof api.bumpInteraction === "function") api.bumpInteraction();
  return { applied };
}
