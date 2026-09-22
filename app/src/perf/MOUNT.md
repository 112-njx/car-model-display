# T8p 性能与移动端基建 —— 挂载 / 接入说明

> 交付方：T8p（Wave 1）　消费方：**T8 集成组装**（§11.1 T8 任务⑤）
> 本文件随 `perf/**` 一起交付。**Wave 1 内 T8p 未改 `App.jsx` / `main.jsx`**，
> 正式接线全部由 T8 完成（§12.1「Wave 1 不得改 App.jsx、main.jsx」）。

---

## 1. 挂载位置（T8 要做的唯一一件事）

`PerfProvider` 必须包住**所有会调用 `useDeviceTier()` 的组件树**，最省事的位置是应用根节点。

### 方案 A（推荐）：改 `App.jsx`，包住整个界面

```jsx
import { PerfProvider } from "./perf/PerfProvider";

export default function App() {
  return (
    <PerfProvider>
      {/* 原有的 main.app-shell / StudioCanvas / ControlDeck / … 原样放这里 */}
    </PerfProvider>
  );
}
```

### 方案 B：改 `main.jsx`，包住 `<App />`

```jsx
import { PerfProvider } from "./perf/PerfProvider";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <PerfProvider>
      <App />
    </PerfProvider>
  </StrictMode>,
);
```

两个方案等价，二选一即可（不要两处都包，会创建两个采样器）。

### 不需要做的接线

- **不用**手动引入 `devtools/auditHooks.js`：`PerfProvider` 内部已经 `import` 它并调用
  `registerSceneAuditSource("perf", fn)`，卸载时会自动注销。
- **不用**手动引入 `config/carConfig.js`：默认参数已取 `QUALITY`。
- **不用**引入 css：`perf.css` 由 `WebGLFallback.jsx` 自己 import。

---

## 2. 消费方式

```jsx
import { useDeviceTier } from "../perf/useDeviceTier";

const { reflector, shadow, sweepLight, dprMax, gridSegments, tier } = useDeviceTier();
```

`useDeviceTier()` 返回：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `tier` | `'high' \| 'mid' \| 'low'` | 当前档位。设备初判 → 低帧自动降档（只降不升） |
| `setTier` | `(tier) => void` | 手动改档（调试开关用） |
| `features` | `object` | 当前档的原始 features 对象（契约 §13.1 的 `QUALITY.features[tier]`） |
| `reflector` | `boolean` | **T3**：`MeshReflectorMaterial` 反射地面开关 |
| `shadow` | `boolean` | **T3/T8**：`<Canvas shadows>` 与投影光源开关 |
| `sweepLight` | `boolean` | **T3**：扫光/轮廓光动效开关 |
| `dprMax` | `number` | **T8**：`<Canvas dpr={[1, dprMax]}>` 的上限 |
| `gridSegments` | `number` | **T3**：科技网格地面的分段数 |
| `graphics` | `{ ok, api, reason }` | 图形能力探测结果（`api` 为 `webgpu`/`webgl2`/`webgl`） |
| `sampler` | `object` | 帧率采样器句柄（一般不需要直接用） |
| `markSceneReady` | `() => void` | 首屏加载完成时调用，见 §4 |

各档数值（来自 `config/carConfig.js` 的 `QUALITY`，**T8p 只读，未复制第二份**）：

| 档位 | reflector | shadow | sweepLight | dprMax | gridSegments |
| --- | --- | --- | --- | --- | --- |
| `high` | ✅ | ✅ | ✅ | 2 | 96 |
| `mid` | ✅ | ✅ | ❌ | 1.5 | 64 |
| `low` | ❌ | ❌ | ❌ | 1 | 32 |

### 具体接线点

| 位置 | 改法 |
| --- | --- |
| `scene/StudioCanvas.jsx:32` | `dpr={[1, 1.8]}` → `dpr={[1, dprMax]}`；`shadows` → `shadows={shadow}` |
| T3 的反射地面 | 用 `reflector` 决定是否渲染 `MeshReflectorMaterial`，否则退普通材质 |
| T3 的网格地面 | `gridSegments` 直接传分段数 |
| T3 的扫光 | 用 `sweepLight` 决定是否挂载扫光组件 |
| 低帧自动降档 | 无需接线，`PerfProvider` 内部完成 |

---

## 3. 审计字段（§13.3②）

`PerfProvider` 挂载后，`window.__carDisplaySceneAudit().perf` 即为：

```ts
{ fps: number, dpr: number, tier: 'high'|'mid'|'low' }
```

- 未挂载 `PerfProvider` 时该字段为 `null`（契约 §13.3 已注明「未注册时为 null，消费方须判空」）。
- `window.__carDisplaySceneAudit` 本身由 `state/useCarStore.js` 在模块求值时通过
  `installAuditHooks(carStore)` 安装。T8 集成后 store 必然被引入，无需额外处理。
- `fps` 是最近 `windowCount` 个采样窗口的均值，1 位小数；页面在后台或场景预热期内不产出样本，
  此时读到的是上一个有效值。

---

## 4. 建议接线：首屏加载完成 → `markSceneReady()`

首屏要加载 22.7 MiB 的 GLB，加载与编译着色器阶段帧率天然极低。采样器默认从 `start()` 起
预热 3s，**若一直没人调用 `markSceneReady()`，最迟 12s 后开始判定**。

T8 在首屏加载完成（加载页消失）时调用一次，判定会更准：

```jsx
const { markSceneReady } = useDeviceTier();
useEffect(() => {
  if (initialSceneReady) markSceneReady();
}, [initialSceneReady, markSceneReady]);
```

不接也能工作，只是低配设备在极慢加载时可能被提前判为低帧。

---

## 5. 自测入口

```bash
# 纯逻辑自测（免浏览器、零依赖、确定性假时钟）：49 项断言
node app/src/perf/selfTest.mjs
```

浏览器内的自测钩子（**仅用于自测与排障，不参与契约**）：

```js
// 强制走降级页（在页面脚本执行前设置，或用 CDP 的 Page.addScriptToEvaluateOnNewDocument）
window.__carDisplayPerfForce = { webgl: false, webgpu: false };

// 强制档位
window.__carDisplayPerfForce = { tier: "low" };

// 读运行时状态
window.__carDisplayPerf.tier;            // 当前档位
window.__carDisplayPerf.features;        // 当前档 features
window.__carDisplayPerf.snapshot();      // { fps, dpr, tier }
window.__carDisplayPerf.diagnostics();   // 采样器内部状态（history/cooldown/downgrades）
window.__carDisplayPerf.device;          // 设备初判信号与得分
window.__carDisplayPerf.graphics;        // 图形能力探测结果
```

---

## 6. 行为边界（避免误用）

- **只降不升**：帧率恢复后档位**不会**自动升回去。这是刻意的——升降震荡比稳定在低档更难看。
  需要升档请调 `setTier`。
- **不写 config / store**：`PerfProvider` 只读 `QUALITY`。若需新增画质字段，走
  `docs/contracts/CHANGELOG.md`（§13.4），不要改本模块。
- **`useDeviceTier()` 在 Provider 外调用会抛中文错误**，不返回默认值——静默兜底会让
  「忘了挂 Provider」表现成「画质悄悄掉档」，极难排查。
- **降级页触发条件是 WebGPU 与 WebGL 都不可用**，不是"没有 WebGL"。T1 基线的
  `StudioCanvas` 优先走 WebGPU，只测 WebGL 会误伤「有 WebGPU、没 WebGL」的设备。
