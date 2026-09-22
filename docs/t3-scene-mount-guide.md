# T3 · 中控大屏场景 —《挂载/接入说明》（供 T8 集成使用）

> 分支：`wave1/t3`　|　完成：A 段（场景组件）+ B 段（HeadlightRig 接 store、QUALITY 契约化）
> 状态：A/B 均已完成、build 通过、桌面浏览器实测通过。本说明写给 T8 集成 Agent。
> 最新提交：`448677d`（贴图重编译修复）；基座 `ac4ebf8`（A 段 + B 段接线）。

## 1. 交付内容（文件清单）

| 文件 | 说明 |
| --- | --- |
| `src/components/scene/CockpitEnvironment.jsx` | 中控大屏场景环境（替代 StudioEnvironment）：深色渐变背景 + 冷白主光 + 青蓝氛围光 + 双轮廓光 + 顶光 + 反射地面 + 科技网格 + 环形光带 + 扫光 |
| `src/components/scene/ground/ReflectiveFloor.jsx` | 地面本体（**不受光**深色面）+ 镜像倒影 |
| `src/components/scene/ground/TechGrid.jsx` | 科技网格地面（程序化贴图，径向淡出，`gridSegments` 控制密度） |
| `src/components/scene/ground/ContactShadow.jsx` | 车底接触阴影（独立于光照的软暗斑） |
| `src/components/scene/ground/RingLightBand.jsx` | 环形光带（双同心环） |
| `src/components/scene/ground/SweepLight.jsx` | 轻微扫光（`sweepLight` 开关） |
| `src/components/scene/ground/envTheme.js` | `ENV_COLORS` 色值 + `resolveQualityFeatures()`（B 段已从 `carConfig.QUALITY` 读取） |
| `src/components/scene/ground/useCanvasTexture.js` | StrictMode 安全的程序化纹理生命周期（**重要，见 §6**） |
| `src/components/scene/ground/useVehicleRoot.js` | 车模根节点探测（供镜像倒影使用，失败时优雅降级） |
| `src/components/scene/ground/env.css` | `cd-env-` 前缀的可选 DOM 覆盖层（`.cd-env-backdrop` / `.cd-env-vignette`，T8 按需挂载） |
| `src/components/scene/HeadlightRig.jsx` | **B 段改造**：固定 Tesla 锚点（不再依赖 studioConfig/useStudioStore），大灯开关读 `useCarStore.lights.headlight` |

所有场景网格都带 `cd-env-*` 的 `name`（`cd-env-floor` / `cd-env-grid` / `cd-env-contact-shadow` / `cd-env-ring-*` / `cd-env-sweep` / `cd-env-reflection`），便于 T9 脚本与调试定位。

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

- **质量分级消费**：`quality`/`qualityFeatures` → `resolveQualityFeatures()`（`envTheme.js`，已从 `carConfig.QUALITY` 读取）。
- 实际消费的字段：`reflector`（是否克隆车模做倒影）、`shadow`（灯光 `castShadow`）、`sweepLight`（是否挂载扫光）、`gridSegments`（网格密度）。
- **`dprMax` 不在本组件消费**（按 §12.3 归 T8p 的 PerfProvider 统一控制）。
- **T8 接线点**：把 T8p 的档位 features 通过 `qualityFeatures` prop 传入即可生效。
- **运行期降档已验证**：`reflector` 在运行中 true↔false 切换不会报错、不会冻结渲染循环（见 §6 第 3 条）。

## 4. 色值收口约定

- 所有场景色值集中导出在 `ground/envTheme.js` 的 `ENV_COLORS`（青/冰蓝为 **T3 近似占位**）。
- **T8 集成期**：按 T4 `tokens.css` 设计 token 一次性替换 `ENV_COLORS` 各键值，无需改其它组件。

## 5. HeadlightRig B 段说明（T3 已改，T8 无需再动）

- 锚点：固定 `TESLA_RIG` 常量（值取自 `legacy studioConfig.HEADLIGHT_RIGS.tesla`，与 T1 基线一致，零行为变化）。
- 灯光状态：`useCarStore((s) => s.lights.headlight)`（§13.2 lights 状态片）。
- 依赖关系：`__formdriveHeadlightAnchors` / `__formdriveActiveTransform` 由 **T5 的 VehicleModel** 注册。**风险**：`ProjectedBeam` 的 `active` 条件含 `Boolean(measuredAnchor)` —— 若 T5 重写 VehicleModel 后不再写这两个全局，光束会**永远不亮**（而非回退到固定锚点）。建议 T8 在合并 T5 后确认该全局仍存在，或让 T5 改为显式回退到 `TESLA_RIG`。
- 不再依赖 `studioConfig.js` / `useStudioStore.js`（兼容 shim 删除后无影响）。

## 6. 集成期务必知道的三个坑（本轮实测结论）

### 6.1 drei `MeshReflectorMaterial` 在本工程默认渲染路径下**每帧崩溃**，已弃用

roadmap §11.1 原本指定用 drei `MeshReflectorMaterial` 做反射地面。**实测不可用**：

- `StudioCanvas.jsx:16` 在 `navigator.gpu` 存在时走 **`WebGPURenderer`** —— 桌面 Edge/Chrome 都满足，**这是本工程默认路径**。
- `@react-three/drei/core/MeshReflectorMaterial.js:162` 调用 `gl.state.buffers.depth.setMask(true)`；`gl.state` 是 **`WebGLRenderer` 的内部状态对象**，WebGPU 后端没有它 → 每帧 `TypeError`，**直接打死 R3F 渲染循环，整个场景冻结**。
- 佐证：`three/build/three.webgpu.js`（未压缩完整构建）中 `onBeforeCompile` 出现 **0 次** —— 该材质靠 `onBeforeCompile` 注入反射着色器，WebGPU 下即使不崩也不会有效果。

**已按人工决策改为「镜像倒影」**：克隆车模根节点，`scale.y = -1` 置于地面之下，统一剪影材质。纯几何、双后端安全、零新增依赖。实现要点：

- **每个克隆网格必须持有自己的材质实例**，不能全场共享一个 `MeshBasicMaterial`。车模各网格几何体属性集不一致（有无 UV/顶点色），共享单实例会击穿 three WebGPU 后端的绑定缓存，抛 `TypeError: Invalid value used as weak map key`（栈：`Bindings._init → Textures.updateTexture → WeakMap.set(undefined)`）。
- 材质在 **effect 内创建、同一 cleanup 内释放**（不是 `useMemo` + cleanup），否则 `<StrictMode>` 的 effect 双调用会释放掉仍被引用的实例。
- 倒影是**静态快照**，不跟随车门/车窗动画（视觉上不可辨，换来每帧零矩阵同步开销）。
- 车模根节点用 `useVehicleRoot()` 多信号探测（DEV 下的 `__formdriveModelScene`，否则取根 scene 中 mesh 最多的子树），**探测不到就静默不渲染倒影**，不报错。

### 6.2 贴图在材质编译后赋值不会触发重编译 —— 地面/网格曾整片不透明

**这是本轮最隐蔽的一个 bug，T8 若新增任何程序化贴图务必注意。**

`useCanvasTexture()` 首帧返回 `null`，贴图在 effect 里才创建。若此时照常渲染网格，材质会先以「无 `map` / 无 `alphaMap`」编译一次；**之后再赋值贴图不会触发着色器重编译**，`USE_MAP` / `USE_ALPHAMAP` 宏始终未定义 —— 贴图的颜色与 alpha 被**整片忽略**：

- 地面 → 退化成全不透明片，把下方镜像倒影**完全盖死**；
- 网格 → 退化成 `color`(默认白) × `opacity` 的**实心灰片**，铺满整个圆盘。

**约定**：`TechGrid` / `ReflectiveFloor` / `ContactShadow` / `SweepLight` 一律在 `if (!texture) return null;` 之后才渲染网格。新增带贴图的场景件请沿用同一模式。

### 6.3 地面刻意用 `MeshBasicMaterial`（不受光），不要改回受光材质

受光地面在本场景下**数学上必然发灰**：四盏平行光总辐照度约 7.4，即使反照率压到近黑（`#05080c` ≈ 0.02 线性），漫反射仍有 `0.02 × 7.4 ≈ 0.15`，经 ACES + sRGB 编码后约 **40% 灰** —— 整块地面糊成一片亮青灰，倒影、网格、光带全被压掉。而车身高光又必须靠这些强光，不能为压暗地面而削光。

所以地面改为不受光：恒定深色 + `alphaMap` 径向渐隐，**镜面感完全交给镜像倒影**。代价是地面不再接收阴影贴图；「车贴地」由 `ContactShadow` 与模型自带烘焙阴影承担。

## 7. 已知遗留 / 需 T8 关注

1. **`ENV_COLORS` 色值为占位**，待按 T4 `tokens.css` 收口（§4）。
2. **车模 GLB 自带烘焙阴影网格**：模型内含 `JUST_BLACK_JUST_BLACK0_0` 等黑壳网格，会在车侧地面留下形状明显的暗斑。**T1 基线同样存在**（非 T3 引入），但在 T3 的深色地面上更显眼。归属：`VehicleModel.jsx` 是 T5 独占文件，T3 未越界处理；建议 T5 或 T8 集成期按名称/材质过滤。
3. **`StudioEnvironment.jsx` 待 T8 删除**（挂载替换后无引用）。
4. **`qualityFeatures` 接线归 T8**（§3）。
5. **本机 headless 浏览器下 WebGPU 后端不稳定**：headless Edge 的 WebGPU 会持续抛 `No bind group set at group index 1` / `Invalid CommandBuffer`，**T1 基线的未改动 App 同样如此**（实测 500+ 条）。强制走 WebGL 后错误归零。因此 T3 的浏览器自测以 **WebGL 通道为准**；WebGPU 路径在真实 GPU（有头浏览器）上的表现未能在本环境验证，建议 T8 真机调参时优先确认。

## 8. 自测记录（供 T8 复核）

- 方式：`__t3harness.jsx` 临时工装（**不提交**，已删除）复刻 `StudioCanvas` 的渲染器创建与装配顺序，挂 `CockpitEnvironment` + `VehicleModel` + `HeadlightRig` + `CameraRig`，用 CDP 驱动 Edge 截图 + 采帧率 + 收异常。
- `npm run build`：**通过**。
- 运行期降档：`reflector` true→false→true、`quality` high→low→high 多轮切换，**0 异常**，渲染循环不中断。
- 渲染结果：深色底 + 科技网格径向淡出 + 双环形光带 + 车身下方清晰倒影 + 扫光 + 车身高光，对标中控大屏通过。
- 帧率：headless 软件渲染下的绝对值不具参考性（受同机 8 个并行 Agent 的 dev server 影响）；相对成本可参考：关反射后帧率约为开反射的 **2–3 倍**（headless 软件光栅，真机 GPU 差距应显著更小）。**桌面 60fps 的真机确认归 T8**（§12.3 明确 T8 负责真机调参）。
- 挂载改动：自测期间临时改 `App.jsx` 指向工装，**已还原、未交付**。
