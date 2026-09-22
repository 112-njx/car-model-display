# T3 · 中控大屏场景 —《挂载/接入说明》（供 T8 集成使用）

> 分支：`wave1/t3`　|　完成：A 段（场景组件）+ B 段（HeadlightRig 接 store、QUALITY 契约化）
> 状态：A/B 均已完成、build 通过。本说明写给 T8 集成 Agent。

## 1. 交付内容（文件清单）

| 文件 | 说明 |
| --- | --- |
| `src/components/scene/CockpitEnvironment.jsx` | 中控大屏场景环境（替代 StudioEnvironment）：深色径向渐变背景 + 冷白主光 + 青蓝氛围光 + 双轮廓光 + 顶光 + 反射地面 + 科技网格 + 环形光带 + 扫光 |
| `src/components/scene/ground/` | 地面层 8 个文件：`ReflectiveFloor.jsx`（镜面反射，drei MeshReflectorMaterial）、`TechGrid.jsx`（科技网格）、`ContactShadow.jsx`（车底接触阴影）、`RingLightBand.jsx`（环形光带）、`SweepLight.jsx`（扫光）、`envTheme.js`（色值 + QUALITY 消费）、`useCanvasTexture.js`、`env.css` |
| `src/components/scene/HeadlightRig.jsx` | **B 段改造**：固定 Tesla 锚点（不再依赖 studioConfig/useStudioStore），大灯开关读 `useCarStore.lights.headlight` |
| `docs/debug.md` | T3 记录（含 MainAgent 代收说明） |

## 2. 挂载位置（T8 集成时执行）

1. **`StudioCanvas.jsx`**：把 `<StudioEnvironment />` 替换为 `<CockpitEnvironment />`，import 相应替换；`StudioEnvironment.jsx` 确认无引用后可删除。
2. **CockpitEnvironment 无需额外引入 css**：`env.css` 已在组件内部 `import`。

```jsx
import { CockpitEnvironment } from "./CockpitEnvironment";
// ...
<Suspense fallback={null}><CockpitEnvironment /><VehicleModel /><HeadlightRig /></Suspense>
```

## 3. CockpitEnvironment Props 契约

```jsx
<CockpitEnvironment
  quality={QUALITY_TIERS[0]}   // 默认最高档；档位名索引 §13.1 QUALITY.tiers
  qualityFeatures={...}        // 可选：直接传 features 对象覆盖查表（T8 接 PerfProvider 时传入）
  exposure={1.0}               // toneMappingExposure
  ringScale={1}                // 环形光带半径缩放（相机预设变化时微调）
/>
```

- **质量分级消费**：`quality`/`qualityFeatures` → `resolveQualityFeatures()`（`envTheme.js`，B 段已改为从 `carConfig.QUALITY` 读取，删除了 A 段占位常量）。降级开关：`reflector / shadow / sweepLight / gridSegments`。
- **T8 接线点**：把 `T8p` 的 `PerfProvider` 档位 features 通过 `qualityFeatures` prop 传入即可生效；`dprMax` 不在本组件消费（归 T8p 统一控制）。

## 4. 色值收口约定

- 所有场景色值集中导出在 `ground/envTheme.js` 的 `ENV_COLORS`（青/冰蓝为 **T3 近似占位**）。
- **T8 集成期**：按 T4 `tokens.css` 设计 token 一次性替换 `ENV_COLORS` 各键值，无需改其它组件。

## 5. HeadlightRig B 段说明（T3 已改，T8 无需再动）

- 锚点：固定 `TESLA_RIG` 常量（值取自 `legacy studioConfig.HEADLIGHT_RIGS.tesla`，与 T1 基线一致，零行为变化）。
- 灯光状态：`useCarStore((s) => s.lights.headlight)`（§13.2 lights 状态片）。
- 依赖关系：车模大灯锚点 `__formdriveHeadlightAnchors` 与跟随变换 `__formdriveActiveTransform` 由 **T5 的 VehicleModel** 注册（已确认保留），合并顺序上 HeadlightRig 依赖 T5 的 VehicleModel 行为，请在 T5 分支合并后联调大灯光束跟随。
- 不再依赖 `studioConfig.js` / `useStudioStore.js`（兼容 shim 删除后无影响）。

## 6. 选型说明（为什么用 CanvasTexture 而非着色器）

- 背景渐变用 `CanvasTexture` 挂 `scene.background`：**WebGPU 后端不支持 `onBeforeCompile` 着色器注入**，纹理方案在 WebGPU/WebGL 双后端下同样可靠且零额外 draw call。
- 反射地面用 drei `MeshReflectorMaterial`（既有依赖，零新增）。

## 7. 自测记录（供 T8 复核）

- A 段：T3 Agent 用 `__t3harness.jsx`（临时文件，**不提交**，位于 `src/__t3harness.jsx` 未跟踪状态）起 dev 验证场景渲染。
- B 段：MainAgent 临时把 `<CockpitEnvironment />` 挂进 `StudioCanvas.jsx` 执行 `npm run build` —— **通过（8.95s）**，之后已还原 StudioCanvas（该挂载改动不交付，正式挂载见 §2）。
- 遗留：`ENV_COLORS` 色值为占位、`qualityFeatures` 接线归 T8、`StudioEnvironment.jsx` 待 T8 删除。
