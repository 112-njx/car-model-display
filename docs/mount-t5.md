# T5 挂载/接入说明（给 T8 集成）

> 分支：`wave1/t5`　|　基线：`contract-v1`（T2 契约落地）　|　文件独占：`app/src/interaction/**`、`app/src/components/scene/VehicleModel.jsx`
> 本文只讲"怎么挂"与"接了什么"，设计取舍与自测记录见 `docs/debug.md` 的 Wave 1 · T5 段。

## 1. 一句话

`VehicleModel` 已经自带拾取，**T8 不需要为 T5 做任何额外挂载**——它本来就在 `StudioCanvas.jsx` 里
`<Suspense>` 内渲染。T5 新增的只有两个**渲染层组件**，已由 `VehicleModel` 自己渲染：

| 组件 | import 路径 | 挂在哪 | props |
| --- | --- | --- | --- |
| `PartHitAreas` | `app/src/interaction/PartHitAreas.jsx` | `VehicleModel` 内部已挂（与模型 group 同级，用世界坐标） | `hitAreas`（必需）、`debug`（可选，默认读 URL `?cdHit=1`） |
| `PartHoverHighlight` | 同上 | 同上 | `hitAreas`、`hoveredId` |

**无需引入任何 css**：tooltip 用内联样式 + `cd-hit-tooltip` 类名（前缀符合 §12.1 命名隔离），
命中区可视化与悬停高亮是 three 场景对象，都不依赖 `style.css` / `tokens.css`。

## 2. VehicleModel 的对外契约

```jsx
import { VehicleModel } from "./components/scene/VehicleModel";
<VehicleModel />        // 无 props。单车固化，原来的 vehicleId 已移除
```

- 读 `carConfig.PARTS` / `LIGHTS` / `INTERACTION` / `MODEL_URL` / `MODEL_TRANSFORM` / `MODEL_MATERIALS`；
- 读写 `useCarStore`（`state.parts[id]` / `state.lights[id]`，命中 → `togglePart` / `toggleLight`）；
- 每次指针按下与每次命中点击都会 `bumpInteraction()`（§13.2，T7 的待机自转复位信号）；
- 命中后 `pushToast("左前车窗已打开" / "大灯已开启")`，`level` 为 `success`(开) / `info`(关)。

## 3. 注册进 §13.3 审计面的两个数据源

| key | 落点 | 内容 |
| --- | --- | --- |
| `hitTargets` | `window.__carDisplaySceneAudit().hitTargets` | `[{ id, center:[x,y,z], size:[x,y,z], screen:{x,y} }]`，12 条（10 部件 + 大灯 + 尾灯）。`center`/`size` 为**世界坐标**；`screen` 是 **clientX/clientY 坐标系**（canvas CSS 尺寸 + canvas 视口偏移），T9 可直接拿去 `Input.dispatchMouseEvent`，无需换算。屏幕坐标经过"回投验证"：保证点下去确实命中该部件。 |
| `parts` | `window.__carDisplaySceneAudit().parts[].progress / .bbox` | `progress` 为开合动画进度 0..1（铰链按 `|Δrotation|/|angle|`，滑窗按 `位移/行程`，是**中间态**真值，不是 `open?1:0`）；`bbox` 为命中区世界包围盒尺寸 `[w,h,d]`（CHANGELOG 0006 的语义）。 |

两个源都在 `useEffect` 里注册并在 cleanup 里注销，重复挂载不会泄漏。

## 4. T8 集成时需要知道的三件事

1. **过渡期依赖（会随 shim 一起消失）**：`VehicleModel` 仍读兼容 shim `useStudioStore` 的
   `paint` / `finish` / `wheel` / `initialSceneReady` / `setInitialSceneReady`。
   其中 `PAINTS` / `WHEELS` 两张表在 legacy `studioConfig.js`（T2 的 CHANGELOG 0009 把它列为待 S1 裁定）。
   **T8 删 shim 前必须先决定车身外观配置的去向**：要么把固定外观（默认 `ivory` / `finish:12` / `turbine`）收进 `carConfig`，
   要么在 `VehicleModel` 里内联。T5 已登记该申请（CHANGELOG 0010），未擅自迁入契约。
2. **两个 legacy 全局仍被 T3 的 `HeadlightRig.jsx` 读取**，T5 保留未删：
   `globalThis.__formdriveHeadlightAnchors`（大灯锚点）、`globalThis.__formdriveActiveTransform`（车身位移/偏航）。
   **T3 接线完成后这两个可以删**，届时同步删 `VehicleModel` 里对应的两处赋值即可。
3. **T5 删掉了 4 个 legacy 调试全局**：`__formdriveSceneAudit` / `__formdriveModelScene` /
   `__formdriveMountedVehicles` / `__formdriveRenderedVehicleIds`。它们的替代品是 §13.3 的
   `window.__carDisplaySceneAudit()`（更完整）。T1 的 `scripts/verify-*.mjs` 用了它们，但那两个脚本
   本来就因硬编码 mustang/concept 而失效、且属 T9 重写范围，故未保留兼容层。

## 5. 调试与自测入口

| 用途 | 入口 |
| --- | --- |
| 看命中区线框（核对玻璃点中率、排查误命中） | 打开 `?cdHit=1`（青色线框 = 车窗隐形加厚命中盒，琥珀色 = 其他部件包围盒） |
| 屏幕像素 → 部件 id 探针（DEV-only） | `window.__carDisplayPickAt(clientX, clientY)` |
| 契约层审计 | `window.__carDisplaySceneAudit()` / `window.__carDisplayCameraAudit()` / `window.__carDisplayStore` |
| 无头几何/手势自测（Node，无需浏览器） | `cd app && node src/interaction/selftest/pick.selftest.mjs` |
| 真实浏览器点击/拖拽/触摸/点中率自测（CDP） | 见 `app/src/interaction/selftest/pick.cdp.mjs` 头部注释 |

## 6. 已知边界

- **可点击范围**：10 个部件 + **大灯 + 尾灯**。尾灯是 DoD 之外的对称补充（§13.1 定义了 `taillight`，
  且后灯材质网格里有若干不属于任何部件子树），若 T8 认为多余，删 `LIGHTS` 循环即可，无其他耦合。
- **命中优先级**：真实网格与车窗代理盒一起按"最近命中"排序。已实测：车窗打开时透过窗洞看到远侧车门，
  仍判车窗；点车门钣金仍判车门。
- **双指缩放不触发点击**：第二根手指落下即作废当前点击候选。
