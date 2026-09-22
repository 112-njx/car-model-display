# T4《挂载/接入说明》—— 中文中控 UI（面板 / Toast / 加载页 / 主题）

> 交付分支：`wave1/t4`（已含 `contract-v1`）
> 面向：**T8 集成组装**（主要）、T6 语音（容器位）、T3 场景（设计 token）、T9 验证（钩子面）
> 依据：roadmap §11.1 T4、§12.1 协作约定、§13 契约规格

---

## 1. 交付物清单

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `app/src/components/ui/ControlPanel.jsx` | **新增** | 中文中控控制面板（store 连接版） |
| `app/src/components/ui/PartButton.jsx` | **新增** | 单个部件按钮（props 驱动） |
| `app/src/components/ui/ToastHost.jsx` | **新增** | Toast 宿主（订阅 `store.toast`） |
| `app/src/components/ui/LoadingScreen.jsx` | **新增** | 中文加载页（store + drei `useProgress`） |
| `app/src/components/ui/strings.js` | **新增** | **中文文案表（界面文案唯一来源）** |
| `app/src/components/ui/GlassSwitch.jsx` | 保留 | 复用 T1 基线的玻璃开关，仅换主题 token |
| `app/tokens.css` | **重写** | 深色中控主题 token（全项目视觉权威） |
| `app/src/style.css` | **重写** | `cd-ui-` 前缀样式 + 三档响应式 |
| `app/index.html` | **改写** | `lang="zh-CN"`、中文 title/description、中文首屏 boot 页 |
| `app/src/App.jsx` | **最小改动** | 见 §2（经人工裁定，唯一一次 Wave 1 内的 App 改动） |
| `ControlDeck.jsx` / `Navigation.jsx` / `HeroCopy.jsx` / `InfoDialog.jsx` / `VehicleSelector.jsx` / `CameraControls.jsx` / `InitialLoadingScreen.jsx` | **删除** | 7 个配置器组件 |

---

## 2. 当前挂载状态（T8 需要知道的）

`App.jsx` 现已挂好全部 T4 组件，**T8 无需再为 T4 做任何挂载动作**：

```jsx
import { StudioCanvas } from "./components/scene/StudioCanvas";
import { ControlPanel } from "./components/ui/ControlPanel";
import { ToastHost } from "./components/ui/ToastHost";
import { LoadingScreen } from "./components/ui/LoadingScreen";
import { STRINGS } from "./components/ui/strings";

export default function App() {
  return (
    <>
      <a className="skip-link" href="#studio-controls">{STRINGS.skipLink}</a>
      <main className="app-shell">
        <StudioCanvas />
        <div className="scene-vignette" />
        <ControlPanel />
        <ToastHost />
      </main>
      <LoadingScreen onRetry={() => window.location.reload()} />
    </>
  );
}
```

**T8 需要注意的三点：**

1. **`App.jsx` 的这一处改动是经人工裁定的例外**。原因：§11.1 要求 T4 删除 7 个配置器组件，而 §12.1 禁改 `App.jsx` —— 删文件会让未改动的 `App.jsx` 编译失败，与 S2 准入「build 全绿」冲突。裁定采用「删组件 + 最小 `App.jsx` 改动」。**除上列 import 与挂载点外，本文件其余结构（`skip-link` / `main.app-shell` / `StudioCanvas` / `scene-vignette`）与 T1 基线逐字一致**；`skip-link` 文案由英文改为 `STRINGS.skipLink`（中文），属 DoD「无英文残留」的必要最小项。
2. **`skip-link` 的锚点 `#studio-controls` 落在 `ControlPanel` 的 `<aside>` 上**，T8 重组布局时请保留该 id，否则跳过导航失效。
3. **手势提示由 `ControlPanel` 自己渲染**（`.cd-ui-gesture-hint`），不再需要 T1 基线的 `<p className="gesture-hint">`。

---

## 3. 组件 API

### `ControlPanel`

| prop | 类型 | 说明 |
| --- | --- | --- |
| `voiceSlot` | `ReactNode` | 可选。**T6 的 `VoiceButton` 挂这里**（见 §5）。不传时渲染中文占位 |
| `defaultOpen` | `boolean` | 可选。强制初始展开/收起；不传时按断点（≥40rem 展开、手机收起） |

读写的 store 面（§13.2）：`parts` / `lights` / `cameraView` / `autoRotate`；
动作：`togglePart` / `openGroup` / `closeGroup` / `closeAll` / `toggleLight` /
`setCameraView` / `orbitOnce` / `setAutoRotate` / `pushToast` / `bumpInteraction`。
部件与视角清单来自 `carConfig` 的 `PARTS` / `PART_GROUPS` / `LIGHTS` / `CAMERA_VIEWS`，**未硬编码任何部件事实**。

> ⚠️ **Toast 归属**：`ControlPanel` 是「UI 通道」的 Toast 唯一发出点。T5（点击拾取）、T6（语音）请各自发各自的中文反馈，**不要**再经 `ControlPanel` 转发，以免同一动作出现两条 Toast。

### `ToastHost`

| prop | 类型 | 说明 |
| --- | --- | --- |
| `toasts` / `onDismiss` / `duration` | — | 全部可选，仅用于自测/隔离；缺省时订阅 `store.toast` 与 `store.dismissToast` |

自动消失 2600 ms，点击 Toast 本体立即关闭，`level` 映射为 `cd-ui-toast--info/success/warn`。

### `LoadingScreen`

| prop | 类型 | 说明 |
| --- | --- | --- |
| `onRetry` | `() => void` | 加载失败时「重新加载」按钮的回调 |
| `bypass` | `boolean` | 直接不渲染（原 FormDrive 的 localStorage 跳过逻辑已移除，改由宿主决定） |
| `progress` / `loadedBytes` / `totalBytes` / `sceneReady` / `hasError` | — | 可选覆盖，仅用于自测 |

**数据来源**：优先读 `store.loading`（见 §6 的 CHANGELOG 0010），缺省回退到 drei `useProgress()`。

### `strings.js`

`STRINGS` 为具名导出，按区域分组（`panel` / `groups` / `parts` / `lights` / `camera` / `actions` / `voice` / `toast` / `loading`）。
**T5、T6 请直接 import 本表**拼装 Toast 文案（如 `STRINGS.toast.partOpened(label)`），以保证「同一动作在按钮/点击/语音三条通道下的反馈文案完全一致」。

---

## 4. 样式与设计 token

- **`tokens.css` 是全项目视觉权威**（roadmap §12.4：视觉风格不一致时一律以 T4 的 token 为准）。
- **既有 token 名全部保留**（仅重调数值），T3（`cd-env-`）、T6（`cd-voice-`）可直接引用，不要自带色值。
- 主色：`--color-accent: oklch(84% .12 195)`（青）、`--color-accent-2`（冰蓝）；底色 `--color-paper: oklch(14% .022 252)`（深灰蓝黑）。
- 触控下限：`--tap-min: 2.75rem`、`--tap-min-lg: 3.5rem`。
- 中文字体回退栈已写进 `--font-display` / `--font-body`（`Geist` → `PingFang SC` → `HarmonyOS Sans SC` → `Microsoft YaHei` → `Noto Sans SC`）。`index.html` 的 Google Fonts 链接已去掉不再使用的 `Instrument Serif`。
- `style.css` 已移除全部旧组件样式（`.nav-pill` / `.control-deck` / `.tab-*` / `.swatch` / `.vehicle-selector` / `.info-dialog` / `.loading-*` 等）。**若 T8 需要临时回看旧样式，从 `main` 的 `git show` 取，不要在本分支恢复。**

**类名前缀**：本任务一律 `cd-ui-`，与 `cd-env-` / `cd-voice-` / `cd-hit-` / `cd-cam-` / `cd-perf-` 不冲突。

**响应式三档**（精细打磨归 T8）：
| 断点 | 面板形态 |
| --- | --- |
| `< 40rem` | 底部面板，**默认收起**（仅露出标题与展开按钮），`max-height: min(64dvh, 34rem)`，内部滚动 |
| `≥ 40rem` | 右下角浮层，默认展开，`max-height: min(76dvh, 42rem)` |
| `≥ 60rem` | 右侧固定侧栏，默认展开，`max-height: min(100dvh - 3rem, 46rem)` |

---

## 5. 语音容器位（给 T6 / T8）

`ControlPanel` 内已预留稳定挂载点：

```jsx
<div className="cd-ui-voice-slot" data-voice-slot aria-label="语音控制">
  {voiceSlot ?? <span className="cd-ui-voice-slot__placeholder">语音控制</span>}
</div>
```

- T6 的 `VoiceButton` 自带样式（`cd-voice-` 前缀、`voice.css`），**不要复用 `cd-ui-` 类名**。
- T8 接线方式：`<ControlPanel voiceSlot={<VoiceButton />} />`。传入后占位自动消失（`.cd-ui-voice-slot:has(...)` 会去掉虚线边框）。
- 容器位默认高度 `3.25rem`，位于面板顶部第一个区块；若 `VoiceButton` 需要不同高度，改 T6 自己的 css，不要改 `cd-ui-` 规则。

---

## 6. 与契约的关系 / 待办

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | `store.loading` 片（`sceneReady` / `progress` / `loadedBytes` / `totalBytes`） | **人工已裁定采纳**（`docs/contracts/CHANGELOG.md` 0010）。**待 T2 落地 + T5 在 `VehicleModel.jsx` 内把 `useVehicleGLTF` 的传输回调接进该片**。落地前加载页走 drei `useProgress` 兜底，字节行显示「首次载入约 22 MB」；落地后**无需改 T4 代码**，自动显示 `X.X / Y.Y MB` |
| 2 | legacy `studioConfig.js` | 仍被 `VehicleModel` / `CameraRig` / `HeadlightRig` / `StudioEnvironment` / `VehicleAssetLoader` 引用（T2 CHANGELOG 0008/0009 待 S1 裁定）。**T4 的 `ui/**` 已完全不引用它** |
| 3 | `--paint-*` 五个 token | 已无消费方，保留是为避免影响并行分支；建议 T8 集成末段与 `studioConfig.js` 同批清理 |
| 4 | 审计钩子 | T4 不注册任何数据源，只用 `pushToast` / 各 action；`window.__carDisplayStore` 由 T2 的 `auditHooks` 安装，T4 依赖它做自测（未改 `devtools/**`） |

---

## 7. 已知环境噪声（非本任务引入，供 T8/T9 判读）

无头 Edge 的**软件 WebGPU** 路径下，`three.js` 的 `WebGPURenderer` 会持续抛出
`TypeError: Invalid value used as weak map key`（栈完全落在 `three_webgpu.js` 的 `Textures.updateTexture` → `_renderObjectDirect`）。

**归因证据**（`debug.md` 记录 08）：① **零交互**、仅渲染时即出现；② 只经 `__carDisplayStore` 驱动、完全不碰 T4 的 UI 时同样出现且数量随动画帧数增长；③ 本任务未改动任何场景/渲染器文件（`StudioCanvas` / `StudioEnvironment` / `VehicleModel` / `CameraRig` / `HeadlightRig` 一行未动）。
→ 判定为**无头软件渲染环境问题**，真机 GPU 上是否复现需 T8/T9 复验。**不计入 T4 的缺陷。**

---

## 8. 自测证据索引

| 项 | 位置 |
| --- | --- |
| A 段 42 项断言（props 驱动、假数据） | `debug.md` 记录 07 |
| B 段 44 项断言（真实 App + 真实 store + 3D） | `debug.md` 记录 08 |
| 截图（375 加载/收起/展开/交互、1440 桌面） | `%TEMP%/t4-selftest/b/` |
| CDP 脚本（仓库外，未入交付） | `%TEMP%/t4-selftest/t4-b-check.mjs` |
