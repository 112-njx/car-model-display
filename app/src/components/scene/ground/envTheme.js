// T3 · 中控大屏场景的色值与质量分级（B 段：QUALITY 来自 §13.1 契约 carConfig）
//
// ── T8 集成期主题收口（roadmap §12.4 第 6 步 / T3《挂载说明》§4）─────────────────
// 原色值是 T3 的**近似占位**；现已按 **T4 `tokens.css` 的设计 token** 收口：
//   · 色相全部取自 token：冷底色相 **252**（`--color-paper` 一族）、
//     青/冰蓝色相 **195/200/205/210/232**（`--color-accent` / `--color-accent-2` /
//     `--color-focus` / `--color-ink` / `--color-rule`）。
//   · 场景需要的是"同一色相在明度轴上的若干档"，而 token 是**界面色**（纸/墨/强调色），
//     故每个键 = 某个 token 的色相 + 按场景需要重新取的明度/彩度，**逐键标注来源**。
//   · **为什么是 hex 而不是直接引用 CSS 变量**：three.js 的 `Color.setStyle` 只认
//     rgb/hsl/hex/具名色，**不认 `oklch()`**（已核对 `three.core.js`：全文 0 处 oklch）。
//     故 token 值经离线转换（oklch→oklab→linear sRGB→sRGB）后以 hex 落地，
//     转换脚本与逐键 oklch 原值见 `docs/debug.md` 记录 T8-04。
//   · 一致性口径：**界面里的青蓝与场景里的青蓝同源**（同色相），
//     不会出现"UI 是青、车模环境是另一种蓝"的割裂。
import { QUALITY } from "../../../config/carConfig";
export const ENV_COLORS = {
  // 背景：垂直渐变（主）+ 中心光晕（辅）。
  // 不用「单一径向」是因为 scene.background 会按屏幕比例拉伸，
  // 径向中心会被拉成横贯屏幕的亮带。
  backdropTop: "#000307", // --color-paper 色相 252 压暗        oklch(9%  .022 252)
  backdropUpper: "#01050b", // --color-paper 色相 252            oklch(11% .022 252)
  backdropCore: "#061520", // 车身后方光晕：195→240 偏冷、压明度  oklch(19% .03  240)
  backdropLower: "#010309", // --color-paper 色相 252            oklch(10% .022 252)
  backdropBottom: "#000103", // --color-paper 色相 252 再压暗      oklch(6%  .02  252)
  backdropGlow: "#177f8e", // --color-accent 色相 195→210        oklch(55% .09  210)

  // 灯光
  skyGlow: "#01434c", // --color-accent 色相 195 压明度（半球天光）  oklch(35% .06  210)
  groundBounce: "#000001", // --color-paper 色相 252 近黑           oklch(4%  .015 252)
  ambient: "#156068", // --color-accent 色相 195 中明度          oklch(45% .07  205)
  key: "#d6f0f9", // --color-ink 降一档明度作冷白主光       oklch(94% .03  220)
  fill: "#40b1b7", // --color-accent 压明度作补光            oklch(70% .1   200)
  rimLeft: "#73eef4", // --color-focus                       oklch(88% .11  200)
  rimRight: "#95d4f6", // --color-accent-2                    oklch(84% .08  232)
  top: "#e9f4f7", // --color-ink                         oklch(96% .012 220)

  // 地面
  floorBase: "#000104", // --color-paper 色相 252 压暗（承载倒影的哑光底） oklch(7% .02 252)
  reflection: "#01434c", // 倒影剪影：须亮于地面底，否则被半透明地面吃掉  oklch(35% .06 210)
  contactShadow: "#000000", // 车底接触阴影

  // 科技网格
  gridLine: "#234f57", // --color-rule 色相 205 压明度作细网格   oklch(40% .05 210)
  gridLineMajor: "#2b9095", // --color-rule 色相 200 提明度作主网格   oklch(60% .09 200)

  // 环形光带
  ringOuter: "#00717c", // --color-accent 色相 195 中明度（外环） oklch(50% .09 205)
  ringInner: "#44d6d6", // --color-accent 略压（内环）          oklch(80% .12 195)

  // 扫光
  sweep: "#6cd9d8", // --color-accent 色相 195 高明度         oklch(82% .1  195)
};

export const QUALITY_TIERS = QUALITY.tiers;

/** 按档位名取 features；未知档位回退到最高档，保证调用方永不拿到 undefined。 */
export function resolveQualityFeatures(tier, overrides) {
  const base = QUALITY.features[tier] ?? QUALITY.features[QUALITY_TIERS[0]];
  return overrides ? { ...base, ...overrides } : base;
}
