// T3 · 中控大屏场景的色值与质量分级（B 段：QUALITY 来自 §13.1 契约 carConfig）
//
// 色值说明（重要）：这里的青/冰蓝色值是 T3 的**近似占位**。
// 最终色值以 T4 的 `tokens.css` 设计 token 为准，由 T8 在集成期收口。
// 集中在此一处导出，便于 T8 一次性替换为 token 变量。
import { QUALITY } from "../../../config/carConfig";
export const ENV_COLORS = {
  // 背景：垂直渐变（主）+ 中心光晕（辅）。
  // 不用「单一径向」是因为 scene.background 会按屏幕比例拉伸，
  // 径向中心会被拉成横贯屏幕的亮带。
  backdropTop: "#03060a", // 顶部近黑
  backdropUpper: "#08161f",
  backdropCore: "#0d2431", // 中段最亮（车身后方的青蓝光晕）
  backdropLower: "#060f16",
  backdropBottom: "#020407",
  backdropGlow: "#16455c", // 叠加在中心的光晕

  // 灯光
  skyGlow: "#1b4356", // 半球光·天光（青蓝）
  groundBounce: "#04070a", // 半球光·地面反弹（近黑）
  ambient: "#2a5f78", // 环境光（冷青）
  key: "#d6ecff", // 主光（冷白，负责车身高光）
  fill: "#4fb6d8", // 补光（青）
  rimLeft: "#38e2ff", // 轮廓光·左（冰青）
  rimRight: "#2f9fe0", // 轮廓光·右（蓝）
  top: "#eaf6ff", // 顶光（车顶高光）

  // 地面
  floorBase: "#05080c", // 地面底色
  reflection: "#1a4557", // 倒影剪影色（须比地面亮，否则会被半透明地面吃掉）
  contactShadow: "#000000", // 车底接触阴影

  // 科技网格
  gridLine: "#123c4c",
  gridLineMajor: "#1e7f9c",

  // 环形光带
  ringOuter: "#12708f",
  ringInner: "#4fd8ee",

  // 扫光
  sweep: "#4fd4ec",
};

export const QUALITY_TIERS = QUALITY.tiers;

/** 按档位名取 features；未知档位回退到最高档，保证调用方永不拿到 undefined。 */
export function resolveQualityFeatures(tier, overrides) {
  const base = QUALITY.features[tier] ?? QUALITY.features[QUALITY_TIERS[0]];
  return overrides ? { ...base, ...overrides } : base;
}
