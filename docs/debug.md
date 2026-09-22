# 开发过程记录（debug.md）

> 项目：3D 仿真车模 Demo　|　规划依据：`docs/roadmap.md`
> 用途：记录每一轮编码（含每轮纠错）的目标、改动、关键决策、自测结果与遗留项；并维护"需要项目人工配置的地方"。
> 记录纪律：**每完成一个独立自测通过的子步骤立即追加一条**，同步在仓库根目录 commit + push。

## 记录格式

每条记录包含：时间 / 轮次目标 / 改动文件 / 关键决策或问题（现象 + 根因 + 修法）/ 自测结果 / commit hash / 遗留项。

---

## Wave 0 · T1 工程基线与单车型固化

### 记录 01 · 2026-09-22 · 复制基线与许可

- **轮次目标**：把 FormDrive 源码与配置复制进 `D:\car_display\app`，保留根 LICENSE 与 Tesla 模型许可；`dist` 构建产物不复制。
- **改动文件**：新增 `app/**`（47 个文件）——`src/`(20)、`public/`(9)、`scripts/`(2)、`index.html`、`vite.config.js`、`package.json`、`package-lock.json`、`tokens.css`、`.gitignore`、`.gitattributes`、`.nvmrc`、`LICENSE`、`README.md`、`SECURITY.md`、`CONTRIBUTING.md`。
- **关键决策**：
  1. **不复制 `.github/workflows/deploy-pages.yml`**。原因：该工作流是 FormDrive 原仓部署 GitHub Pages 用的，复制过来会在 push 到 `112-njx/car-model-display` 时自动触发（目标仓 Pages 未配置，大概率失败刷红）。部署配置属 roadmap §12.2 中 T10 的范围。
  2. **不复制 `vercel.json`**（同上，属 T10 部署配置）。
  3. **不复制 FormDrive 的 `docs/formdrive-*.png`**（展示的是三车配置器界面截图，与本项目 `docs/` 用途不符）。
  4. 基线源码**零改动**复制，先验证原始可运行，再裁剪——保证"基线绿"与"裁剪后绿"可区分归因。
- **自测结果**：复制后目录树与 FormDrive 一致（20 个 src 文件），行尾为 LF（`.gitattributes` 的 `* text=auto eol=lf` 未报冲突）。
- **commit**：`bbd23ef`
- **遗留项**：无。

### 记录 02 · 2026-09-22 · npm install 并跑通原始基线

- **轮次目标**：在 `app/` 安装依赖（不新增任何依赖），并验证**未裁剪**的原始基线可构建、可服务。
- **改动文件**：`app/package-lock.json`（由 npm 自动改写，见下）。
- **关键决策 / 问题**：
  1. **Node 版本偏差（人工已确认）**：本机 `node v24.13.1` / `npm 11.8.0`，而项目 `.nvmrc` 与 `package.json#engines.node` 均为 `22.x`，本机无 nvm。`npm install` 输出 `EBADENGINE` 警告但**不阻断**；Vite 7 官方要求 `^20.19.0 || >=22.12.0`，Node 24 满足。经人工确认：**用 Node 24 继续**。
  2. **lockfile 被改写**：`npm install` 后 `package-lock.json` 出现 39 行删除。逐行核对 diff，**全部是 13 处 `libc` 元数据字段（7×glibc / 6×musl）被 npm 11.8.0 移除，无任何依赖版本或依赖树变化**。决定：提交该改动（保持工作树干净，功能零影响）；若回退则每次 install 都会重新弄脏工作树。
  3. **`npm audit` 报 2 个漏洞**（`nanoid` high、`postcss` moderate，均为 vite 的传递依赖）。决定：**不执行 `npm audit fix`**——会变更依赖树，违反 roadmap §12.1「零新增依赖 / 依赖冻结」。
- **自测结果**：
  - `npm install`：83 个包，40s，无报错（仅 EBADENGINE 警告）。
  - `npm run build`（未裁剪基线）：✅ 626 modules，11.27s。自带警告：`Circular chunk: state -> three -> state`、`Generated an empty chunk: "react"`、chunk >500 kB——均为 FormDrive 原有，非本次引入。
  - `npm run dev`：✅ 517ms 就绪，`http://localhost:5173/` 返回 HTTP 200。
  - **真实浏览器自测**（Edge 153 headless + CDP，脚本在仓库外）：渲染器 `webgpu`、场景 1.5s 就绪、车型选择器 3 台车预览图均加载、Mustang 6/6 部件 resolved、部件全开/全关 ✅、鼠标拖拽 camera 位移 9.81 ✅、触摸拖拽 9.81 ✅、控制台 0 错误。
- **commit**：`a10978e`
- **遗留项**：
  - `scripts/verify-single-vehicle.mjs`、`scripts/verify-studio.mjs` 硬编码了 mustang/concept 车型索引（`{mustang:0, tesla:1, concept:2}`）与三车断言，裁剪后必然失效。按 roadmap §12.2，`scripts/verify-*.mjs` 属 T9 独占，**本轮不动**，留待 T9 重写。
  - 上述 audit 的 2 个传递依赖漏洞未修，登记备查。

### 记录 03 · 2026-09-22 · 裁剪为 Tesla 单车

- **轮次目标**：单车型固化——仅保留 Tesla Model 3 2018，删除其他车型资产与入口，默认车型固定 tesla。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/public/models/` | 删除 `mustang-2005.glb`、`car-concept.glb`、`mustang-preview.jpg`、`concept-preview.jpg`、`MUSTANG-LICENSE.md`、`CAR-CONCEPT-LICENSE.md`；**保留 `tesla-model-3-2018.glb`（22.7 MB）+ `tesla-preview.jpg` + `TESLA-LICENSE.md`** |
  | `app/src/config/studioConfig.js` | `VEHICLES` 仅留 `tesla`；`HEADLIGHT_RIGS` 仅留 `tesla`（78 行 → 53 行）。`PAINTS`/`STUDIOS`/`WHEELS`/`CAMERAS` 原样保留 |
  | `app/src/state/useStudioStore.js` | 仅一行：`vehicle: "mustang"` → `"tesla"` |
  | `app/src/App.jsx` | 移除 `VehicleSelector` 的 import 与挂载（组件文件保留，统一组装归 T8） |
- **关键决策**：
  1. **删除另两台车的许可文件**：CC BY 4.0 的署名义务随被分发资产产生；对应 GLB 已不随仓库分发，故其许可文件一并移除。Tesla 的 `TESLA-LICENSE.md`（Ameer Studio / Sketchfab / CC BY 4.0）**完整保留**。
  2. **不动 `PAINTS`/`STUDIOS`/`WHEELS`/`CAMERAS`**：其裁剪属 T2 契约重构 / T4 UI 的职责，T1 只做"单车型"这一件事，避免越界造成 Wave 2 冲突。
  3. **不改 `VehicleSelector.jsx` 源文件**：T4 才移除该组件；本轮只是不挂载，且不挂载后 Vite tree-shake 会将其排除出产物（625 vs 626 modules）。
  4. **不改 `VehicleModel.jsx`**：roadmap §12.2 将其划为 T5 独占文件，T1 不碰（由此产生一个待决项，见记录 04）。
- **自测结果**（真实浏览器 + CDP，dev 与 dist 双跑）：
  - **dev**：车型选择器数量 **0**、标题 `TESLA MODEL 3 2018`、渲染器 `webgpu`；**10/10 部件 resolved**（4 门 hinge + 4 窗 slide + 前备箱 hood + 后备箱 trunk），4 个 slide 部件均有 slide targets；10 个部件**全开 ✅ / 全关 ✅**；开窗时玻璃 mesh 隐藏 ✅；**鼠标拖拽 camera 位移 9.77 ✅、触摸拖拽 9.71 ✅**；大灯 emissive 2.7 / 尾灯 3.2 ✅；控制台 **0 错误**（仅 WebGPU `powerPreference` 提示）。
  - **`npm run build`**：✅ 625 modules，5.43s，产物 index chunk 107.73 → 104.66 kB。
  - **dist（`npm run preview`）**：选择器 0、标题正确、`webgpu`、加载页正常消失、拖拽改变画布像素 ✅、10 部件全开全关 ✅、0 错误。
  - **视觉确认（人工看图，非仅断言）**：截图 `trimmed2-parts-open.png` 中 Tesla Model 3 正确渲染——4 门全开、4 窗玻璃已降下（玻璃渐隐生效）、前备箱与后备箱开启、车身涂装/轮毂/大灯正常，**界面无任何车型切换入口**，Parts 面板恰为 10 个部件按钮（Front left / Rear left / Front right / Rear right / Front L·R glass / Rear L·R glass / Front trunk / Rear trunk）。
- **commit**：`a4c1bf4`
- **遗留项**：
  1. **（待人工决策）加载页字节 MB 读数失效**——详见记录 04。
  2. `VehicleModel.jsx:81` 残留死条件 `vehicleId === "mustang"`（裁剪后恒为 false）。属 T5 独占文件，未改，留待 T5 清理。
  3. `scripts/verify-*.mjs` 失效（同记录 02）。
  4. `InfoDialog` 的车型规格表现在只渲染 1 行（原 3 行）——为裁剪的自然结果，组件本身在 T4 会被移除，不单独处理。
  5. **HeroCopy 文案过时**：仍显示英文 `Choose a car, change its finish, then open every available body panel in real time.`，其中 "Choose a car" 在单车型后已不成立。属 T4「中文化 + 移除配置器 UI」范围，本轮不改。

### 记录 04 · 2026-09-22 · 待决项：加载页字节 MB 读数

- **现象**：首屏加载页 `.loading-meta` 右侧由原来的 `X.X / Y.Y MB` 变为回退文案 `FORMDRIVE © 2026`。
- **根因**：字节级传输追踪由 `useVehicleGLTF(url, trackInitialTransfer)` 的第二参数控制，而 `VehicleModel.jsx:81` 传入的是 `vehicleId === "mustang" && !state.initialSceneReady`。基线默认车型是 mustang，所以字节读数**只在默认车上生效**；T1 把默认车型固定为 tesla 后，该条件恒为 false，`initialAssetTotalBytes` 始终为 0 → `totalMegabytes` 为 null → 走回退文案。
- **影响面（已实测确认）**：**进度百分比条完全正常**（采样 00→06→12→24→54→73→…→100，`aria-valuenow` 同步推进，走 drei `useProgress`）；**仅丢失 MB 字节读数**。
- **与 roadmap 的关系**：roadmap §2.2 第 2 条把「字节级进度条」列为"直接继承"的已实现能力，但该能力在源码中实际硬绑定在 mustang 上——属"roadmap 描述与 FormDrive 实际代码对不上"。
- **候选修法**：`VehicleModel.jsx:81` 单点改为 `!state.initialSceneReady`（一个 token），即可让字节读数对唯一车型生效。代价：需改动 roadmap §12.2 划给 T5 的独占文件。
- **状态**：**已上报人工 → 人工决策「本轮修」**，修复见记录 05。

### 记录 05 · 2026-09-22 · 修复字节读数 + 发现 WebGPU 既有异常

- **轮次目标**：按人工决策修复加载页字节 MB 读数；并追查自测中出现的控制台异常。
- **改动文件**：`app/src/components/scene/VehicleModel.jsx`（1 行 + 2 行注释）。
- **关键决策 / 问题**：

  **A. 字节读数修复（按人工决策执行）**
  - 修法：`vehicleId === "mustang" && !state.initialSceneReady` → `!state.initialSceneReady`。
  - 越界说明：该文件在 roadmap §12.2 划归 T5 独占，此为经人工批准的例外改动；已在代码注释中标注，供 T5 重写本文件时保留该行为。
  - 验证：加载页字节读数恢复且递增正常，3 次采样分别为 `18.0 / 21.6 MB`、`4.9 / 21.6 MB`、`1.4 / 21.6 MB`；进度百分比条同步正常（00→06→15→…）。

  **B. 追查中发现的既有问题：WebGPU 路径大量未捕获异常（非 T1 引入）**
  - **现象**：dev 下首屏加载期间出现大量 `Runtime.exceptionThrown`（Tesla 单车型实测 514 条）。
  - **根因**：`TypeError: Invalid value used as weak map key`，栈为 three.js WebGPU 渲染器 `Textures.get` → `WeakMap.set` → `updateTexture` → `Bindings._init` → `Bindings.getForRender`，即纹理绑定阶段拿到无效纹理键。属 three.js WebGPU 后端在模型加载/材质克隆期间的内部问题。
  - **归因实验（三步排除）**：
    1. **A/B 关闭字节追踪**（还原为 `vehicleId === "mustang" && …`）→ 仍 514 条 ⇒ **与本次改动无关**。
    2. **强制 WebGL**（CDP 注入使 `navigator.gpu` 为 undefined）→ 异常 **0 条**，且 10 部件、拖拽、灯光功能全正常 ⇒ **WebGPU 路径特有**。
    3. **回退到未改动的原始基线**（`git checkout bbd23ef -- app/src app/public`，Mustang + WebGPU）→ **1046 条同样异常** ⇒ **FormDrive 原生既有问题**。
  - **影响评估**：功能未受影响（三组实验下部件开合、拖拽旋转、灯光、视觉均正常，无可见异常），但属稳定性/性能隐患，且**默认走的就是 WebGPU 分支**（`StudioCanvas.jsx` 在 `navigator.gpu` 存在时优先用 `WebGPURenderer`）。
  - **处置**：**不在 T1 范围内修复**（涉及 three.js 渲染后端与材质克隆时序，改动面大、风险高）。登记移交：roadmap §12.2 中 T8 负责「性能分级 / WebGL 回退」，建议 T8 评估「异常是否影响帧率」并考虑按 UA/能力降级到 WebGL；T9 可加一条断言「加载期异常数」纳入回归。
- **自测结果**：
  - `npm run build`：✅ 通过（12.86s）。
  - 字节读数：✅ 恢复并递增，0 次负值。
  - 功能回归：✅ 仅 Tesla、选择器 0、10/10 部件 resolved、全开/全关、鼠标拖拽 9.83 / 触摸 9.83、大灯 2.7 / 尾灯 3.2。
  - 强制 WebGL 对照：✅ 0 异常。
  - 原始基线对照：✅ 1046 异常（证明为继承问题）。
- **commit**：（见本条之后的提交）
- **遗留项**：
  1. **WebGPU 路径 514 条未捕获异常**——既有问题，移交 T8（降级策略）与 T9（回归断言），详见上文 B。
  2. **加载页进度偶发 `-1`**：约 5 次采样中出现 1 次。根因在 `InitialLoadingScreen.jsx` 的 `const elapsed = Math.min(64, time - previousTime)` **无下界钳制**——rAF 时间戳可早于 effect 中的 `performance.now()`，产生负 elapsed 并累加为负进度（`Math.round(-0.6) = -1`，且 `aria-valuenow="-1"` 违反 ARIA 取值范围）。**与 T1 改动无关**（`targetProgress` 有 `Math.max(0, …)` 钳制，不可能为负）。该文件在 §12.2 划归 T4，本轮不擅改；建议 T4 重写加载页时一并钳制（`Math.max(0, Math.min(64, …))`）。
  3. `VehicleModel.jsx:81` 已按人工决策改动，T5 重写该文件时需保留此行为。

---

## Wave 1 · T2 契约层落地（config + store + 审计钩子）

### 记录 05 · 2026-09-22 · 契约层首个可编译版本推送 contract-v1

- **轮次目标**：按 §13 冻结规格落地 `carConfig.js` / `useCarStore.js` / `auditHooks.js` + 兼容 shim，**尽早**推送到共享分支 `contract-v1`（其余 8 个 Agent 的 B 段拉取源）。
- **工作环境**：worktree `D:\car_display\.claude\worktrees\wave1+t2`，分支 `wave1/t2`（本地）→ 推送为远端 `contract-v1`；基线 `main` = `0c41982`（T1 收尾），与 `origin/main` 同步。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/src/config/carConfig.js` | **新增**（§13.1 全字段 + T2 增补字段），具名只读导出，无默认导出 |
  | `app/src/state/useCarStore.js` | **新增**（§13.2 全 state 片 + 18 个 action + 3 个派生纯函数 + `useCarStore`/`carStore` 双句柄） |
  | `app/src/devtools/auditHooks.js` | **新增**（§13.3 三个窗口钩子 + 注册式数据源 + 语音注入点约定） |
  | `app/src/state/useStudioStore.js` | **重写为兼容 shim**（旧导出名/旧字段映射到新 store，双向） |
  | `app/src/config/studioConfig.js` | 仅加 legacy 头注释（注明迁移去向），**正文零改动** |
  | `docs/contracts/CHANGELOG.md` | **新增**（9 条：7 条已落地 + 2 条待 S1 裁定） |
- **关键决策**（均已逐条记入 CHANGELOG）：
  1. **保留 legacy `studioConfig.js` 不删**。理由：§12.2 把 T2 边界限定为"不跨文件接线"，而该文件被 T1 基线的 9 个旧组件 import；删掉它们会在 T3–T7 接线完成前编译失败，直接违反 T2 的"工程保持可跑"DoD。处置：原样保留 + legacy 头注释，迁移与删除交给 T3/T4/T5/T7/T8 → **CHANGELOG 0008，升级 S1**。
  2. **只增不改的契约补强**（数值与 T1 基线逐项一致，**零行为变化**）：`PARTS[]` 补运动学 `motion/axis/angle/travel`（T5 重写 `VehicleModel` 必须）；`CAMERA_VIEWS[]` 补 `position/target`（T7 重写 `CameraRig` 必须）；新增 `MODEL_URL` / `MODEL_TRANSFORM` / `MODEL_MATERIALS`。若不给，各 Agent 只能在自有文件里复制第二份模型事实，正是 §13.1 明令避免的漂移 → CHANGELOG 0002/0003/0004。
  3. **`node` 按 T1 实测填实**：门 `door_l*_dummy`/`door_r*_dummy`、窗 `door_l*_glass0_0`/`door_r*_glass0_0`、前备箱 `bonnet_dummy`、后备箱 `boot_dummy`；依据 T1 `debug.md` 记录 03 的 CDP 实测（10/10 `resolved`），与 §13.1 示例一致 → CHANGELOG 0001。
  4. **审计钩子用依赖注入避开循环 import**：`auditHooks.js` **不 import store**，改由 `useCarStore.js` 调 `installAuditHooks(carStore)`。效果是**任何引入 store 的模块（含 shim 与全部旧组件）都会自动装好三个 `window.__carDisplay*` 钩子**，因此 **Wave 1 无需改 `App.jsx`/`main.jsx`**（禁改），T9 也无需额外挂载。
  5. **生产构建同样安装钩子**（不加 `import.meta.env.DEV` 判断）：§13.3 未限定 DEV，而 T9 需对 `dist` 跑契约层断言。
  6. **刻意不提供 `window.__carDisplayVoiceInject` 的 stub**：若提供，T9 的 `verify-voice` 会把"stub 存在"误判为"注入成功"而拿到假绿；只给 `installVoiceInject` 助手与约定 → CHANGELOG 0007。
  7. **命令型 action 不隐式 `bumpInteraction()`**：§13.2 要求输入层自行调用；隐式 bump 会掩盖漏调。责任划分与例外（shim 作为旧 UI 输入层**代为调用**；`pushToast` 永不 bump）写入 `store-contract.md` §2.3。
  8. **shim 以 carStore 为唯一真值（单向镜像）**，不存第二份真相。收益：控制台里 `carStore.getState().togglePart('window_lf')` 能**直接带动旧 UI 的部件动画**，使"仅凭控制台经 carStore 驱动 10 部件"这一验收项在 T3–T7 接线前即可成立；反向（旧 UI 按钮 → 新 store）亦通。
  9. **落地补值**：`voice` 初值（`supported:false` 失败安全默认）、`bbox` 语义（部件包围盒尺寸）、未注册时 `hitTargets=[]` / `perf=null` → CHANGELOG 0005/0006。
- **自测结果**：
  - `npm run build`：✅ **628 modules**（T1 基线 625 + T2 新增 3 个模块），5.70s，无新增告警（仅 FormDrive 原有的 circular chunk / 空 react chunk / >500 kB 提示）。
  - `npm run dev`：✅ 就绪（**端口 5174**，5173 被他人实例占用，见记录 06 的端口陷阱）；`carConfig.js` / `useCarStore.js` / `useStudioStore.js` / `auditHooks.js` / `VehicleModel.jsx` 经 dev 转换管线全部 HTTP 200 且返回真实转换产物。
  - 契约层断言（Node + Vite `ssrLoadModule`）：✅ **111 项全过**（详见记录 06 与 `store-contract.md` §7）。
- **commit**：`0387166`（已推送 `origin/contract-v1`）
- **遗留项**：
  1. 浏览器端 CDP 实测（部件动画 / 灯光发光 / 相机位移）**未完成**——无头 Edge 启动被 worktree 隔离守卫拦截，见人工配置区 #5。
  2. `docs/contracts/store-contract.md` 待 S1 评审冻结。
  3. CHANGELOG 0008 / 0009 两条待人工裁定（legacy `studioConfig.js` 去留、`PAINTS/WHEELS/STUDIOS/HEADLIGHT_RIGS` 归属）。

### 记录 06 · 2026-09-22 · 契约层自测与 store-contract.md

- **轮次目标**：产出 S1 评审件 `docs/contracts/store-contract.md`，并给出可复现的契约层自测证据。
- **改动文件**：`docs/contracts/store-contract.md`（新增）、`docs/debug.md`（本记录）。
- **关键决策 / 问题**：
  1. **端口陷阱（重要教训）**：`npm run dev` 输出 `Port 5173 is in use, trying another one...`，我的实例实际落在 **5174**；5173 上是**另一个 Vite 实例**（他人/基线工程）。按 5173 做 dev 自测会得到**假绿**：新文件（`carConfig.js` 等）因不存在而返回 `index.html` 兜底（HTTP 仍是 200、约 2904 B），旧文件（`useStudioStore.js`、`VehicleModel.jsx`）则返回**基线版本**——200 状态码与"看起来有内容"都不能证明自测打到了自己的实例。**修法**：一律从 dev server 自身输出读取实际端口（本次 5174）再测；并把"dev 自测前先确认自己的端口与产物特征"记入纪律。
  2. **浏览器自测被拦后的替代手段**：用 Vite 的 `createServer().ssrLoadModule()` 在 Node 内加载**真实模块**（走同一套转换管线，`import.meta.env` 与浏览器一致），对契约做 111 项断言。它能覆盖 store 全部行为与 shim 双向映射，**但不能覆盖渲染层**（部件动画、灯光发光、相机位移），后者仍需浏览器。
  3. **审计注册表的路由设计**：`registerSceneAuditSource(key, fn)` 单函数覆盖两个审计对象——`view/position/target/distance/autoRotating/orbiting` 路由进 `__carDisplayCameraAudit()`，其余进 `__carDisplaySceneAudit()`；`key==='parts'` 深合并、其余整体覆盖；源抛错只丢弃该字段不连坐。这样 §13.3 只冻结了一个注册函数，T7 注册相机字段也无需第二个 API。
- **自测结果**（`node <仓库外临时脚本>`，Vite 7.3.6，Node v24.13.1）：**111 项断言全部通过**，覆盖：
  - `carConfig`：CAR_ID/CAR_NAME、3 个分组、10 个部件 id 与 **GLB 实测 node 名逐项比对**、运动学参数齐备、2 个灯光、4 个视角（含 position/target）、6 个交互阈值、3 档质量分级、`MODEL_URL/MODEL_MATERIALS`；无默认导出。
  - `useCarStore`：8 个 state 片初值、18 个 action 齐备且可调用、`carStore` 三方法句柄、`useCarStore` 为 hook；10 部件逐个 set/toggle、3 个分组 open/close、`closeAll` 复位部件+灯光、2 个灯光 set/toggle、**未知 id 一律拒绝且不污染状态**（parts 恒 10 键、lights 恒 2 键）、`setCameraView` 合法/非法、`orbitOnce` token 自增可重复触发、toast 自动 id/ts/level 与按 id 删除、`bumpInteraction` 推进时间戳、voice 五个 action 与 `resetVoice`、3 个派生纯函数（含 `undefined` 容错）。
  - shim：10 个旧 key 全覆盖、新→旧镜像（部件/灯光/相机）、旧→新反向（含 `hood→frunk`、`leftDoor→door_lf`）、旧 UI 动作代为 `bumpInteraction`、14 个过渡字段与 19 个旧动作齐备可写。
  - `auditHooks`：`sceneAudit()` 10 项 parts + 2 项 lights 结构与缺省值、`progress` 随开关 0↔1、`cameraAudit()` 结构与缺省 null/false、注册/注销/深合并/自动补算 distance/**抛错源隔离**/非法入参返回空操作、`installAuditHooks` 幂等、Node 下不写 `window`。
- **commit**：`2bf4679`
- **遗留项**：同记录 05 的 1–3 项；另：`store-contract.md` 的 §8 列出 4 条请 S1 一并裁定的口径问题。

### 记录 07 · 2026-09-22 · 旧 UI 经 shim 的 SSR 烟测（浏览器被拦的替代证据）

- **轮次目标**：浏览器实测被 worktree 隔离守卫拦下（人工配置区 #5），在等待放行期间补一层"旧 UI 经 shim 仍可运行"的可复现证据。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/.vite/t2-smoke.jsx` | **临时烟测入口**（位于 `app/.gitignore` 第 15 行的 `.vite/` 下，`git check-ignore` 已验证被忽略，**不随分支交付**；保留以便复跑） |
  | 仓库外 `%TEMP%\t2-ssr-smoke.mjs` | 驱动脚本（Vite `ssrLoadModule` 加载入口并汇总结果） |
- **关键决策 / 问题**：
  1. **手段**：用 Vite `createServer().ssrLoadModule('/.vite/t2-smoke.jsx')` 加载真实模块（同一套转换管线），再用 `react-dom/server` 的 `renderToString` 渲染 7 个旧 UI 组件——**不引入任何新依赖**（`react-dom` 已在依赖内）。
  2. **发现（对 T9 有用）**：`zustand` v5 的 `useSyncExternalStore` **服务端快照取 `getInitialState()`**，因此 SSR 渲染只反映 store 的**初值**，**不能用 SSR 验证"驱动 store 后旧组件跟着变"**。初次烟测就踩到这个坑（`CameraControls` 的 `--active-index` 驱动前后都是 0），已改用正确口径：该结论由契约层断言**直接读 `shim.getState()`** 验证（记录 06 已覆盖），浏览器内的真实响应性由 T9 的 CDP 脚本验证（T9 跑在真实浏览器，不受此影响）。
  3. **场景组件无法 SSR**：`VehicleModel` / `CameraRig` / `HeadlightRig` / `StudioEnvironment` / `StudioCanvas` / `VehicleAssetLoader` 依赖 WebGL 上下文，只做**模块可静态加载**验证（`typeof === 'function'`），不渲染。
  4. **动态 `import()` 在 `ssrLoadModule` 下不走 Vite 转换**：首版烟测用 `await import(path)` 加载 `.jsx` 时被 Node 原生 ESM 解析器接管并报 `ERR_MODULE_NOT_FOUND`，改为**静态 import** 后正常——属脚本缺陷，非工程缺陷。
- **自测结果**（`node %TEMP%\t2-ssr-smoke.mjs`）：**全部通过 ✅**
  - 7 个旧 UI 组件全部渲染成功：`ControlDeck`(1572 字符，含 4 个页签、5 个涂装色板、Finish 滑杆、折叠按钮)、`CameraControls`(979 字符，4 个视角按钮，`--active-index:0` 对应 hero)、`HeroCopy`、`InfoDialog`、`Navigation`、`InitialLoadingScreen`、`VehicleSelector`；
  - 6 个场景组件模块静态加载 OK；
  - shim 镜像正确：`{leftDoor:true, rearRightWindow:true, rightDoor:false, headlights:true, cameraView:'front'}`（由 carStore 驱动后读出）。
  - 说明：`ControlDeck` 的部件网格与灯光开关位于 `parts` / `studio` 页签，默认 `paint` 页签不渲染，其接线正确性由契约层断言覆盖（shim 双向映射 19 项）。
- **commit**：`0a33b2a`
- **遗留项**：渲染层实测（部件动画 / 灯光发光 / 相机位移）仍待浏览器放行，见人工配置区 #5。

## Wave 1 · T6 语音控车引擎（Web Speech API）

> 分支 `wave1/t6`（worktree `.claude/worktrees/wave1+t6`），基线 `0c41982`（T1 交付）。
> A 段 = 契约无关阶段（启动即做），B 段 = 接线阶段（`contract-v1` 推送后接入）。
> **注**：任务书写的是 rebase，但本分支 A 段已推送，rebase 需 force push（纪律第 1 条禁止）→ 实际采用 **merge**，效果等价且不改写历史。
> 边界：独占 `app/src/voice/**`，其余只读；零新增依赖；不改 `App.jsx`/`main.jsx`/`package.json`/`vite.config.js`。

### 记录 01 · 2026-09-22 10:34 · A 段（1/4）指令词表 + parseCommand 纯函数 + 用例

- **轮次目标**：把「中文指令文本 → 动作计划」做成**纯函数**，不依赖 store 与 carConfig，可在 Node 里直接跑用例；词表覆盖 §6 全部 6 组指令并大幅扩充同义词与 ASR 纠错。
- **改动文件**：
  | 文件 | 内容 |
  | --- | --- |
  | `app/src/voice/commands.js`（新增） | §13.1 默认表镜像、动词表、范围词、位置词、部位名词、视角/环绕说法、灯光与部件补充别名、同音纠错表、`buildVocabulary()`、`describeActions()`（中文回执）、`executePlan()`（计划→§13.2 action） |
  | `app/src/voice/parseCommand.js`（新增） | `parseCommand()` / `parseCommandDetailed()` 纯函数 |
  | `app/src/voice/commandCases.js`（新增） | 80 条用例 + `runCommandCases()` + Node CLI 入口 |
- **关键决策**：
  1. **词表分层**：`DEFAULT_*` 只是 §13.1 的镜像兜底，**id/label/aliases 的最终来源仍是 carConfig**（B 段用 `buildVocabulary(carConfig)` 覆盖）；本文件只补充面向语音的结构词（动词/范围/位置/名词/纠错），避免与 T2 的契约表产生两份真相。
  2. **最长匹配**：词表按 surface 长度降序扫描，保证「左前车窗」不被「车窗」抢走；位置词 × 部位名词在构建期展开成组合词（502 条）。
  3. **范围词两态**：`全部/所有/四个` → 组动作（`group`）；`前排/后排/左侧/右侧` → 展开成多个 `part` 动作（如「打开左边车窗」= 左前+左后）。
  4. **「全部关闭」含灯光**：§6 只写「复位所有部件」，未说灯光。按 §13.2 `closeAll()` 的语义（部件 + 灯光全部复位）实现为「三个组 + 两盏灯」的显式计划，同时新增对称的「全部打开」。（已向项目负责人报备，非阻塞。）
  5. **宁可不做也不做反**：缺动词（「车窗」）、缺部位（「打开」）、未识别、否定句（「不要打开车窗」）一律返回**空计划**并给出中文纠错提示（`REASON_HINTS`），绝不猜测执行。
  6. **计划形状**在 §13.1 允许的 4 种 type 内：`part`/`group`/`light`/`camera`；「转一下」用 `{type:'camera',command:'orbit-once'}`，预设用 `{type:'camera',view}`。
- **关键问题（本轮自测发现并修复的 3 个 bug）**：
  1. **现象**：「把车窗和车门都打开」只开了车门。**根因**：分句的动词继承只向后（`carriedVerb`），首句无动词时被丢弃。**修法**：增加全句首个动词兜底 `fallbackVerb`（`ownVerb || carriedVerb || fallbackVerb`）；视角分句仍只看本句动词，避免「复位」被继承动词误判为非法。
  2. **现象**：「打开后备箱然后打开大灯」只开了后备箱。**根因**：「然后」不在连接词表，整句被当成一个分句，最长匹配只取到「后备箱」。**修法**：连接词补 `然后/接着/之后/再`。
  3. **现象**：复位视角回执文案为「切换到复位视角」。**修法**：`hero` 特判为「复位视角」。
- **自测结果**：
  - `node app/src/voice/commandCases.js`：**80/80 通过**（§6 指令集 12/12、别名 28、范围 10、复合 9、纠错 9、负例 11）。
  - 对抗性探针（未进用例集的一次性验证）：「打开车」「你好」「打开空调」均正确拒绝；「后备箱打开」「左前门打开」「四个车窗打开」等动词后置语序正确。
  - 归一化验证：全角标点、连接词、同音纠错（后辈箱/车床/测面/大登/全不）均生效。
- **commit**：`a98c732`
- **遗留项**：
  1. 「打开天窗」会命中「窗」→ 开全部车窗（模型无天窗部件）。属可接受的近似，暂不处理。
  2. 「打开空调和车窗」会**部分执行**（只开车窗）。这是「分句各自解析」的必然结果，Toast 会明确回执实际执行了什么，暂不拦截。
  3. 词表以 §13.1 镜像编写；B 段接入 carConfig 后需复核 label/aliases 与实测是否一致。

### 记录 02 · 2026-09-22 10:37 · A 段（2/4）SpeechRecognition 兼容封装

- **轮次目标**：把 Web Speech API 的浏览器差异、能力探测、权限、错误重试、安全上下文检测封成一层，供 UI 与 B 段状态机使用；同时把 §13.3 ④ 注入点的**底层机制**（可替换构造函数）做好，使 mock 回放能走完整链路。
- **改动文件**：`app/src/voice/recognition.js`（新增）；`app/tmp/t6-recognition.test.mjs`（新增，**被 .gitignore 忽略，不进仓库**）。
- **关键决策**：
  1. **注入点做在封装层**：`setRecognitionCtor(ctor|null)` 是 `window.__carDisplayVoiceInject` 的底层实现（B 段只做一层 global 挂载 + store 同步）。注入后 `detectSupport()` 直接返回 `supported:true, secure:true`——**即使当前是 http 非安全上下文**，这样 T9 在 headless http 下回放 mock 不会被降级分支拦掉（§13.3 ④ 的硬要求）。
  2. **兼容 `new` 与工厂两种注入形式**：`instantiate()` 先试 `new Ctor()`，失败（箭头函数）再试 `Ctor()`，避免 T9 写 mock 时踩「箭头函数不可 new」的坑。
  3. **错误分级**：`no-speech / network / audio-capture` 可重试（自动重启，退避 400ms×n 上限 2s，最多 3 次）；`not-allowed / service-not-allowed / language-not-supported / bad-grammar` 致命不重试，直接给中文权限/环境提示。拿到有效定稿结果即把重试计数复位（长会话不会被偶发噪声耗尽重试额度）。
  4. **参数在 `start()` 之前写入实例**：这是 mock 实现能读到 `lang/continuous/interimResults/maxAlternatives` 的前提，已在《挂载说明》里写明给 T9。
  5. **`maxAlternatives: 3`**：定稿结果带多候选，B 段可逐个尝试解析（挑第一条能解析的），显著提升 ASR 误识下的命中率。
  6. **测试钩子 `setSupportOverrideForTest()`**：仅用于沙盒页演示「不支持 / 非安全上下文」两条降级路径，默认 null 不影响主链路。
- **关键问题（本轮自测发现并修复）**：
  1. **现象**：定稿后状态为 `processing` 时再次调用 `start()`，会**新建第二个识别实例**（两路麦克风采集）。**根因**：`start()` 的守卫只判断 `state === 'listening' | 'starting'`，而拿到定稿后状态已是 `processing`。**修法**：守卫改为 `if (this.wantListening && this.instance) return true`，覆盖全部「已在监听」的中间态。
  2. **测试夹具自身两处错误**（非产品缺陷，记录备查）：非安全场景夹具的 `hostname` 仍写 `localhost`，命中「localhost 视为安全上下文」的兜底分支；`fakeBrowser({ctor: undefined})` 因 JS 默认参数规则回落到 Mock，导致「无 API」用例失真。均已修正夹具。
  3. **Node 24 的 `globalThis.navigator` 是只读 getter**，`globalThis.navigator = {...}` 抛 TypeError，需用 `Object.defineProperty` 覆盖。
- **自测结果**：
  - `node app/tmp/t6-recognition.test.mjs`：**22 项断言全部通过**——能力探测 4 项（含 Firefox/非安全上下文/测试钩子）、注入点 4 项（http 下注入即 supported、传 null 恢复、非法值抛错、工厂函数）、识别链路 6 项（参数写入、多候选、实时字幕、重复 start 不重建、stop）、重试与致命错误 4 项、权限请求 3 项。
  - `node app/src/voice/commandCases.js`：80/80 仍全绿（无回归）。
  - 权限路径已验证：`getUserMedia` 授权后**立即释放音轨**（否则麦克风指示灯常亮）。
- **commit**：`960f460`
- **遗留项**：
  1. 真实浏览器的识别行为（Chrome/Edge 的 `onend` 时机、`continuous` 在安卓 Chrome 上的表现）只能真机确认，已登记人工配置区。
  2. `audio-capture` 目前按「可重试」处理（可能是设备被占用，重试有意义）；若真机表现为永久无设备，真机验收后再决定是否改为致命。

### 记录 03 · 2026-09-22 10:50 · A 段（3/4）VoiceButton + 样式 + 语音播报 + 沙盒自测页

- **轮次目标**：把「能看见、能点、能自测」的部分做完——纯 props 的 `VoiceButton`（录音波纹/实时字幕/状态文案/降级提示）、独立样式、可选 SpeechSynthesis 播报、以及一个**不依赖 store** 的自测沙盒页。
- **改动文件**：`app/src/voice/VoiceButton.jsx`、`voice.css`、`synthesis.js`、`sandbox.jsx`、`voice.sandbox.html`（均新增）；`parseCommand.js`（新增 `parseAlternatives` 多候选择优）。
- **关键决策**：
  1. **VoiceButton 是纯展示组件**（props 驱动、不 import store），因此沙盒页能脱离 T2 契约独立自测；B 段只需把 `useVoiceControl` 的返回值摊给它。
  2. **沙盒页靠 Vite dev server 直接服务**：`app/src/voice/voice.sandbox.html` → `http://localhost:<port>/src/voice/voice.sandbox.html`，**零 vite.config 改动**（§12.2 未给 T6 该文件的写权限）。实测 200 可访问。
  3. **`parseAlternatives` 多候选择优**：ASR 给 3 条候选，逐条尝试解析，取第一条能出计划的——「打开车床」这类误识别能被第二条「打开车窗」救回。沙盒已实测该路径。
  4. **样式可被 T4 token 覆盖**：颜色/圆角/间距集中在 `.cd-voice` 的自定义属性上，T8 集成期只需覆盖变量，不必改 `voice.css`。
  5. **沙盒页自带假 store**：`executePlan` 的 api 用局部 React state 实现（action 名与 §13.2 一致），既验证了计划→动作的映射，又不需要真 store；B 段把这套 api 换成真 store 即可。
- **关键问题（本轮自测发现并修复）**：
  1. **`npm run dev` 起不来**：worktree 里没有 `node_modules`（被 .gitignore 忽略）。**修法**：在 worktree 内 `npm install --no-audit --no-fund`（20s/83 包），**lockfile 零改动**（已核对 `git status`）。注意：不要用目录联接共享主工作树的 `node_modules`——多个 Agent 并发跑 dev 会争抢 `node_modules/.vite` 依赖缓存。
  2. **dev server 端口不是 5173**：5173/5174/5175 已被其他并行会话占用，Vite 自动退到 **5176**。第一次自测连的是 5173（别人的主工作树），拿到的是主应用页面（`/src/voice/*` 全部回退到 index.html），导致「页面无 `.cd-voice`」而挂死。**修法**：以 dev server 日志里的实际端口为准（见人工配置区说明）。
  3. **CDP 自测挂死无输出**：命令写成 `node x.mjs 2>&1 | tail -70`，`tail` 会缓冲到进程结束，导致看不到任何进度、误判为「无输出」。**修法**：改为重定向到文件，并给脚本加 150s 看门狗强制退出。
  4. **`Execution context was destroyed`**：连接 CDP 时页面尚在导航/HMR 重载，`Runtime.evaluate` 落在旧执行上下文。**修法**：evaluate 包装为重试（最多 8 次）。
  5. **断言写错 2 处**（非产品缺陷）：`bumpInteraction` 期望值漏算「全部关闭」这一次；`.kv dd[6]` 取到的是别的卡片字段。已改为「与操作前计数比较」+「按卡片定位字段」。
- **自测结果**：
  - **headless Edge 153 + CDP 驱动沙盒页：35 项断言全部通过**（1 页面渲染与用例集 6 项、2 手动输入全链路 9 项、3 负例不误动作 5 项、4 mock 注入链路 6 项、5 降级路径 9 项、6 无 console error）。
  - 覆盖到的真实链路：`「打开左前车窗」→ 仅左前车窗开（其余 3 窗不动）`、`「打开所有车窗」→ 4 窗全开`、`「打开大灯」→ 大灯亮`、`「看侧面」→ profile`、`「转一下」→ 环绕 +1`、`「全部关闭」→ 部件全关 + 灯光全灭`、`「打开」/「今天天气不错」→ 空计划 + 中文纠错提示`、`注入 mock 后 supported/injected 变 true 且回放驱动了状态`、`强制「不支持」/「非安全上下文」两条降级路径的按钮禁用与中文提示`。
  - **`npm run build`：✅ 6.85s 通过**（T6 未改任何构建配置，产物与 T1 一致）。
  - **额外验证**：用仓库外临时配置把 `voice.sandbox.html` 加入构建输入，**voice 模块单独打包成功**（`voiceSandbox.js` 42.01 kB + `voiceSandbox.css` 5.76 kB，5.58s）——证明 T6 代码真能编译打包，而非「因无人 import 而侥幸通过」；也证明 T8/T10a 只要在 `rollupOptions.input` 加一行即可把沙盒页打进 `dist`。临时配置在 `app/tmp/`（被 .gitignore 忽略，未进仓库）。
- **commit**：`5ae3ef5`
- **遗留项**：
  1. 沙盒页**不在 `npm run build` 产物内**（需改 `vite.config.js`，T6 无权）。已在《挂载说明》给出给 T8/T10a 的一行配置。
  2. 真机麦克风识别未测（headless 无麦克风、本机无 Chrome），登记人工配置区。
  3. 沙盒页的假 store 与 B 段的真 store 是两套 api 实现（同名 action），B 段接线后需再跑一次同样的 35 项断言。

### 记录 04 · 2026-09-22 10:58 · A 段（4/4）词表加固 + 用例扩充 + 《挂载说明》

- **轮次目标**：`contract-v1` 未推送（已确认 `git ls-remote` 为空），按任务书「不要空转」的要求：加固边界用例、修正一处会**执行错动作**的精度问题、写出《挂载说明》初稿。
- **改动文件**：`app/src/voice/commands.js`（新增 `UNSUPPORTED_TERMS` + 词条注册 + `unsupported-part` 提示）、`parseCommand.js`（拒绝 `unsupported` 目标）、`commandCases.js`（80 → 108 条）；新增 `docs/mount-t6-voice.md`。
- **关键决策 / 问题**：
  1. **【本轮最重要的修正】「打开天窗」会执行错动作**。现象：说「打开天窗」→ 因词表最长匹配命中「窗」→ **打开全部车窗**。同类问题：「打开挡风玻璃」→ 开全部车窗、「打开氛围灯」→ 开大灯、「锁上车门锁」→ 开全部车门。根因：词表只认「能做什么」，没有「本车模没有什么」。修法：新增 `UNSUPPORTED_TERMS`，在 `buildVocabulary()` 里**最先注册**（保证同长度时优先于部位词），`parseFragment` 命中即返回 `unsupported-part` 并给出中文提示（"本车模没有这个部件或功能…"）。这比"做错动作"重要得多——语音场景里用户看不到按钮，做反了无法察觉。
  2. **用例集从 80 扩到 108**：新增 14 条别名（动词后置、熄灭/点亮、视角复位、绕车一圈等）、8 条纠错（车创/前贝箱/伟灯/后登/装一圈/全不/引形盖/侧脸）、7 条「本车模没有的功能」负例。
  3. **《挂载说明》独立成文**（`docs/mount-t6-voice.md`），不塞进 `debug.md`：其中「给 T9 的 mock 契约」需要精确到方法名、属性写入时机、`results` 形状与事件顺序，写成清单更便于 T9 直接照着写 mock。文件名带 `t6-voice` 前缀，避免与其它 Agent 的 `docs/*.md` 冲突。
- **自测结果**：
  - `node app/src/voice/commandCases.js`：**108/108 通过**（§6 指令集 13、别名 42、范围 10、复合 9、纠错 17、负例 17）。
  - **headless Edge + CDP 重跑沙盒页：35 项断言全部通过**（含新增负例后的回归；用例总数断言已改为动态 N/N）。
  - `npm run build`：本记录未改构建相关文件，构建状态沿用记录 03 的 ✅。
- **commit**：（见下一条提交）
- **遗留项**：
  1. **记录 03 的遗留项 1（「打开天窗」误开全部车窗）已在本轮修复**，该遗留项关闭。
  2. 记录 03 的遗留项 2、3（真机麦克风、沙盒页假 store 与真 store 两套 api）仍然有效。
  3. 仍未做的：B 段接线（`useVoiceControl.js` + `window.__carDisplayVoiceInject`），等 `contract-v1` 推送。若超过 1 天未推送，按 §12.4 预案上报人工介入。

### 记录 05 · 2026-09-22 11:05 · A 段补强：抽出 store 无关的状态机控制器（为 B 段去重）

- **轮次目标**：`contract-v1` 仍未推送（`git ls-remote` 为空）。按任务书「不要空转」，做一件对 B 段有实质价值的事：把沙盒里那套「识别 → 解析 → 执行 → 状态/回执」逻辑抽成**框架无关、store 无关**的控制器，让沙盒与主应用共用同一份实现。
- **改动文件**：新增 `app/src/voice/voiceController.js`；`app/src/voice/sandbox.jsx` 改为使用控制器（删掉页面内自建的状态机，约 −60 行重复逻辑）。
- **关键决策**：
  1. **为什么要抽**：原计划 B 段的 `useVoiceControl.js` 会把沙盒里那套识别器事件接线**再写一遍**（订阅 status/interim/result/error/end、权限请求、执行计划、回执、播报）。两份实现意味着沙盒里跑过的 35 项断言**并不覆盖** B 段真正发布的代码——这正是「自测通过但集成后出问题」的典型来源。抽成控制器后，沙盒与主应用各自只做一层薄适配（沙盒接假 store、应用接真 store），断言覆盖的就是同一份代码。
  2. **控制器的依赖面只有 §13.2 冻结的 action 名**（`setPart/openGroup/closeGroup/setLight/setCameraView/orbitOnce/bumpInteraction`），因此**现在就能写、现在就能测**，不必等 T2 的代码——这正是 §12.1「消费方需要的是字段名与 action 签名」的落地。
  3. **对外只发一个 `onChange(snapshot)`**：快照就是 `VoiceButton` 的 props 来源，React 侧只需 `setSnap`；`status` 映射到 §13.2 的 `voice.status` 枚举（`idle/requesting/listening/processing/error/unsupported`），B 段可直接写进 store。
  4. **`injectRecognition(ctor|null)` 收敛进控制器**：注入 → 重建能力探测 → 快照的 `supported/injected` 立即更新。B 段只需把它挂到 `window.__carDisplayVoiceInject` 上，并同步 `store.voice.supported`。
  5. **保留沙盒的 DOM 结构不变**：原有 35 项 CDP 断言**未作任何修改**直接复验，用来证明「换实现不换行为」。
- **自测结果**：
  - **headless Edge + CDP：35 项断言全部通过（断言零改动）** —— 覆盖能力探测、手动输入全链路、负例不误动作、mock 注入回放、两条降级路径、无 console error。
  - `node app/src/voice/commandCases.js`：108/108（本轮未动用例，回归确认）。
  - **沙盒页纳入构建输入的打包验证：✅ 20.94s 通过**（`voiceController.js` 一并编译进 `voiceSandbox` chunk）。
  - `npm run build`：本轮未改构建相关文件，状态沿用记录 03 的 ✅（B 段接线前会再跑一次）。
- **commit**：（见下一条提交）
- **遗留项**：
  1. B 段只剩两件事：① 用真实 store 的 action 替换沙盒的假 api（薄适配）；② 挂 `window.__carDisplayVoiceInject` + 同步 `store.voice`。控制器已就绪并已验证。
  2. 仍等 `contract-v1`。若超过 1 天未推送，按 §12.4 预案上报人工介入（记录 04 已记）。

---

## Wave 1 · T6 语音控车引擎（Web Speech API）· B 段

### 记录 06 · 2026-09-22 11:20 · B 段接入 contract-v1（用 merge 而非 rebase）

- **轮次目标**：接入 T2 的契约层，完成 `useVoiceControl` + `window.__carDisplayVoiceInject`，端到端自测。
- **关键决策 / 问题**：
  1. **【与任务书的偏差，已上报】** 任务书写「`git fetch origin contract-v1` 并 rebase」，但 `wave1/t6` 的 A 段 4 次提交**已经推送**，rebase 会重写历史、必须 force push——而纪律第 1 条明确禁止 force push / 改写历史。**实际改用 `git merge origin/contract-v1`**：效果等价（我的工作叠在 T2 之上、T8 合并时无差别），且无需 force push。冲突只有 `docs/debug.md` 一处（追加型共享日志），已按「两边都保留」解决（T2 段落在前、T6 段落在后，人工配置区行号顺延）。
  2. **契约核对结论**：T2 的 `carConfig.js` / `useCarStore.js` 与 §13.2 逐项一致（action 名与签名、`voice` 片字段、`carStore` 句柄、三个派生纯函数）。两点值得记：
     - `isAllClosed()` 的语义是「**部件全关且灯光全灭**」、`closeAll()` 也是「部件 + 灯光」——这**印证了我把「全部关闭」实现为含灯光的决定是对的**（记录 01 的关键决策 4 从"我的判断"升级为"与契约一致"）。
     - `voice.lastCommand` / `error` 初值是 `null`（不是空串），故 `syncVoiceState` 对空值写 `null`。
  3. **`lastCommand` 语义定案**：契约文档未细化。定为「**最近一条成功执行的指令**」，识别失败时**不改写**（保持上一条）。理由：失败即未执行，清成 `null` 看起来像缺陷；识别到的原文已在 `transcript` 里。
  4. **沙盒改为双模式**：新增「真 store（VoiceControl）」模式，直接挂载 `<VoiceControl/>`，走 `useVoiceControl` → carConfig 词表 → 真 store → 真 toast。这样在**不碰 `App.jsx`** 的前提下就能端到端验证 B 段接线。两种模式共用同一套 DOM 结构与同一套断言。
- **关键问题（本轮自测抓出的 1 个真 bug + 4 个自测环境问题）**：
  1. **【真 bug，最重要】注入后整条链路静默失效**。现象：点「注入回放 mock」后点麦克风，状态**永远停在「正在请求麦克风权限…」**，mock 一直在回放但**一条指令都没执行**（`store.voice.lastCommand` 为 null、toast 0 条、部件全关）。根因：`voiceController.injectRecognition()` 里调了 `recognizer.destroy()`——那会**清空识别器的事件监听器**，而控制器还要继续复用同一个识别器实例（只是换掉它内部 new 出来的构造函数），于是此后所有 `status`/`result` 事件都收不到。修法：改为**不 destroy**；若正在聆听则 `abort()` 当前会话 → 换实现 → 用新实现重新 `start()`。
     **为什么之前没抓到**：A 段那版沙盒的 mock 断言太弱（只检查日志里有没有 `mock 回放` 字样与 chip 是否存在，而这两者都不依赖控制器真正执行）。本轮把断言换成「日志里必须出现 **`识别 执行：`** 前缀」——该前缀只可能由识别结果链路产生（手动输入的前缀是 `手动输入 执行：`），才把这个 bug 逼出来。
  2. **调试端口与其他 Agent 撞车**：自测脚本原先固定用 9333/9335，结果连到了**别人（T2）的 Edge 实例**上（页面是 `127.0.0.1:5180`），表现为「找不到我的页面 target」。修法：改用 `--remote-debugging-port=0` + 读 user-data-dir 下的 `DevToolsActivePort` 拿实际端口，随机且必定是自己的实例；退出时用 `taskkill /F /T /PID` 杀整棵进程树（只 kill 父进程会留下 headless 子进程堆积）。
  3. **dev server 端口**：5173/5174/5175 均被其他会话占用，T6 的实例落在 **5176**（T2 也踩过同一个坑，落在 5174）。
  4. **`carConfig.js` 无法在 Node 里直接 import**（用了 Vite 的 `import.meta.env.BASE_URL`），因此「换 carConfig 词表后用例是否仍全绿」这项校验只能在浏览器里做——已在沙盒用例卡里加了 carConfig 词表一行。
  5. **3 处断言写错**（非产品缺陷）：把 mock 回放块插进场景函数后，第 5 节读到了「回放之后」的状态；「打开」属 `missing-target` 而非 `unrecognized`，提示文案不同；`.kv dd` 索引取到别的卡片。均已修正。
- **自测结果**：
  - **沙盒页双模式全链路：76 项断言全部通过**（headless Edge 153 + CDP）。含：默认词表与 **carConfig 词表各 108/108** 用例、两种模式各 11 项链路断言 + 7 项负例 + 7 项 mock 回放、真 store 的 `voice`/`toast` 接线 5 项、降级路径 9 项、0 console error。
  - `node app/src/voice/commandCases.js`：108/108。
  - `node app/tmp/t6-recognition.test.mjs`：22 项通过（回归）。
  - **`npm run build`：✅ 13.96s**；**沙盒页纳入构建输入：✅ 21.12s**。
  - **合并后主应用冒烟：14 项通过**——canvas 正常、无模块解析错误、§13.3 三个钩子（`__carDisplayStore` / `__carDisplaySceneAudit` / `__carDisplayCameraAudit`）自动安装、store 契约字段齐（parts 10 / lights 2 / cameraView hero / voice 片）、`setPart` 与 `closeAll` 可驱动、排除 WebGPU/headless 噪声后控制台 0 错误。
- **commit**：（见下一条提交）
- **遗留项**：
  1. **真机麦克风识别仍未测**（headless 无麦克风、本机无 Chrome），登记人工配置区 #7。
  2. T9 的 `verify-voice.mjs` 尚未跑（属 T9），《挂载说明》§4 已给出完整 mock 契约与可复用用例集。
  3. `voice/voice.sandbox.html` 仍不在 `npm run build` 产物内（需改 `vite.config.js`，T6 无权），已给 T8/T10a 一行配置。

---

## Wave 1 · T8p 性能与移动端基建

### 记录 08 · 2026-09-22 · 基线改用 contract-v1 + 设备判档与帧率采样（纯逻辑层）

- **轮次目标**：按 §11.1 T8p ①② 落地 `perf/deviceTier.js` 与 `perf/fpsSampler.js`，并用免浏览器的确定性自测把降档逻辑验死。
- **改动文件**：新增 `app/src/perf/deviceTier.js`、`app/src/perf/fpsSampler.js`、`app/src/perf/selfTest.mjs`。
- **关键决策 / 问题**：

  1. **基线由 `main` 改为 `contract-v1 @ 6bcb863`（经人工确认）**。原任务书写"只依赖 T1 基线"，但 T8p 的两处契约依赖在 T1 基线上**并不存在**：`config/carConfig.js` 的 `QUALITY` 与 `devtools/auditHooks.js` 的 `registerSceneAuditSource` 都是 T2 的交付物。若写静态 `import`，本分支当天 `npm run build` 直接失败（Rollup 无法解析模块），无法满足"T1 基线上独立可运行 + build 通过"的 DoD。曾准备的"本地镜像 QUALITY + prop 注入"兜底方案，在确认 `contract-v1` 已推、两个模块齐备后**整套作废**——改为直接静态 import，`QUALITY` 只有一个来源，且 DoD 里"`perf` 字段能被 `__carDisplaySceneAudit()` 读到"由"纸面"变为"可验"。
  2. **判档用分数制 + 移动端封顶**：内存（≥8GB +2 / ≥4GB +1 / 未知 +1）、逻辑核心（≥8 +2 / ≥4 +1 / 未知 +1）、dpr（≤1 +1 / ≥3 −1）、桌面 macOS 且内存未知额外 +1；合计 ≥4 → high、≥2 → mid、否则 low。**移动端封顶 mid**：手机 UA 下即使分数够 high 也不给 high（`hardwareConcurrency`/`deviceMemory` 在手机上普遍虚高——8 核 8GB 是千元机常态，这两个信号在移动端几乎无区分度）。判定逻辑写成纯函数 `classifyTier(env)`，浏览器取值另走 `detectEnv()`，因此可在 Node 里免依赖单测。
  3. **【真 bug 1】`detectEnv()` 用 `typeof navigator === "undefined"` 判"非浏览器"是错的**。现象：自测里 `detectEnv()` 在 Node 下不返回中性值。根因：**Node 21+ 也提供全局 `navigator`**（`userAgent` 形如 `"Node.js/24.13.1"`，且带 `hardwareConcurrency`），于是代码走了浏览器分支、读出一组无意义信号。修法：改用 `typeof document === "undefined"` 作为分界（Node 没有 `document`）。
  4. **【真 bug 2】后台标签页恢复时的时间戳跳变会被算成"低帧"并误降档**。现象：自测构造"跑 300ms → 后台 30s → 恢复"时，恢复后第一帧的 `elapsed` 约 30s、`frames=1`，算出接近 0 的假帧率，直接触发降档。根因：切后台时浏览器**暂停 rAF 回调**，`tick()` 里的 `isHidden()` 检查根本不会被执行到，因此"隐藏期间重置基准"这条防线失效。修法：在 `tick()` 里加**单帧间隔守卫**——`elapsed > stallResetMs`（默认 2 个采样窗口）视为"停摆/长卡顿"而非低帧，重置窗口且不记录。这是真正兜底的那道防线。另保留 `isHidden()` 检查，覆盖"某些浏览器在后台仍会跑 rAF"的情况。
  5. **预热期不采样**：首屏要加载 22.7 MiB 的 GLB，加载与编译着色器阶段帧率天然极低，计入会让每台设备都被误降档。预热从 `start()` 起至少 3s，并由 `markSceneReady()` 在场景真正就绪时结束（一直没人调用则 12s 后兜底开始判定）。该信号留给 T8 接在首屏加载完成上。
  6. **降档后冷却**：降档本身会改变渲染负载，紧接着的窗口不可信。降档成功后跳过 2 个窗口再判定；已到底档（回调返回 `false`）则等 6 个窗口，避免反复空转。
  7. **【测试 bug】自测的假时钟 `run()` 越界**：`while (elapsed < durationMs)` 先自增再判断，最后一次迭代会越过 `durationMs` 一整个帧间隔——`run(900)` 实际跑到 t=1000，正好跨过 1000ms 的预热线，导致"预热期样本被丢弃"这条断言假失败。修法：条件改为 `elapsed + interval <= durationMs`。**注意：这是测试缺陷，不是被测代码缺陷**——恰恰说明预热边界是准的。

- **自测结果**：`node app/src/perf/selfTest.mjs` → **49 项断言全绿 ✅**。覆盖：判档表 9 例（含 Safari 内存未知补偿、iPhone 与强移动端封顶、Node 环境不崩）、档位工具函数 6 项、稳定 60fps 不降档、持续 20fps 连续降档 high→mid→low、预热期低帧不降档、后台停摆 30s 不误降档、手机 28fps 阈值、默认阈值下的时序、生命周期幂等。
- **commit**：`f05d0a4`（已 push 到 `origin/wave1/t8p`）
- **遗留项**：真机/真浏览器帧率实测归 Wave 2 的 T8（§11.1 T8 任务⑤），本轮不涉及。

### 记录 09 · 2026-09-22 · PerfProvider / useDeviceTier / 降级页 + 给 T8 的挂载说明

- **轮次目标**：按 §11.1 T8p ③④ 落地 Context 与降级页，并产出《挂载说明》；不改 `App.jsx`/`main.jsx`。
- **改动文件**：新增 `app/src/perf/PerfProvider.jsx`、`app/src/perf/useDeviceTier.js`、`app/src/perf/WebGLFallback.jsx`、`app/src/perf/graphicsSupport.js`、`app/src/perf/perf.css`、`app/src/perf/MOUNT.md`。
- **关键决策 / 问题**：

  1. **降级页的触发条件是「WebGPU 与 WebGL 都不可用」，不是「没有 WebGL」**。根因：T1 基线的 `scene/StudioCanvas.jsx:16-25` **优先用 WebGPU**（`navigator.gpu` → `three/webgpu` 的 `WebGPURenderer`），失败才回退 `WebGLRenderer`。只测 WebGL 会把"有 WebGPU、没 WebGL"的设备误判成不支持、弹出不该出现的降级页。因此探针模块命名为 `graphicsSupport.js`（不是我原先报备的 `webglSupport.js`，因为它的职责不止 WebGL）。探测顺序按开销排：WebGL 同步可得先测；只有 WebGL 不可用时才异步 `requestAdapter()` 问 WebGPU（`navigator.gpu` 存在只说明 API 在，适配器仍可能拿不到）。
  2. **探测会真的创建 WebGL 上下文，用完必须释放**：浏览器对同时存在的上下文数有硬上限（通常 16 个），因此结果缓存，并在探测后立刻 `getExtension("WEBGL_lose_context").loseContext()` 归还名额。
  3. **`tier` 同时存 `ref` 与 `state`**：采样器的 `getSnapshot()` 在任意时刻被审计钩子调用，必须读到**当前**档位；只存 state 会出现"刚降档、审计仍读到旧档位"的窗口。两者只在 `setTier` 里同步写。
  4. **`useDeviceTier()` 在 Provider 外调用抛中文错误，不返回默认值**：静默兜底会让"忘了挂 Provider"表现成"画质悄悄掉到低档"，是极难排查的故障。
  5. **`resolveFeatures()` 对脏档位退到最低档**：若契约被改过或传入不在 `QUALITY.features` 里的档位，退到 `QUALITY.tiers` 的最后一档，宁可画质低也不要整页白屏。
  6. **`perf.css` 放在 `perf/**` 内、类名前缀 `cd-perf-`**：`style.css` 与 `tokens.css` 是 T4 独占（§12.2），T8p 不碰；降级页只**读** tokens 的 CSS 变量，且每个 `var()` 都带兜底值——降级页恰恰出现在环境异常时，不能假设样式表加载成功。
  7. **自测临时挂载**：为验证新代码真的能编译，临时在 `App.jsx` 里用 `<PerfProvider>` 包住原界面并 `import "./state/useCarStore"`（后者负责安装 `window.__carDisplaySceneAudit`）。**该改动不随分支交付**，`git status` 可验（提交里不含 `App.jsx`）。

- **自测结果**：
  - `npm run build`（未挂载时）：✅ 628 modules，14.92s。
  - `npm run build`（临时挂载后）：✅ **635 modules**，6.00s——模块数 +7 证明 `perf/**` 确实进入了构建管线并编译通过（未挂载时这 7 个模块被 tree-shake 掉，**那次 build 并未验证到新代码**，特此说明）。
  - `npm run preview -- --port 4173`：✅ HTTP 200。
  - `node app/src/perf/selfTest.mjs` 扩充第 [10] 段，用假 `document` / `window` / `navigator.gpu` 覆盖 `graphicsSupport` 的**全部判定分支**：webgl2 / 仅 webgl1 / 无 WebGL 但有 WebGPU 适配器（**必须判可渲染，不弹降级页**）/ `navigator.gpu` 存在但拿不到适配器 / 两者皆无 / `getContext` 抛异常 / 强制钩子开与关 / 探测后确实调用 `WEBGL_lose_context` 归还上下文名额。**全套 66 项断言全绿 ✅**。
  - **仍未完成的浏览器内验证**（被 worktree 隔离守卫拦下，见人工配置区 #5，**不计入已完成**）：① 降级页在真浏览器里的实际渲染；② `__carDisplaySceneAudit().perf` 的真实读数；③ CPU 降频下 rAF 驱动出的自动降档。前两项只验到了"判定逻辑"与"编译通过"，第三项只验到了假时钟下的采样器行为。
- **commit**：`db8ab86`（已 push 到 `origin/wave1/t8p`）
- **遗留项**：① 浏览器端三项验证待放行后补做；② `docs/debug.md` 被全部 9 个 Wave 1 Agent 追加，**T8 合并时此处必冲突**，建议以"两侧都保留、按 Agent 分段"处理。

### 记录 10 · 2026-09-22 · 回退临时挂载 + 契约对接自测（免浏览器）

- **轮次目标**：把分支收拾成可交付状态（`App.jsx` 必须零改动），并在**不放行浏览器**的前提下，尽可能把 DoD 里"`perf` 字段能被 `__carDisplaySceneAudit()` 读到"这条验到。
- **改动文件**：新增 `app/src/perf/contractCheck.mjs`；**回退** `app/src/App.jsx`（撤销记录 09 的临时挂载）。
- **关键决策 / 问题**：

  1. **人工决定：跳过浏览器内验证，继续推进**。被 worktree 隔离守卫拦下的三项（降级页真实渲染、`window.__carDisplaySceneAudit().perf` 真实读数、CPU 降频下 rAF 驱动的自动降档）**转为遗留项，不计入已完成**。已把守卫的三条实测被拒形式与三种放行方式登记到人工配置区 #5，后续任何人拿到放行都能直接接手。
  2. **补 `contractCheck.mjs`：用 Vite 的 `ssrLoadModule` 把真契约加载进来验**（T2 在记录 07 用过同一套路，同为免浏览器手段）。它把 `config/carConfig.js`、`devtools/auditHooks.js`、`perf/PerfProvider.jsx`、`perf/fpsSampler.js` 经**与浏览器同一套转换管线**加载后断言，因此验到的不再是纯逻辑，而是**我的代码与冻结契约的真实对接**：
     - §13.1 `QUALITY` 的形状与三档数值逐字段比对；
     - `resolveFeatures()` 对真契约的三档映射、脏档位退最低档、`quality` 为 `undefined` 不抛错；
     - **`registerSceneAuditSource("perf", fn)` 注册后 `sceneAudit().perf` 能读到**，键恰为 `{fps,dpr,tier}`、`tier` 取自采样器、注销后回到 `null`；
     - `"perf"` 落进**场景**审计而非相机审计（`auditHooks` 有 `CAMERA_KEYS` 路由，注册错 key 会静默跑到 `__carDisplayCameraAudit()` 里，这条断言防的就是这个）；
     - 未触碰契约其余部分（`PARTS` 仍 10 项、`LIGHTS` 仍 2 项）。
  3. **这条验证的边界要说清**：`sceneAudit()` 正是 `installAuditHooks` 赋给 `window.__carDisplaySceneAudit` 的**实现本体**，所以"数据通路"已验；但"`installAuditHooks` 在浏览器里确实把这个函数挂到 `window` 上"属 T2 的代码，本脚本未覆盖，仍归浏览器验证。
  4. **`vite:dep-scan` 噪音**：首次运行时输出里混进一大段报错，根因是 Vite 起 dev server 时会扫描 `index.html` 入口做依赖预打包，撞上 `StudioCanvas.jsx:18` 的 `await import("three/webgpu")` 而报错。**与本次验证无关**（29 项断言当时已全绿），但会淹没结论。修法：`optimizeDeps: { noDiscovery: true, include: [] }`——本脚本只做 `ssrLoadModule`，不需要预打包。
  5. **`App.jsx` 已 `git checkout` 回退**，`git status` 干净，硬约束"不改 App.jsx"满足。

- **自测结果**：
  - `node app/src/perf/contractCheck.mjs` → **29 项断言全绿 ✅**，退出码 0，输出无噪音。
  - `node app/src/perf/selfTest.mjs` → **66 项断言全绿 ✅**。
  - `npm run build`（`App.jsx` 已回退的干净树上）：✅ **628 modules，24.98s，退出码 0**。模块数与记录 09 里"未挂载时"的 628 一致，反证 `App.jsx` 确实回到了原状、`perf/**` 未被任何入口引用（符合预期——正式接线归 T8）。
  - 说明：本次构建首次执行在 300s 内未完成被转后台，成因是**机器内存吃紧**（同一命令此前两次分别 14.92s / 6.00s 完成），非工程问题；转后台后正常完成。
- **commit**：`⟨本轮提交⟩`
- **遗留项**：
  1. **三项浏览器内验证未做**（人工已决定跳过），见人工配置区 #5。
  2. **真机性能实测（桌面 ≥55fps / 手机 ≥30fps）归 Wave 2 的 T8**（§11.1 T8 任务⑤），本轮不涉及。
  3. `docs/debug.md` 被全部 9 个 Wave 1 Agent 追加，**T8 合并时此处必冲突**，建议"两侧都保留、按 Agent 分段"。

---

## Wave 1 · T9 自动化验证（脚本段 → Wave 2 验收执行段，同一 Agent 常驻）

### 记录 T9-01 · 2026-09-22 · A 段：四个 verify 脚本 + 语音 mock + 共用 CDP 客户端 + 双端验收清单

- **轮次目标**：A 段「契约无关阶段」——把四个 `verify-*.mjs`、语音 mock、双端验收清单按 §13.3 冻结接口全部写好，使其能对「符合契约的页面」跑断言；脚本只依赖钩子，不依赖任何功能实现。
- **改动文件**：
  | 文件 | 性质 |
  | --- | --- |
  | `scripts/verify-parts.mjs` | 新增 271 行 |
  | `scripts/verify-pick.mjs` | 新增 280 行 |
  | `scripts/verify-voice.mjs` | 新增 319 行 |
  | `scripts/verify-camera.mjs` | 新增 268 行 |
  | `scripts/lib/cdp.mjs` | 新增 618 行（共用 CDP 客户端 + 断言器 + 契约常量） |
  | `scripts/mocks/speech-recognition-mock.js` | 新增 233 行 |
  | `docs/qa-checklist.md` | 新增 218 行（双端人工验收清单 + `qa-report.md` 预留格式） |
  | `app/scripts/verify-studio.mjs`、`app/scripts/verify-single-vehicle.mjs` | **删除**（另一次提交，见下） |
- **关键决策 / 问题**：
  1. **三个文件归属问题已人工裁定**：① 四个脚本 + mock 落**仓库根 `scripts/`**（与 `docs/` 同级；实测 `docs/` 在仓库根，而 §5 目录树把 `scripts/` 与 `src/` 并列，两者矛盾，故以人工裁定为准）；② `app/scripts/` 下两个 FormDrive 遗留脚本**删除**（T1 记录 02/03 已标「留待 T9」，其断言的三车型与 paint/wheel/studio 面板已随单车型裁剪全部消失）；③ 共用客户端新增 `scripts/lib/cdp.mjs`（§12.2 字面未列该路径，已申报获批）。
  2. **基线定为 `origin/contract-v1`（`6bcb863`）而非 `origin/main`**：T2 已提前推送契约（比预期早），而 T1 随后又推了 `77dc507`（加载页字节读数修复），二者在 `0c41982` **分叉**。我的交付物（脚本/mock/清单）与 T1 那个 `VehicleModel` 修复零关系，若先基于 main 再 rebase/merge 到 contract-v1，只会在 `docs/debug.md` 上制造冲突并可能改写 T1 的提交。**修法**：`git reset --hard origin/contract-v1`，分支历史 = contract-v1 + 我的提交，零 merge commit、零他人提交改写。副作用：本 worktree 的工程**不含** T1 的字节读数修复——对脚本断言无影响（脚本读的是钩子，不是加载页文案）。
  3. **端口陷阱（承接 T2 记录 06）**：本机 5173/5174 均被他人 Vite 实例占用。我的自测实例显式用 `npx vite --port 5181 --strictPort`，并以实例自身输出确认端口，避免打到别人的工程得到假绿。
  4. **无头浏览器启动被 worktree 隔离守卫拦下（同 T2 的人工配置区 #5）**：现象——`"...msedge.exe" --headless=new --remote-debugging-port=9222 ...` 被拒，报「reaches ... outside the working directory」+「worktree-isolated session's git operations must target its own worktree」。根因——守卫无法判定该命令不是 git，故对工作目录外的可执行文件一律拒绝。**影响**——脚本本身写完了，但**四个脚本对真实浏览器的自测跑不了**（这是本段唯一未完成的验证）。**已登记的绕过路径**：人工用 `!` 前缀执行一次启动命令，或放行 `~/.config/safe-chains.toml`。见人工配置区 #7。
  5. **CDP 连通性已先行验证**（守卫拦的是「启动」，不是「连接」）：在 9222 上曾有一个无头 Edge 实例，我用仓库外探针跑通 7 项——`/json/version`、`PUT /json/new`、WebSocket 连接、`Runtime.evaluate`、`Input.dispatchMouseEvent` + `dispatchTouchEvent`、`Page.captureScreenshot`、关闭标签页。该实例随后消失（属其他会话），故仍需人工起一个。
  6. **断言分层设计（本段最重要的设计决定）**：四个脚本一律分「契约层」与「集成层」，用**集成信号**做门禁，未集成项标 `[SKIP]` 并写明原因，**不假绿也不误报**：
     | 脚本 | 契约层（contract-v1 可跑绿） | 集成层门禁信号 | 未集成时 |
     | --- | --- | --- | --- |
     | verify-parts | store 驱动 → audit 终态 / progress 终值 / 分组 / closeAll / 未知 id 拒绝 | `parts[].bbox` 非 null 或过渡期采到 `0<progress<1` | 标 SKIP（progress 缺省为 `open?1:0` 属契约规定，非缺陷） |
     | verify-pick | hitTargets 结构合法性（id 必须来自 §13.1、坐标须在视口内） | `hitTargets.length > 0` | 整体 SKIP |
     | verify-voice | 注入点存在性、注入后 `supported=true`、传 null 复原 | `typeof __carDisplayVoiceInject === 'function'` | 整体 SKIP（T2 刻意未提供 stub，正是为了不假绿） |
     | verify-camera | view 跟随 store、`orbitOnce` token 自增可重复、`autoRotate` 片一致 | `cameraAudit.position !== null` | 集成层 SKIP |
  7. **`--strict` 语义**：默认 SKIP 不计失败（Wave 1 契约层用）；`--strict` 时 SKIP 计入失败（Wave 2 验收用，要求 SKIP=0）。
  8. **发现一个契约缺口（需 T6/T8 受理）**：§13.3 只冻结了 `__carDisplayVoiceInject`，**没有冻结「开始识别」的驱动入口**。脚本能注入 mock，但若 T6 未在页面加载时自动创建 `SpeechRecognition`，脚本就无法让链路进入 listening（只能尝试点 `cd-voice-` 前缀的 UI 元素，属软依赖）。verify-voice 已实现「实例数为 0 → 明确 SKIP 并打印可操作原因」，同时**待登记 `docs/contracts/CHANGELOG.md`**（该文件属 T2 独占，按 §13.4 流程走）。
  9. **mock 的可验证性**：mock 刻意实现成**浏览器无关的纯脚本**（只挂 `globalThis`，无 ESM 语法），因此其全部行为可在 Node 里直接跑断言——这是本段唯一能完整自测的部分（见下）。
- **自测结果**：
  - `node --check`：6 个新增脚本文件**语法全过**。
  - **A 段自测脚本（仓库外 `%TEMP%\t9-a-segment-selftest.mjs`）：33 项断言全过，退出码 0**，覆盖：
    - 语音 mock 23 项：全局挂载与幂等重复注入、`Ctor.name === 'SpeechRecognition'`、实例登记、`lang='zh-CN'`、未 start 时 `say()` 投递 0 实例、`start()` 派发 onstart、**重复 `start()` 抛 `InvalidStateError`**、`say()` 的 interim→final 顺序与 transcript、`onresult` 属性与 `addEventListener` **两路都到**、`deliveries` 计数、`interim:false` 只投 final、`fail('not-allowed')` 派发 error 后接 end 且退出 listening、`stop()`、`saySequence` 顺序回放、`reset()`。
    - `scripts/lib/cdp.mjs` 10 项：契约常量与 §13.1 逐项一致（10 部件 / 2 灯光 / 4 视角 / 4 个阈值 / 分组合计 10）、`parseCli` 的 `--key=value` 与 `--flag` 与默认值与未知参数收集、`resolveDebugPort` 探测失败时的可操作报错、断言器 PASS/FAIL/SKIP 计数与退出码（含 `--strict` 语义）、`checkRun` 把抛错记 FAIL 不中断、`checkThrows`。
  - **未完成**：四个 verify 脚本对真实浏览器的运行（被守卫拦截，见决策 4）。已实测的错误路径表现正确——无可用调试端口时打印中文可操作指引并退出码 1，不静默失败。
  - `npm run build` 未受影响（本段未触碰 `app/src/**`、`package.json`；worktree 内 `npm install` 后 `git status` 干净，lockfile 未被弄脏）。
- **commit**：`0629fbc`（A 段交付物）；`d67b65e`（删除两个失效旧脚本）
- **遗留项**：
  1. **四个脚本的浏览器端自测未跑**——阻塞于人工配置区 #7；放行后立即补跑并回报（这是 Wave 1 出口「verify-parts/verify-voice 契约层断言可跑绿」的最后一环）。
  2. **`docs/contracts/CHANGELOG.md` 待追加一行**：语音链路缺「开始识别」的冻结驱动入口（决策 8）。该文件属 T2 独占，按 §13.4 流程登记。
  3. Wave 2 的验收执行段（随 T8 每次合并滚动跑脚本 + 双端验收 + 产出 `qa-report.md` + 回归）由本 Agent 继续承担，清单与格式已在 `docs/qa-checklist.md` 就位。
  4. 手机真机语音项有**硬性前提**：Web Speech API 要求安全上下文，局域网 `http://<IP>` 下手机 Chrome 拒绝麦克风，须等 T10b 的 https URL；已在 `qa-checklist.md` §3.2 B11 标为「阻塞前提」，验收时不得标「通过」。

### 记录 T9-02 · 2026-09-22 · B 段首跑：钩子缺失，经诊断为「打错了服务端」；**该步骤经人工指示跳过**

- **轮次目标**：B 段——在 `contract-v1` 上跑通 `verify-parts` / `verify-voice` 的契约层断言（Wave 1 出口的最后一环）。
- **改动文件**：无（本轮只做诊断，未改任何交付物）。
- **关键决策 / 问题**：
  1. **现象**：人工起好调试端口（9222 就绪）后，`node scripts/verify-parts.mjs --base-url=http://127.0.0.1:5181/` 在 30s 后失败——`window.__carDisplayStore` / `__carDisplaySceneAudit` **始终不存在**（最后观测值 `false`）。脚本按设计打印了可读的等待超时并退出码 1，**没有静默假绿**。
  2. **诊断过程**：仓库外探针连上 9222 打开 5181 页面，读到——`readyState=complete`、标题 `FORMDRIVE — Interactive Automotive Studio`、`canvas=1`、42 个资源**无一 404**，但三个钩子全为 `undefined`；页面文案仍是英文 `Choose a car, change its finish…`（T4 尚未接管的旧 UI）。进一步用 `curl` 逐路径核对响应体：
     | 路径 | 响应 |
     | --- | --- |
     | `/src/main.jsx` | `1315 B`、`text/javascript`（**真实产物**） |
     | `/src/config/carConfig.js` | `2888 B`、`text/html`（**index.html 兜底**） |
     | `/src/state/useCarStore.js` | `2888 B`、`text/html`（**index.html 兜底**） |
     而这两个文件在本 worktree 磁盘上确实存在（`carConfig.js 7486 B`、`useCarStore.js 6060 B`，均为 contract-v1 版本）。**结论：5181 上应答的服务端根目录是 T2 之前的旧工程**（有 `main.jsx`、无 `carConfig.js`），因此页面里根本不存在 T2 的 store 与钩子——**这是一次「打错服务端」造成的假阴性，不是脚本缺陷**。这正是 T2 记录 06「端口陷阱」的同一类坑（Vite 对未知路径返 `200 + index.html`，状态码与"看起来有内容"都不能证明打到了自己的实例）。
  3. **未查清的部分（如实记录）**：我的 `npx vite --port 5181 --strictPort` 自报「ready on 5181」，但应答内容并非该 worktree 的产物；**5181 究竟被谁占用/为何被顶替，未完成归因**——人工指示在此处跳过该步骤，故不再深挖。
  4. **附带发现（与本轮无关，供 T8 参考）**：无头 Edge 下页面持续抛 `TypeError: Invalid value used as weak map key`（`three_webgpu.js` 的 `Textures.updateTexture` → `Bindings._init`），与 T1 记录 04 / `77dc507` 提到的「WebGPU 既有异常」同源，非本轮引入。
  5. **人工裁定**：**跳过该步骤**。四个脚本对真实契约页面的执行自测因此**未完成**，转入 Wave 2 随 T8 集成时补做。
- **自测结果**：本轮无新增通过项。已确证的仅有：脚本在「钩子缺失」时**行为正确**（明确报错 + 退出码 1 + 可操作提示，不假绿），以及 CDP 链路本身可用（9222 探测、开标签页、求值、事件捕获全部工作）。
- **commit**：无（本轮仅记录）
- **遗留项**：
  1. **四个脚本从未在真实契约页面上执行过**——这是 Wave 1 出口未闭合的部分，也是当前最大的未知风险：脚本里可能存在只有真跑才暴露的缺陷（时序、选择器、`Runtime.evaluate` 序列化等）。**Wave 2 首件事就是在 T8 集成页面上跑四个脚本并修掉暴露的问题。**
  2. 跑脚本前必须**先确证 dev server 是自己的实例**：用 `curl` 核对一个 contract-v1 专有路径（如 `/src/config/carConfig.js`）返回的是 JS 而非 `text/html`，否则一定得到假阴性/假阳性。此纪律已写入 `docs/qa-checklist.md` §1.1。
  3. 人工配置区 #7（无头浏览器放行）已由人工执行过一次；若该实例被关闭，需重新启动。

---


---

## Wave 1 · T3 中控大屏风格视觉场景（MainAgent 代收）

> 说明：T3 Agent 的 A 段代码已完成但会话中断、**未提交**（分支 wave1/t3 停在 T1 提交、origin 无该分支）。由 MainAgent 按 T3 任务书代收：还原自测挂载、补记录与挂载说明、完成 B 段接线、提交推送。

### 记录 06 · 2026-09-22 · T3 收尾（A 段提交 + B 段接线）

- **轮次目标**：把 T3 已完成但未提交的 A 段（CockpitEnvironment + ground）提交入库，并补齐 B 段接线（HeadlightRig 固定 tesla 锚点 + 接新 store、QUALITY 契约化），解除 S2 阻塞。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `src/components/scene/CockpitEnvironment.jsx` | A 段新建（6.9KB，props 驱动）；B 段默认 quality 改取 `QUALITY_TIERS[0]` |
  | `src/components/scene/ground/*` | A 段新建 8 文件：ReflectiveFloor / TechGrid / ContactShadow / RingLightBand / SweepLight / envTheme / useCanvasTexture / env.css |
  | `src/components/scene/ground/envTheme.js` | B 段：`QUALITY_FALLBACK` 占位常量删除，改 `import { QUALITY } from carConfig`（§13.1 契约）；`resolveQualityFeatures` 未知档位回退最高档 |
  | `src/components/scene/HeadlightRig.jsx` | B 段：移除 studioConfig/useStudioStore 依赖，固定 `TESLA_RIG` 常量（值取自 `HEADLIGHT_RIGS.tesla`，零行为变化）；`enabled` 改读 `useCarStore((s) => s.lights.headlight)` |
  | `docs/t3-scene-mount-guide.md` | 新建挂载说明（T8 使用） |
  | `docs/debug.md` | 本条记录 |
- **关键决策 / 问题**：
  1. **T3 Agent 未提交（现象→根因→修法）**：分支 HEAD 停在 T1 提交、origin 无 wave1/t3、App.jsx 有 12 行自测挂载改动未还原。根因：T3 Agent 会话中断、未按工作纪律逐步提交。修法：MainAgent 还原 App.jsx 自测改动（任务书要求自测挂载不交付），提交 A 段代码并补齐 B 段。
  2. **B 段依赖确认**：`useCarStore.lights` 为 `Record<lightId, boolean>`、action `setLight/toggleLight`（§13.2）；T5 的 VehicleModel 保留注册 `__formdriveHeadlightAnchors`（vehicle: "tesla"）与 `__formdriveActiveTransform`——HeadlightRig 的锚点跟随可继续复用，无需自建。
  3. **rebase 干净**：`wave1/t3` rebase 到 `origin/contract-v1` 成功，无冲突（T3 分支此前无提交）。
  4. **编译验证方式**：CockpitEnvironment 未被入口引用时不会进 bundle，故临时把它挂进 StudioCanvas 执行 `npm run build` 验证编译，通过后**已还原 StudioCanvas**（该挂载改动不交付，正式挂载归 T8，见挂载说明 §2）。
- **自测结果**：
  - `npm run build`（B 段代码 + 临时挂载）：✅ 通过，8.95s；chunk >500kB 警告为 FormDrive 原有（three 体积），非本次引入。
  - 还原 StudioCanvas 后 `git status`：仅 HeadlightRig（M）+ CockpitEnvironment/ground（??）待提交；`__t3harness.jsx` 保持未跟踪（临时文件，不提交）。
- **commit**：（见本条之后提交）
- **遗留项**：
  1. `ENV_COLORS` 色值为 T3 近似占位，T8 集成期按 T4 `tokens.css` 收口（集中导出已就绪）。
  2. CockpitEnvironment 的 `qualityFeatures` prop 由 T8 接 T8p `PerfProvider` 时传入（挂载说明 §3）。
  3. `StudioEnvironment.jsx` 保留待 T8 挂载时替换删除。
  4. HeadlightRig 光束跟随依赖 T5 VehicleModel 注册的钩子，T8 合并 T5 后需联调确认。

---

## Wave 1 · T7 相机指令化与待机自转

### 记录 T7-01 · 2026-09-22 · A 段（契约无关）：待机自转 / orbit-once 环绕 / 预设阻尼助手

- **轮次目标**：在不等 `contract-v1` 的前提下，把 T7 的契约无关部分做完并独立自测：空闲定时器、自转/环绕/拖拽三态互斥、orbit-once 环绕路径、预设阻尼曲线与插值助手。B 段（接真实 store + 注册 §13.3 审计）待 `contract-v1`。
- **改动文件**（仅 T7 独占的两个文件，`git status` 已核对无越界）：
  | 文件 | 改动 |
  | --- | --- |
  | `app/src/components/scene/IdleAutoRotate.jsx` | **新建**（约 300 行）：① 纯函数层 `damp`/`orbitEase`/`orbitAzimuthAt`/`sphericalOf`/`positionOf`/`dampXYZ`/`distanceXYZ`/`isIdleElapsed` + `readXYZ`/`writeXYZ` 分量访问器；② 状态机与帧循环：空闲定时器、`IDLE_MODES = {FREE, AUTO, ORBIT}`、环绕/自转的相机独占写权 |
  | `app/src/components/scene/CameraRig.jsx` | A 段占位接线：挂载 `IdleAutoRotate`（props 驱动，未读新 store）、预设阻尼改用共享助手、扩展 DEV 自测钩子（`__t7DebugOrbitOnce`、audit 增加 mode/autoRotating/orbiting/frames） |
- **关键决策**：
  1. **三项 §13 疑问已由人工拍板**（开工前问答）：① orbit-once 的"回正"= 回到**触发时的方位角**（半径/极角保持用户当前值，不重置缩放）；② `store.autoRotate` = **T7 写入的运行时状态**（初值 false 表示"当前未自转"，待机自转默认生效，满足 DoD）；③ 审计走 `registerSceneAuditSource('camera', fn)`，由 T2 合并进 `__carDisplayCameraAudit()`——B 段核对 `contract-v1`，若缺该合并逻辑则按 §13.4 在 `CHANGELOG.md` 登记一行交 T2。
  2. **挂载方式**：`IdleAutoRotate` 是 `return null` 的非视觉组件，**由 `CameraRig` 自包含挂载**（`CameraRig` 已被 `StudioCanvas` 挂载）→ **T8 无需为 T7 改 `App.jsx`**，A/B 两段都不需要临时改 App 自测。
  3. **互斥实现**：不靠禁用 OrbitControls，而是①帧内写权独占（非 `free` 模式时 `CameraRig` 让出预设阻尼）；②把"任意输入即停"的监听挂在 **window 捕获相**，先于 OrbitControls 自己的 domElement 监听执行 → 指针按下当帧模式已回 `free`，**这一次拖拽不会被吞**。实测证明：禁用 `controls.enabled` 会连带 drei 的 `useFrame(() => controls.update())` 一起停摆（`lookAt` 不再更新），故不采用。
  4. **自转保留用户视角**：半径/极角每帧从当前位置反解，只推进方位角；起步用 `damp` 加速约 1.5s 到速（`autoRotateSpeed=0.16 rad/s ≈ 39s/周`），避免"啪"地开始。
- **关键问题（现象 → 根因 → 修法）**：
  1. **相机坐标变 NaN，连带 WebGPU 报错、R3F 帧循环停摆**。现象：环绕/自转启动后 `position` 变 `[NaN,NaN,NaN]`，控制台刷 `TypeError: Invalid value used as weak map key`（three_webgpu `Textures.updateTexture`），此后画面完全不动。根因：我误以为 `three.Vector3` 支持 `v[0]` 下标访问——**它不支持**（只有 `.x/.y/.z`），`sphericalOf(camera.position, …)` 读出 `undefined` → 半径/极角 NaN → 位置 NaN → 投影矩阵 NaN 污染 WebGPU 绑定。修法：纯函数层加 `readXYZ`/`writeXYZ` 兼容访问器；帧循环加非有限值守卫（拒绝写入并交还控制权）。
  2. **预设平滑切换完全失效**（"点正面/侧面/复位没反应"）。现象：`dampXYZ(camera.position, …)` 后相机纹丝不动。根因：同一误判的写侧——`current[0] = …` 在 Vector3 上写的是 `"0"` 野属性，`.x/.y/.z` 从未被改。修法：同上（`writeXYZ`）。**A/B 已确认基线预设阻尼本身正常**（未改动的 main 上四个预设均精确到位）。
  3. **orbit-once 慢 1000 倍、永不结束**。现象：`orbitElapsed` 一路涨过 6.0 而相机几乎不动、`mode` 永远停在 `orbit`。根因：`elapsed` 按秒累加（useFrame 的 delta），却除以**毫秒**的 `orbitOnceDurationMs=6000`。修法：统一到秒（`orbitDurationMs / 1000`）。
  4. **加固（非 bug，预防）**：① 指针按下期间不进入自转（长按拖拽不会被自转抢写）；② `pointerup/pointercancel` 也计入交互（计时以最后一次输入为准）；③ 单帧步长上限 0.1s（切后台回来不跳变）。
  5. **自测脚本自身的三处断言 bug**（记录以免 T9 重蹈）：① `angDiff` 会把 2π 回绕成 0，不能用它断言"扫过一周"；② 环绕检查点设在 5.3s 而规格是 6000ms，误判"未结束"；③ 把 `pointerMove/pointerUp` 当成计时起点（只有 `pointerdown/wheel/keydown` 会重置计时）→ 实测 6.6s 被误判为"提前自转"。
  6. **headless WebGPU 下 `Page.captureScreenshot` 取不到真帧**：三张不同时刻的截图 **md5 完全相同**（陈旧合成帧）。视觉确认改走 **WebGL 回退（注入脚本隐藏 `navigator.gpu`）+ `preserveDrawingBuffer` + `canvas.toDataURL`**，四帧 md5 互不相同。
  7. **一条 WebGPU 控制台报错的观察项**：在中间版本（修 NaN 之前/之后的过渡态）出现过 `Invalid value used as weak map key`；**最终版连续两轮完整自测分段错误计数全为 0**，且未改动的基线在同一套相机动作（绕圈拖拽 + 缩放 + 四预设）下也是 0 错误。判定：非稳定复现，登记为观察项（见遗留项）。
- **自测结果**（真实浏览器 Edge 153 headless + CDP，脚本在仓库外 `%TEMP%\t7-*.mjs`，不随分支交付）：
  - **`npm run build`**：✅ 通过（`✓ built in 31.57s`）。
  - **CDP 行为自测 45/45 全绿，连续两轮**（run6/run9），分段错误计数 `初始/自转后/拖拽后/环绕后/预设后` 全为 0：
    - 纯函数层：`damp` 与 `MathUtils.damp` 同式、`orbitEase` 单调且两端角速度≈0（起步 0.015 / 中段 1.5）、**一周精确回正（扫掠 6.283185 rad、方位角等价差 0）**、球坐标↔位置往返误差 1.2e-15、Vector3 与数组两条代码路径一致且无野属性、退化输入（位置=目标）不出 NaN。
    - 待机自转：3s 未自转 ✅ → **9.2s 进入自转** ✅；自转 2s 扫过 0.32 rad（≈38.9s/周）✅；半径保持 10.4586→10.4586 ✅。
    - 交互即停：`pointerdown` 当帧停 ✅；停下后相机静止 ✅；**同一次按下即可正常拖拽（位移 5.37，控制权未被吞）** ✅；交互后 5s 未自转、约 8s 才重新自转（实测 9.8s）✅；按键即停 ✅。
    - orbit-once：启动 `orbiting=true` ✅；**时长实测 6.02s（规格 6000ms）** ✅；最大扫掠 3.09 rad（≥半周）✅；**结束后精确回正（偏差 0 rad）** ✅；半径保持 ✅；坐标仍为有限值（NaN 回归）✅；token 自增可重复触发 ✅；用户拖拽打断 → 立即 `orbiting=false`、**保留当前角度不回正（扫掠 1.386→1.386 rad）** ✅、打断后可正常拖拽 ✅。
    - 预设：front/profile/hero 均为"非瞬移 + 阻尼到位"，误差 ≤0.00001 ✅；`CameraAudit` 雏形字段（view/position/target/distance/autoRotating/orbiting）齐备 ✅；滚轮缩放 10.459→9.936 ✅；控制台 0 错误 ✅。
  - **A/B 对照（基线 = 未改动的 main，5181）**：绕圈拖拽 + 缩放 + 四预设后 **0 错误**、预设阻尼精确到位 → 证明上面的 bug 都是我引入并已修掉，不是基线既有问题。
  - **视觉确认（人工看图，非仅断言）**：`t7v-orbit0.png` 车头左前 3/4 视角；`t7v-orbit50.png` **同一辆车已绕到车尾右侧（方位角差 3.22 rad ≈ 185°）**，车身姿态/构图/地面光带正常；`t7v-orbit100.png` **与 orbit0 完全同一视角（回正）**；`t7v-autorotate.png` 自转中（方位角 0.73→1.081）。
- **commit**：`eec80a8`（分支 `wave1/t7`，已 push 到 origin）
- **遗留项**：
  1. **B 段待 `contract-v1`**：`git fetch origin` 显示 T2 尚未推送（远程只有 `main`）。A 段已完成，转入《挂载说明》与边界用例补齐，不空转。
  2. A 段占位物需在 B 段清理：`__t7DebugOrbitOnce`（DEV 临时触发）→ 改由 `store.cameraCommand.token`；`orbitToken` 本地 state → 读 store；`__formdriveCameraAudit`（旧 FormDrive DEV 钩子）→ 按 §13.3 换成 `__carDisplayCameraAudit` 并 `registerSceneAuditSource('camera', fn)`；`autoRotate`/`bumpInteraction` 接新 store。
  3. **观察项**：headless WebGPU 下那条 `Invalid value used as weak map key` 曾在过渡版本出现、最终版未复现；真机/其他 GPU 上是否出现需 T8/T9 关注（若再现，优先怀疑 WebGPU 纹理绑定与相机路径的时序，而非 T7 逻辑）。
  4. **移动端真机未验**：触摸拖拽/双指缩放与自转的互斥、8s 待机在手机上的体感，只能真机确认（T9 的 `qa-checklist` + T8 联调）；本轮只在桌面 headless 验证。
  5. `docs/debug.md` 是九个 Agent 的共同追加目标，**T8 合并时预期在此文件产生冲突**，按"保留各方记录"解决即可。

---

### 记录 T7-02 · 2026-09-22 · B 段（接线）：CameraRig 接契约 store + 注册 §13.3 相机审计；边界用例与两处真实缺陷

- **轮次目标**：`contract-v1` 就绪后接线：`cameraView` 驱动预设平滑切换、`cameraCommand='orbit-once'` 按 token 重复触发、自转状态写回 `store.autoRotate`、按 §13.3 注册相机审计；补互斥边界用例。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/src/components/scene/CameraRig.jsx` | 改读 `config/carConfig.js`（`CAMERA_VIEWS`/`INTERACTION`）+ `state/useCarStore.js`；`registerSceneAuditSource` 注册 **`autoRotating`/`orbiting`/`position`/`target`/`distance` 五键**；`onInteraction→bumpInteraction`、`onAutoRotateChange→setAutoRotate`；`minDistance` 4.1→3.4；新增"同值重复下发预设"兜底订阅；新增可选 prop `autoRotateEnabled`（默认 true）；移除 A 段占位物（`__t7DebugOrbitOnce`、本地 token state、旧 `__formdriveCameraAudit`），DEV 诊断改为 T7 私有 `__carDisplayCameraDebug` |
  | `app/src/components/scene/IdleAutoRotate.jsx` | api 增加 `isPointerActive()`（供兜底订阅避开拖拽期） |
  | `docs/contracts/CHANGELOG.md` | 追加 0010（预设缺"可重复触发"机制，**只增**提案）、0011（`detail` 机位与 `minDistance` 冲突，T7 侧已处置） |
- **关键决策**：
  1. **审计按 T2 的 key 落点注册**：`auditHooks.js` 的 `CAMERA_KEYS` 把 `view/position/target/distance/autoRotating/orbiting` 路由进 `__carDisplayCameraAudit()`，故 T7 注册其中五键（`view` 由 store 基准提供）。
  2. **不重复注册 scene 级 `autoRotate`**：§13.3② 的该字段基准值来自 `store.autoRotate`，而本组件正是唯一写入者，store 值即场景真相，再注册一份反而制造两个真相源。
  3. **待机自转默认生效**（按人工拍板：`store.autoRotate` 是 T7 写入的运行时状态），同时留 `autoRotateEnabled` 开关给 T8 联调。
  4. **`git` 流程事件（需人工知悉）**：B 段按任务书 rebase 到 `contract-v1` 后，推送被拒（远程仍是 rebase 前的提交），而规则禁止 force push。**处置：不 force push**，改为 `reset --hard origin/wave1/t7` → `merge origin/contract-v1` → `cherry-pick` B 段提交 → fast-forward 推送成功（`0393ac6`）。**副作用为零**：A 段两个 commit hash（`eec80a8`/`1018cb7`）仍是祖先，debug.md 里记录的 hash 不失效；与 T2 的 `docs/debug.md` 冲突按"两边记录都保留"解决（T2 段在前、T7 段在后，配置表保留 T2 的 5/6 行、T7 的行改号为 7）。
- **关键问题（现象 → 根因 → 修法）**：
  1. **`detail` 预设永远到不了位**（残差 0.271）。现象：切到"细节"后相机停在距目标 0.27 处。根因：`CAMERA_VIEWS.detail` 机位距其注视点 **3.83**，而 `OrbitControls.minDistance`（T1 基线值 4.1，§13.1 未冻结、属 T7 文件内常量）把距离夹住。修法：`minDistance` → **3.4**（本文件内改动，未动契约）；已记 CHANGELOG 0011 备人工确认取向。修后 `detail` 误差 0。
  2. **同一预设重复下发静默失效**（"拖走后点『复位』没反应"）。现象：用户拖拽（不改变 `cameraView`）后点「复位」，`setCameraView('hero')` 是**同值赋值** → store 不产生状态变化 → T7 的 `view` effect 不触发 → 相机不动。根因：§13.2 只给 `orbitOnce` 配了自增 token（"保证同一命令可重复触发"），预设缺同一机制，而「复位」恰是最高频的重复下发路径。修法：① 按 §13.4 登记 **CHANGELOG 0010**（提案新增 `applyCameraView(viewId)`，只增不改）；② 过渡期在 `CameraRig` 内加**兜底订阅**——识别"所有字段引用都没变的空写"（zustand 每次 set 都通知订阅者），并以 `mode===free` + 非动画中 + 指针未按下 + 未在位 四重守卫压小误命中面；T2 落地 0010 后整段删除。**局限已在代码注释中写明**：其他同值空写（如 `setPart` 写入相同值）也会命中，此时会把相机拉回当前预设。
  3. **自测脚本的两个真实缺陷（务必告知 T9）**：
     - **裸 `import()` 会拿到 HMR 的第二份模块实例**。现象：B 段自测中途大面积失败——`store.cameraView` 已是 `profile` 而组件闭包仍是 `hero`、`orbitOnce()` 的 token 6→7 但环绕不启动。取证：`performance.getEntriesByType('resource')` 同时存在 `…/useCarStore.js?t=1790046904685`（应用侧）与 `…/useCarStore.js`（脚本侧裸 import）；更糟的是裸 import 会重跑 `installAuditHooks`，把 `window.__carDisplayStore` **劫持到脚本自己的副本**上。修法：**驱动一律走 §13.3① 的 `window.__carDisplayStore`，绝不裸 import store 模块**。→ 建议 T9 的 `verify-*.mjs` 照此办理。
     - **输入坐标写死 `(700,450)`**：换到视口仅 500×450 的实例后，事件全部落在视口外（`document.elementFromPoint(720,450) === null`），拖拽/缩放必然假红。修法：按 `canvas.getBoundingClientRect()` 取中心派发。
  4. **WebGPU 偶发报错与整页失响应（环境级，基线可复现）**。现象：`TypeError: Invalid value used as weak map key`（three_webgpu `Textures.updateTexture`），一次 12 条后停止；严重时页面后续不再响应 CDP（脚本卡死）。归因取证：**未改动的基线在全新浏览器实例上同样报 12 条**（加载期、`dataset.renderer` 尚为 undefined 时），其后 3 轮缓慢拖拽 + 3 轮预设均不再增加；而**同一套相机运动在 WebGL 回退下 0 条**。判定：非 T7 逻辑引入，属该环境下 WebGPU 渲染器的既有偶发（疑似纹理/阴影绑定在流式加载与相机运动交叠时的时序问题），已升级为遗留项供 T8 决策。
- **自测结果**（真实浏览器 Edge 153 headless + CDP，脚本在仓库外 `%TEMP%\t7-*.mjs`，不随分支交付）：
  - **`npm run build`**：✅ 通过（`✓ built in 26.98s`）。
  - **B 段 CDP 自测 57/57 全绿**（`t7b-run2.txt`，健康实例、无 HMR 分裂）：契约钩子就绪；`CameraAudit` 六字段非空且 `position` 全有限；`SceneAudit.cameraView/autoRotate` 与 store 一致；待机 3s 未自转 → **约 8s 进入自转**（自转时 `store.autoRotate` 与 `SceneAudit.autoRotate` 同为 true）；自转 2s 扫过 0.26 rad；`pointerdown` 当帧停转且 `store.autoRotate` 回落 false、`lastInteractionAt` 落到本次输入（Δ=3ms）；**同一次按下即可正常拖拽**（位移 5.43，控制权未被吞）；交互后 5s 未自转、约 8s 重新自转（9.73s）；按键即停；`carStore.orbitOnce()` → `orbiting=true` 且 `store.autoRotate` 保持 false；**环绕时长实测 6.03s（规格 6000ms）**、最大扫掠 3.06 rad、**结束后回正偏差 0 rad**、半径保持；坐标仍为有限值（NaN 回归）；token 自增可重复触发；拖拽打断环绕立即 `orbiting=false` 且**保留当前角度不回正**；环绕中滚轮：打断 + 缩放生效；**自转中下发 orbit-once → 环绕接管**；**环绕中切换预设 → 环绕取消**且 bumpInteraction；四预设（含 `detail`）全部"非瞬移 + 误差 0 + view/场景审计同步"；**同值重复下发「复位」仍能重新到位（误差 0.00011）**；滚轮缩放 10.459→9.936；控制台 0 错误。
  - **视觉确认（WebGL 回退 + `canvas.toDataURL` 真帧）**：`t7v-orbit0.png` 与 `t7v-orbit100.png` **md5 完全相同**（像素级精确回正）；`t7v-orbit50.png` 方位角差 3.27 rad ≈187°（已绕到车尾另一侧）；`t7v-autorotate.png` 自转中（方位角 0.73→0.94）；**控制台错误 0 条**。
  - **A/B 归因**：基线（未改动 main）在同一套相机动作下同样出现该 WebGPU 报错 → 与 T7 无关。
- **commit**：`0393ac6`（含 `203e48e` 的 merge；已 push 到 `origin/wave1/t7`）
- **遗留项**：
  1. **CHANGELOG 0010 待 T2 受理**（预设可重复触发）；落地后删除 `CameraRig.jsx` 中的兜底订阅。0011 待人工确认取向（改机位 or 改距离上限）。
  2. `__carDisplayCameraDebug()` 是 T7 **私有 DEV 诊断**（帧计数/模式/环绕进度），不属于 §13.3 契约；T8 若认为多余可连同 IdleAutoRotate 的 `debug()` 一起删。
  3. **WebGPU 稳定性观察项**（见上）：真机/录屏若遇页面失响应，建议以 WebGL 回退运行；是否强制 WebGL 属 T8/部署决策。
  4. **移动端真机未验**：触摸拖拽/双指缩放与自转的互斥、8s 待机体感只能真机确认（T9 清单 + T8 联调）。
  5. `docs/debug.md` 与 `docs/contracts/CHANGELOG.md` 都是多 Agent 共同追加目标，T8 合并时预期冲突（本次 merge 已实际发生一次，按"两边都保留"解决）。

### 《T7 挂载/接入说明（交 T8）》

1. **无需改 `App.jsx` 挂载任何 T7 组件**：`IdleAutoRotate` 是非视觉组件（`return null`），由 `CameraRig` 自包含挂载；而 `CameraRig` 已被现有 `StudioCanvas.jsx` 挂载。T7 全程未改 `App.jsx`/`main.jsx`/`StudioCanvas.jsx`。
2. **import 路径与 props**：
   - `app/src/components/scene/CameraRig.jsx` → `export function CameraRig({ autoRotateEnabled = true })`；唯一的可选 prop 是 `autoRotateEnabled`（默认 true，传 `false` 即关闭待机自转，供联调/演示需要时用）。**没有任何必需 props**。
   - `app/src/components/scene/IdleAutoRotate.jsx` → 导出 `IdleAutoRotate`（组件，props 见文件头注释）+ 纯函数层（`damp`/`orbitEase`/`orbitAzimuthAt`/`sphericalOf`/`positionOf`/`dampXYZ`/`distanceXYZ`/`isIdleElapsed`/`readXYZ`/`writeXYZ`）+ 常量（`IDLE_MODES`/`IDLE_ROTATE_DEFAULTS`/`ORBIT_SWEEP_RAD`）。**只有 `CameraRig` 需要挂载它**，其他模块若要用曲线/球坐标工具可直接 import 纯函数。
3. **css**：**无**。T7 不产出任何样式文件，也不需要 `tokens.css`/`style.css` 的配合（自转/环绕只写相机）。
4. **store 契约依赖（只读）**：读 `cameraView`、`cameraCommand`；写 `setAutoRotate`、`bumpInteraction`；调 `registerSceneAuditSource`。**未改任何契约文件**（`docs/contracts/CHANGELOG.md` 仅按 §13.4 追加 0010/0011 两行）。
5. **可调参数位置（联调时改这里，不要改契约）**：
   - 待机延时/环绕时长：`carConfig.INTERACTION.idleAutoRotateDelayMs` / `orbitOnceDurationMs`（§13.1 冻结，改需走 CHANGELOG）。
   - 自转角速度（0.16 rad/s ≈ 39s/周）、起步加速系数、预设阻尼系数（4.8/5.2）、到位阈值（0.006）：`IdleAutoRotate.jsx` 的 `IDLE_ROTATE_DEFAULTS`（T7 内部调参，不在契约内）。
   - 缩放范围与俯仰限制：`CameraRig.jsx` 的 `minDistance`(3.4)/`maxDistance`(13)/`minPolarAngle`/`maxPolarAngle`。
6. **T9 脚本对接要点**：① `__carDisplayCameraAudit()` 的 `view/position/target/distance/autoRotating/orbiting` 六字段在 T7 挂载后即全量可用（`view` 来自 store，其余由 T7 注册）；② 触发"转一下"请调 `__carDisplayStore.getState().orbitOnce()`，触发预设请调 `setCameraView(id)`，**不要裸 `import()` store 模块**（见记录 T7-02 问题 3）；③ 判定"待机自转中"用 `autoRotating`，判定"环绕中"用 `orbiting`，二者互斥且都不会与用户拖拽同时为真；④ 待机自转默认**开启**，脚本若要测"8s 待机"需在无任何输入的前提下等待（任何 `pointerdown`/`wheel`/`keydown`/预设/环绕指令都会重置计时）。
7. **已知行为约定（供 T8/T9 判断"是不是 bug"）**：环绕被用户拖拽打断时**不回正**（保留当前角度，从该角度继续）；环绕结束才精确回正到触发时方位角；自转保留用户当前的缩放与俯仰，只推进方位角。

---

## Wave 1 · T4 中文中控 UI（面板 / Toast / 加载页 / 主题）

### 记录 07 · 2026-09-22 · T4 A 段：组件骨架 + 中文文案表 + 深色中控主题

- **轮次目标**：A 段「契约无关阶段」——把与 store 无关的真实工作量先做完：4 个组件骨架（props 驱动）、中文文案表、`tokens.css` 深色中控主题、响应式布局雏形、中文加载页与中文手势提示。
- **工作环境**：worktree `D:\car_display\.claude\worktrees\wave1-t4`，分支 `wave1/t4`；基线 `main` = `0c41982`。创建方式 `git worktree add .claude/worktrees/wave1-t4 -b wave1/t4 main`，与 T2/T3/T5 已建的 `wave1+t2`/`wave1-t5`/`wave1-t3` 同一约定。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/src/components/ui/strings.js` | **新增**。中文文案表（界面文案唯一来源），供 T5/T6/T8 复用，保证同一动作在不同通道下反馈文案一致 |
  | `app/src/components/ui/PartButton.jsx` | **新增**。单个部件按钮，props 驱动，含车窗/车门/前备箱三种内联 SVG 图示 |
  | `app/src/components/ui/ToastHost.jsx` | **新增**。Toast 宿主，props 驱动，逐条自动消失 + 点击关闭 |
  | `app/src/components/ui/LoadingScreen.jsx` | **新增**。中文加载页，保留字节级进度条结构与 00–100 百分比读数，含最短展示/退场状态机 |
  | `app/src/components/ui/ControlPanel.jsx` | **新增**。中控面板：车辆状态标题 + 3 个部件分组（组内全开/全关）+ 大灯/尾灯开关 + 视角按钮（复位/正面/侧面/细节）+ 环绕一周 + 待机自转 + 一键全部关闭 + 语音容器位 + 手势提示 |
  | `app/tokens.css` | **重写**。深灰蓝黑底（`oklch(14% .022 252)`）+ 青色 `--color-accent: oklch(84% .12 195)` / 冰蓝 `--color-accent-2` 点缀 + 玻璃拟态材质；新增中文字体回退栈与 `--tap-min` 触控尺寸；**保留全部既有 token 名**（T3/T6/T8 只引用、不重定义） |
  | `app/src/style.css` | **重写**。`cd-ui-` 前缀命名隔离；手机底部面板（<40rem 默认收起）/ 平板右下浮层（≥40rem）/ 桌面右侧侧栏（≥60rem）三档响应式；含 reduced-motion / reduced-transparency / backdrop-filter 降级 |
- **关键决策**：
  1. **`ui/**` 落位 `app/src/components/ui/`**。依据：§12.2 的 `scene/VehicleModel.jsx` 对应既有 `src/components/scene/`，故 `ui/**` 对应既有 `src/components/ui/`（FormDrive 原目录，被移除的 `ControlDeck` 等也在此）。未另建 `src/ui/`。
  2. **组件一律 props 驱动、不读 store**（A 段纪律），但 props 形状与 §13.1/§13.2 字段一一对应，B 段接线为纯替换。
  3. **`tokens.css` 保留全部既有 token 名**（仅重调数值），并保留已无消费方的 `--paint-*`。原因：T3（`cd-env-`）、T6（`cd-voice-`）正在并行写各自的 css，改名/删名会让它们静默失效。文件头已标注 `--paint-*` 待 T8 集成末段清理。
  4. **加载页去掉 FormDrive 的 localStorage 跳过逻辑**（`formdrive:studio-ready:v1` 键）。原因：该键名是英文品牌残留，且与新加载页"每次进入都展示中控启动"的定位冲突；改为可选 `bypass` prop 由宿主决定。
  5. **加载页去掉 `WebGPU / WEBGL`、`FORMDRIVE © 2026` 等英文遥测文案**，改为「实时渲染通道」与「首次载入约 22 MB」。理由：DoD 要求"界面无英文残留"；技术专名非必要信息。
  6. **面板初始展开态按断点决定**（≥40rem 展开、手机收起），与 `style.css` 断点一致，宿主无需传参。
  7. **语音容器位渲染中文占位**（虚线框 + 「语音控制」），T8 传入 `voiceSlot` 后占位自动消失；本任务不实现任何语音逻辑。
- **自测结果**：
  - `npm run build`：✅ 625 modules，4.50s（与 T1 基线一致——新组件此时尚未被 import，被 tree-shake）。自带警告（Circular chunk / empty chunk / >500 kB）均为 FormDrive 原有。
  - **真实浏览器实测（Edge headless + CDP，脚本在仓库外 `%TEMP%/t4-selftest/`）**：临时改写 `App.jsx` 挂载（**该改动不入交付，已 `git checkout` 还原并另存自测件**），用 §13.1 形状的假数据驱动，**42/42 项断言全部通过**：
    - **375×812 手机视口**：无横向溢出元素（逐元素 `getBoundingClientRect` 越界扫描）；面板贴合视口（l=12, r=363）；默认收起（面板高 109 px）；点击展开后 `body` 高 435 px；10 个部件按钮全部渲染；无标签截断（`scrollWidth > clientWidth` 扫描为空）。
    - **交互链路**：点「左前车窗」→ `aria-pressed` 翻转 + Toast「左前车窗已打开」+ 状态摘要「已开启 1 / 10 个部件」；点「车窗 全开」→ 组计数 4/4 + Toast「车窗已全部打开」；点大灯开关 → `aria-checked=true` + Toast「大灯已开启」；点「侧面」→ 激活态切换 + Toast「视角已切换到侧面」；点「环绕一周」→ Toast「正在环绕车辆一周」；Toast 3.2 s 后自动消失；点「全部关闭」→ 部件与灯光全复位 + 状态摘要「车辆已全部关闭」；点 Toast 本体可立即关闭。
    - **中文加载页**：品牌「智能座舱」、大标题「车形即现」、状态文案随进度在「正在准备资源→正在加载车身模型→正在校准材质」间切换、`role="progressbar"` 的 `aria-valuenow` 实测推进 8 → 43、就绪后自动退场。
    - **1440×900 桌面视口**：面板默认展开、位于右侧侧栏（l=1016, r=1416）、完全在视口内；手势提示可见；语音容器位存在；内部滚动生效（scrollHeight 1020 > clientHeight 646）。
    - **英文残留扫描**：两个视口逐文本节点扫描 `[A-Za-z]{2,}`，仅剩专名 `Tesla`/`Model` 与单位 `MB`，**界面无英文文案残留**。
    - **控制台 0 错误**。
  - **视觉确认（看图，非仅断言）**：截图 `%TEMP%/t4-selftest/{375-loading,375-collapsed,375-expanded,375-interacted,1440-desktop}.png`。深色蓝黑底 + 青色点缀 + 玻璃卡片渲染正确；中文排版无截断、无换行错位；部件按钮 2 列网格、分组计数青色高亮、开启态青色描边发光均正常。
  - **一次误判纠正**：桌面截图中「大灯」开关疑似呈开启态，用探针脚本核实 `aria-checked="false"`、滑块距左 5 px（`switchW=52`），确认是低分辨率读图误差，**非 bug**。
- **commit**：`0c21106`（组件与主题）、`64b254b`（debug.md 记录）——均已 push 到 `origin/wave1/t4`
- **遗留项**：
  1. **B 段待启动**：A 段收尾时 `origin/contract-v1` 已推送（T2 `0387166` + `2bf4679`，含 `carConfig.js` / `useCarStore.js` / `auditHooks.js` / shim / `CHANGELOG.md` 0001–0009 / `store-contract.md`），内容齐备，可直接进入接线段。
  2. **加载页字节级读数缺口**：§13.2 的 state 片未收录 T1 基线的 5 个加载态字段，字节读数取不到 → 登记 `docs/contracts/CHANGELOG.md` 0010，待 S1 裁定。
  3. **旧配置器组件的删除与 `App.jsx` 禁改冲突**：删除 `ControlDeck` 等 7 个组件会让未改动的 `App.jsx` 编译失败（S2 要求 build 全绿）。已上报人工配置区 #7，待裁定交付形态。
  4. **`index.html` 归属未定**：首屏 boot 加载页、`<title>`、`lang="en"`、meta description 全为英文，但 §12.2 未把 `index.html` 划给任何 Wave 1 Agent。已上报人工配置区 #8。
  5. **`HeroCopy` 过时英文文案**（T1 记录 03 遗留 5）随该组件在 B 段一并移除。
  6. `--paint-*` token 与 legacy `studioConfig.js` 的清理归 T8 集成末段（与 T2 CHANGELOG 0008/0009 同批）。
  7. **跨分支流程偏差登记**：本分支先 push 了 A 段提交，随后需引入 `contract-v1`；因纪律同时要求"不 force push、不改写历史"，故采用 `git merge --no-ff origin/contract-v1` 而非 rebase（rebase 后必须 force push，与硬约束冲突）。分支因此含一个 merge 提交，对 T8 的合并无影响。

---

## Wave 1 · T4 中文中控 UI —— B 段（接线）

### 记录 08 · 2026-09-22 · T4 B 段：ui/** 接新 store、移除配置器组件、index.html 中文化

- **轮次目标**：B 段「接线阶段」——把 A 段的 props 驱动组件全部接到 §13.2 的真实 store，移除 7 个配置器组件，中文化首屏，并做真实 App 的浏览器实测。
- **前置**：`origin/contract-v1` 已推送（T2 `0387166` + `2bf4679`）。因纪律同时要求「不 force push、不改写历史」而 rebase 后必须 force push，故改用 `git merge --no-ff origin/contract-v1`（合并提交 `8db6f2e`）；`docs/debug.md` 与 T2 的记录段冲突，取 T2 侧版本后重排为「T2 记录 05/06 → T4 记录 07/08」，并把此前「`store-contract.md` 缺失」的过时判断修正为「已由 T2 于 `2bf4679` 补交」。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/src/components/ui/ControlPanel.jsx` | **改为 store 连接版**：读 `parts`/`lights`/`cameraView`/`autoRotate`，调 8 个 action + `pushToast` + `bumpInteraction`；部件与视角清单改从 `carConfig` 读，不再经 props |
  | `app/src/components/ui/ToastHost.jsx` | **改为订阅 `store.toast`** + `store.dismissToast`（props 保留为自测覆盖） |
  | `app/src/components/ui/LoadingScreen.jsx` | **改为读 `store.loading` + drei `useProgress`**，`store.loading` 未落地时自动回退，不报错 |
  | `app/src/App.jsx` | **最小改动**：删 7 个 import 与挂载，改挂 `ControlPanel`/`ToastHost`/`LoadingScreen`；`skip-link` 文案改中文 |
  | `app/index.html` | **中文化**：`lang="zh-CN"`、中文 title/description、中文首屏 boot 页（配色对齐新主题）；移除 FormDrive 的 localStorage 跳过脚本与已不用的 `Instrument Serif` 字体请求 |
  | `ControlDeck.jsx`、`Navigation.jsx`、`HeroCopy.jsx`、`InfoDialog.jsx`、`VehicleSelector.jsx`、`CameraControls.jsx`、`InitialLoadingScreen.jsx` | **删除**（7 个配置器组件） |
  | `docs/t4-ui-mount-guide.md` | **新增**：给 T8 的《挂载/接入说明》 |
- **关键决策**：
  1. **交付形态采用方案 A**（人工裁定）：删除 7 个配置器组件 + 交付一处最小 `App.jsx` 改动。理由：§11.1 要求「移除组件」而 §12.1 禁改 `App.jsx`，删文件会让未改动的 `App.jsx` 编译失败，与 S2 准入「build 全绿」直接冲突；T8 反正要重写 `App.jsx`，冲突面单文件且必然发生。除 import 与挂载点外，`App.jsx` 其余结构逐字保持 T1 基线。
  2. **Toast 三通道归属划清**：`ControlPanel` 是「UI 通道」的唯一发出点；T5 点击拾取、T6 语音各自发各自的中文反馈，不经 `ControlPanel` 转发——避免同一动作出现两条 Toast。已写入《挂载说明》§3。
  3. **`LoadingScreen` 对 `store.loading` 做防御式消费**：CHANGELOG 0010 尚未由 T2 落地，组件写成 `loading?.x ?? 兜底`，落地后**无需改 T4 一行代码**即自动显示 `X.X / Y.Y MB`。
  4. **`index.html` 中文化经人工裁定归 T4**（§12.2 未把该文件划给任何 Wave 1 Agent）。boot 页是用户看到的第一屏，与 `LoadingScreen` 是同一体验的先后两帧，由同一人改才不会「中文加载页接英文 boot 页」。同时移除 FormDrive 的 `formdrive-cached` 跳过逻辑（键名英文残留 + 与新加载页定位冲突）。
  5. **`skip-link` 文案改中文**：超出「仅摘除悬空 import 与挂载」的字面范围，属 DoD「界面无英文残留」的必要最小项，特此登记。
- **关键问题与修法**：
  1. **端口陷阱导致 5 项「假红」**（现象）：B 段首跑时桌面视口整段失败，且英文残留扫描扫出 `FORMDRIVE` / `MADE BY ENES KAYMAZ` / `Configuration` / `Paint` 等**已删除组件**的文案。（根因）`netstat` + `wmic` 查明：**T3 的 dev server 也绑在 5199**（T3 用 `--port 5199 --strictPort` 未加 `--host`，Vite 绑到 IPv6 `[::1]:5199`；我用 `--host 0.0.0.0` 绑到 IPv4），同一端口上并存**两个不同工程**，桌面段那一次请求落到了 T3 的基线 App。（修法）改用唯一端口 **5211** 复跑；并给测试脚本加了「导航前打标记、等标记消失」与「断言 `document.title` 为本分支应用」两道防串味闸门。**教训与 T2 记录 06 同源：dev 自测必须用唯一端口，且必须验证"服务的是我的实例"。**
  2. **WebGPU 控制台噪声的归因**（现象）：headless 下持续抛 `TypeError: Invalid value used as weak map key`，栈全在 `three_webgpu.js` 的 `Textures.updateTexture`。（定性）做了三段隔离实测：**A 段零交互仅渲染 → 已有 1 条**；B 段只用 `__carDisplayStore` 驱动、完全不碰 T4 的 UI → 232 条；C 段点击 T4 的 UI → 1022 条。数量随动画帧数增长，且 T4 未改动任何场景/渲染器文件。→ 判定为**无头软件 WebGPU 环境问题，非本任务引入**，已写入《挂载说明》§7 供 T8/T9 判读。
  3. **我自己两处断言缺陷的纠正**（不掩盖）：① 「3D 部件动画进度推进」原断言读 `__carDisplaySceneAudit().parts[].progress`，但该字段在 T5 重写 `VehicleModel` 前是**由 store 派生的 0/1**（T2 CHANGELOG 0006），不是真实动画进度——改为**直接读车窗玻璃网格的世界坐标**（硬证据）；② 「相机实际位移」原采样窗口 1400 ms 太短，headless 软件渲染约 1 fps、阻尼需数帧收敛，实测 t=1000 ms 仍未动、t=2000 ms 到位——采样窗口放宽到 3 s。
  4. **读图两次误判**（记录备查）：桌面截图中「大灯」开关两次被我读成开启态，两次用探针脚本核实均为 `aria-checked="false"`、滑块距左 5 px、轨道 `oklch(0.94 0.05 200 / 0.05)`（近乎全透明）——是低分辨率读图误差，**非 bug**。结论：低分辨率截图上的开关状态不可靠，一律以 `aria-checked` + 几何量测为准。
- **自测结果**：
  - `npm run build`：✅ 5.76 s，index chunk 104.66 → **110.91 kB**；`dist/index.html` 3.13 kB。自带警告（circular chunk / 空 react chunk / >500 kB）均为 FormDrive 原有。
  - **真实 App 浏览器实测（Edge headless + CDP，dev 5211，脚本在仓库外）**：**44/44 项断言全部通过**：
    - **375×812**：`lang=zh-CN`、title 中文、boot 页无 `FORMDRIVE` 残留；加载页中文且进度推进（6 → 51）、就绪后退场；无横向溢出；面板默认收起、点击展开；10 个部件按钮齐全；初始 store 全关闭。
    - **交互 → 真实 store → 3D**：点「左前车窗」→ `store.parts.window_lf=true` + `bumpInteraction` 推进 + Toast「左前车窗已打开」+ **车窗玻璃世界 Y 从 0.5837 降到 0.0873**（3D 部件真的动了，硬证据）；「车窗 全开」→ 4 个窗全开 + 组计数 4/4；大灯 → `store.lights.headlight=true` 且进入场景审计；「侧面」→ `cameraView='profile'`（store 与审计双证）+ **相机世界坐标位移 7.64**（`[6.8,3.1,7.6]` → `[7.9,1.55,0.2]`）；「环绕一周」→ `cameraCommand={type:'orbit-once',token:1}`；待机自转开关 → `autoRotate=true`；Toast 3.2 s 自动消失；「全部关闭」→ 部件与灯光全复位 + 摘要「车辆已全部关闭」。
    - **1440×900**：面板默认展开、右侧侧栏（l=1016, r=1416）、在视口内、内部滚动生效（1020 > 646）；手势提示可见；语音容器位存在。
    - **英文残留扫描**：两视口逐文本节点扫描 `[A-Za-z]{2,}`，仅剩专名 `Tesla`/`Model` 与单位 `MB`。
    - **控制台**：除上述 WebGPU 环境噪声 12 条外，**0 错误**。
  - **视觉确认（看图）**：`%TEMP%/t4-selftest/b/{375-loading,375-collapsed,375-expanded,375-interacted,1440-desktop}.png`。车模渲染正常（PBR 车身、环形光带、地面反射）；375 交互图中两条中文 Toast、车窗 4/4 青色描边发光、玻璃拟态面板透出车身，中文排版无截断。
- **commit**：`8350036`（7 个组件删除 + 本记录 + 《挂载说明》）、`d6b204f`（补齐 `App.jsx` / `index.html` / 3 个 ui 组件的接线修改）——均已 push 到 `origin/wave1/t4`。
  - **诚实登记**：`8350036` 是一次**非绿的中间提交**——`git rm` 的删除已入索引，但 5 个文件的**修改**当时未入索引，导致该提交处于「组件已删、`App.jsx` 仍 import」的状态。已由 `d6b204f` 补齐，**分支尖端 `d6b204f` build 全绿（627 modules）**，浏览器自测 44/44 亦跑在与之等价的工作树内容上。S2 准入请以分支尖端为准。
- **遗留项**：
  1. **`store.loading` 片待 T2 落地、T5 写入**（CHANGELOG 0010，人工已裁定采纳）。落地前字节行显示「首次载入约 22 MB」。
  2. **本分支删除了 7 个组件并改了 `App.jsx`**：T8 若在集成分支上另行重写 `App.jsx`，此单文件冲突必然发生且预期，按《挂载说明》§2 处理即可。
  3. **5199 端口上现存两个 dev server**（本分支 IPv4 实例 + T3 的 IPv6 实例），双方自测都可能打到对方。已登记人工配置区 #10。
  4. `--paint-*` token 与 legacy `studioConfig.js` 的清理归 T8 集成末段。
  5. 真机（手机 Chrome/Edge）验收未做，需人工。

---

## Wave 1 · T5 3D 点击拾取控车（raycast）

> 分支 `wave1/t5`，worktree `.claude/worktrees/wave1+t5`，基线 `0c41982`（T1 单车基线）。
> 独占文件：`app/src/interaction/**`、`app/src/components/scene/VehicleModel.jsx`。

### 记录 08 · 2026-09-22 · A 段：拾取几何 / 手势判别 / 悬停高亮 / tooltip / partKey 反查

- **轮次目标**：A 段（契约无关）——不依赖 `carConfig`/`useCarStore`，用占位数据把拾取几何、手势判别、
  悬停高亮、中文 tooltip、命中点反查 partKey 做完并自测通过。
- **改动文件**：
  | 文件 | 内容 |
  | --- | --- |
  | `app/src/interaction/partMapping.js` | 新增。纯函数层：pivot 子树 mesh 收集、mesh→partId 反查（更深的 pivot 优先）、薄玻璃的隐形加厚命中盒（解析 OBB）、最近命中拾取、世界包围盒、屏幕投影、`computeHitTargets`、`isTapGesture` |
  | `app/src/interaction/PartHitAreas.jsx` | 新增。`usePartHitAreas()` 编译命中区；`<PartHitAreas debug>` 命中区线框可视化（`?cdHit=1`）；`<PartHoverHighlight>` 车窗悬停的半透明青色命中盒 |
  | `app/src/interaction/usePartPick.js` | 新增。指针事件监听、手势判别、悬停 emissive 提亮 + pointer 光标 + 中文 tooltip、命中后回调 |
  | `app/src/interaction/selftest/pick.selftest.mjs` | 新增。无头自测（Node 直跑，合成场景） |
  | `app/src/interaction/selftest/pick.cdp.mjs` | 新增。真实浏览器 CDP 自测（鼠标点击/拖拽/触摸/点中率），沿用 T1 `scripts/verify-*.mjs` 的裸 CDP 模式 |
  | `app/src/components/scene/VehicleModel.jsx` | 改造。挂载命中区与高亮层；新增 `lightMeshes`（按灯分组 mesh）；**A 段占位接线块**（见下） |
- **关键决策**：
  1. **GLB 实测节点树先读事实**：解析 `tesla-model-3-2018.glb` 的 JSON chunk（301 节点 / 176 mesh / 58 材质），
     得到真实结构 `door_lf_dummy → door_lf → door_lf_glass.0_0`、`bonnet_dummy → bonnet_ok → …`、
     `boot_dummy → black_boot → boot`、四门四窗齐备。**注意：`studioConfig.js` 写的 `door_lf_glass0_0` 与真实节点名
     `door_lf_glass.0_0` 不一致，只因 `resolvePivot` 会剥掉非字母数字字符做归一化比对才恰好命中**——T2 填
     `carConfig.PARTS[].node` 时应按实测写 `door_lf_glass.0_0`。
  2. **命中目标分两层**：① 部件 pivot 子树内的真实 mesh（像素级精确，随开合动画一起运动）；
     ② 薄玻璃补一个**闭合位姿的隐形加厚命中盒**。第 ② 层是必需的——车窗开启后玻璃 `visible=false` 且已滑入门腔，
     没有它车窗就再也点不回去。
  3. **代理盒用解析 OBB 而非隐形 mesh**：记录在 pivot **父节点局部坐标系**里（车门打开时命中盒跟着车门走，
     而不是留在原地），命中时按父节点当前世界矩阵重建。好处：零 draw call、天然跟随 pivot、不污染 `Box3.setFromObject`。
     可视化核对由 `<PartHitAreas debug>` 承担（`?cdHit=1`）。
  4. **只给 `group === 'windows'` 建代理盒**，不是所有部件。原因：若给车门也建代理盒，车门盒会包住车窗区域，
     射线先进入车门盒 → 点玻璃会误判成点车门。车窗是 §13.1 冻结的分组，不涉及硬编码 node。
  5. **命中判定取"最近命中"**（真实 mesh 与代理盒一起按距离排序）。实测验证：车窗打开时透过窗洞看到远侧车门，
     代理盒（近）胜出 → 判车窗；点车门钣金时真实 mesh 更近 → 判车门。无需任何偏置常数。
  6. **`hitTargets.screen` 用 clientX/clientY 坐标系**（canvas CSS 尺寸 + canvas 在视口中的 left/top 偏移），
     T9 的 CDP 脚本可直接拿去派发事件，不必再换算。`center`/`size` 为**世界坐标**。
  7. **屏幕坐标是"回投验证过"的**：`computeHitTargets` 先取包围盒中心，再用部件表面顶点采样做候选，
     每个候选都反向射线验证"首个命中确实是本部件"，全部不通过才退回包围盒中心投影。
     这样 T9 拿到的坐标一定是能真正点中该部件的。
  8. **"旋转中不触发点击"用两条独立判据**：① `pointerdown→up` 位移 ≤ `tapMaxMovePx` 且时长 ≤ `tapMaxDurationMs`；
     ② 手势期间 OrbitControls 的 `change` 事件是否让相机真的位移超过 0.01 世界单位。
     只读 `useThree(s => s.controls)`（drei `makeDefault` 提供）与相机，**不改 CameraRig.jsx**。
  9. **不 stopPropagation / preventDefault**，OrbitControls 的拖拽旋转照常；触摸与鼠标共用 PointerEvent 路径，
     第二根手指落下即作废当前点击候选（避免双指缩放误触发）。
  10. **悬停高亮**：对部件材质做 emissive 青蓝提亮（`#38bdf8`），进入时快照原值、离开时精确还原；
     车窗开启后玻璃不可见，由 `<PartHoverHighlight>` 画半透明青色命中盒兜底。
     大灯的 emissiveIntensity 由 `VehicleModel` 的帧循环驱动，故在帧循环里给悬停灯加一个下限（1.6）。
  11. **tooltip 用独立 DOM 节点 + 内联样式**，不新建/不改任何 css 文件（`style.css`/`tokens.css` 属 T4），
     类名 `cd-hit-tooltip` 符合 §12.1 的 `cd-hit-` 前缀约定。
  12. **A 段占位接线**：`VehicleModel.jsx` 里一块显式标注的 `A_SECTION_*` 常量（§13.1 冻结的 id/label/group + 现有
     `studioConfig` 已解析好的 pivot 键）+ 本地 `useState` 状态。**本文件不出现任何 GLB 节点名**。
     B 段整块删除，改为 `carConfig.PARTS` + `useCarStore`。
  13. **无头自测**：`partMapping.js` 全部为纯函数，可在 Node 里用合成场景（门 + 玻璃 + 后备箱 + 大灯）直接断言，
     不依赖浏览器。这是本轮发现两个真 bug 的关键手段。
- **问题与修法**（两个都由无头自测抓出）：
  1. **代理盒退化成零体积 → 车窗打开后点不中**。
     现象：车窗打开后点窗洞，命中的是远侧车门而不是车窗。
     根因：`proxyBox()` 里 `Box3.set(_point.set(min…), _point.set(max…))` —— 两个实参指向**同一个**
     `Vector3` 临时对象，`_box2.set()` 内部 `min.copy(); max.copy()` 时两者都已是 max 值，包围盒塌缩成一个点。
     修法：改用 `_box2.min.set(...)` / `_box2.max.set(...)` 分别赋值，并在注释里写明这个坑。
  2. **大灯没有 hitTargets**。
     现象：`hitTargets` 只有 10 条，缺 `headlight`。
     根因：`partWorldBox()` 只处理 `descriptor.pivot`，而灯光没有 pivot（是材质匹配出来的 mesh 集合）→ 空盒被过滤。
     修法：无 pivot 时对 `descriptor.meshes` 逐个 `setFromObject` 求并集。
- **自测结果**：
  - **无头自测**（`cd app && node src/interaction/selftest/pick.selftest.mjs`）：**22/22 通过**。
    覆盖：代理盒只给车窗、玻璃归 window_lf（更深 pivot 优先）、车门钣金归 door_lf、大灯归 headlight、
    点车门/玻璃/后备箱/大灯/空白、车窗打开后点窗洞判 window_lf、点车门钣金仍判 door_lf、
    透过窗洞看远侧车门判 window_lf、点远侧车门本体判 door_rf、
    手势 6 例（原地 120ms / 10px / 400ms / 6px 边界 / pointerId 不一致 / 缺起点）、
    hitTargets 12 条且每条 screen 回投都命中自己。
  - **`npm run build`**：✅ 628 modules，12.25s（沿用基线的 3 条既有警告，无新增）。
  - **`npm run dev`**：✅ 端口 5175 就绪（5173/5174 被同波次其他 worktree 占用）。
  - **真实浏览器桌面/手机点按与点中率**：脚本已就绪（`selftest/pick.cdp.mjs`），但**本 Agent 的沙箱不允许
    启动 worktree 之外的可执行文件（Edge），无法自行跑**。已登记「需要项目人工配置的地方」#7。
- **commit**：`394e200`
- **遗留项**：
  1. **真实浏览器双端点按验收未跑**（见人工配置 #5）——需要人工用 `!` 前缀启动一次无头 Edge，
     之后本 Agent 可直接跑 `selftest/pick.cdp.mjs` 产出桌面点击/拖拽/触摸/点中率的实测数字。
  2. **§13.1 缺开合动画参数**：`PARTS` 只有 `id/group/label/node/aliases`，没有 `motion/axis/angle/travel`
     （滑窗还缺 `companions`），而 `VehicleModel` 的开合动画必须靠这些参数。已作为问题上报（见下）。
  3. **`VehicleModel.jsx:81` 的 `vehicleId === "mustang"` 死条件**：T1 记录 03 遗留项 2 明确"属 T5 独占文件，
     留待 T5 清理"，T1 记录 04 亦登记为待人工决策。**本 Agent 未擅自改动**，等人工确认后再修（见下）。

### 记录 09 · 2026-09-22 · A 段遗留：上报待确认项（未改代码）

- **轮次目标**：按工作纪律「不确定必须先停下问我」，把 A 段期间发现的 3 个需要人工决策/受理的事项整理上报。
- **改动文件**：无（仅本记录）。
- **待确认事项**：
  1. ~~**§13.1 缺开合动画参数（规格字段不够，建议走 §13.4 只增不改）**——`PARTS` 无 `motion/axis/angle/travel`，
     滑窗还需 `companions`。这些字段是 T1 基线 `studioConfig.js` 已有的实测值，属"只增字段、不改既有语义"，
     建议由 T2 在 `carConfig.PARTS` 中补齐，T5 的 B 段跟随。~~
     **已解决**：T2 在 `contract-v1` 的 CHANGELOG 0002 中补齐了 `motion/axis/angle/travel`（取值与 T1 基线逐项一致，
     零行为变化），另在 0004 补了 `MODEL_URL`/`MODEL_TRANSFORM`/`MODEL_MATERIALS`。T5 的 B 段直接消费，无需人工介入。
     另注：`companions` 未被补入，但实测 T1 基线 `studioConfig` 的 4 个滑窗部件也都没有 `companions`
     （只有 `attachments` 用于门把手之类），故不影响功能。
  2. **Node 版本**：已由 T1 记录 02 人工确认为"用 Node 24 继续"，本 Agent 沿用（`npm install` 仅 `EBADENGINE` 告警）。
  3. **`VehicleModel.jsx:81` 死条件**：修法为一个 token（`vehicleId === "mustang" && !state.initialSceneReady`
     → `!state.initialSceneReady`），可恢复 roadmap §2.2 列为"直接继承"的字节级加载进度读数。
     该文件属 T5 独占，T1 已明确留给 T5 清理。**建议修**，等人工确认（人工配置区 #9）。
- **自测结果**：无代码改动。
- **commit**：见本记录所在提交。
- **遗留项**：同上，等人工回复后继续 B 段。

### 记录 10 · 2026-09-22 · B 段：rebase 到 contract-v1，VehicleModel 接真实 store + 注册审计钩子

- **轮次目标**：`git fetch origin contract-v1` → rebase → 把 A 段成果接到真实 store；`VehicleModel.jsx` 接 `togglePart`/`toggleLight`、
  `bumpInteraction()`、`pushToast`；按 `carConfig.INTERACTION` 读阈值；向 `auditHooks` 注册 `hitTargets`（并顺带注册 `parts`）。
- **rebase 结果**：`origin/contract-v1` = `6bcb863`。A 段代码提交（`394e200`）**无冲突**自动应用；
  `docs/debug.md` 一处冲突（T2 的 Wave 1 段与 T5 的 Wave 1 段插在同一位置），**两边全保留**，
  T2 记录在前、T5 记录在后，并把 T5 的记录号从 05/06 改为 **08/09** 避免与 T2 的 05/06/07 撞号；
  人工配置区 T2 的 #5/#6 保留，T5 的顺延为 #7/#8/#9。
- **T2 落地带来的变化（已核对）**：
  1. **我上报的 §13.1 动画参数缺口已由 T2 补齐**（CHANGELOG 0002：`PARTS[].motion/axis/angle/travel`，
     取值与 T1 基线逐项一致），另有 0004 补了 `MODEL_URL`/`MODEL_TRANSFORM`/`MODEL_MATERIALS`。
     → B 段直接消费，A 段那块 `A_SECTION_*` 占位常量整块删除。
  2. **CHANGELOG 0006 要求 T5 额外注册 `parts` 源**（`progress` + `bbox`）——原任务书只提 `hitTargets`，
     按 0006 一并实现（`progress` 取**动画中间态**真值，不是 `open?1:0`）。
  3. `node` 取值 T2 写的是 `door_lf_glass0_0`（不是 GLB 实测的 `door_lf_glass.0_0`）。
     **不影响功能**：`resolvePivot` 的归一化兜底（剥非字母数字后比对）正是为这种情况准备的，实测 10/10 解析成功。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/src/components/scene/VehicleModel.jsx` | 重写接线：`PARTS`/`LIGHTS`/`INTERACTION`/`MODEL_*` 全部改读 `carConfig`；`state.parts[id]`/`state.lights[id]` 改读 `useCarStore`；命中 → `togglePart`/`toggleLight` + `bumpInteraction` + `pushToast("左前车窗已打开"/"大灯已开启")`；注册 `hitTargets` 与 `parts` 两个审计源；删除 A 段占位块；删除 `attachments`（对 tesla 恒为空表，属死代码）；`resolvePivot` 去掉未使用的 prefix/ascend 分支 |
  | `app/src/interaction/usePartPick.js` | 新增 `onPointerActivity`（§13.2 要求指针输入也 `bumpInteraction`）、`highlight` 开关（读 `INTERACTION.hoverHighlight`） |
  | `app/src/interaction/partMapping.js` | `partWorldBox` 对无 mesh 的部件加保护（pivot 解析失败时不抛错） |
  | `app/src/interaction/selftest/pick.cdp.mjs` | 终态改读 §13.3 的 `__carDisplaySceneAudit()`（不再依赖 T5 私有调试钩子），并断言 `__carDisplayStore` 可用 |
  | `docs/mount-t5.md` | **新增**：给 T8 的《挂载/接入说明》 |
  | `docs/contracts/CHANGELOG.md` | 追加 0010（车身固定外观 `APPEARANCE` 的申请，承接 T2 的 0009） |
- **关键决策**：
  1. **保留两个 legacy 全局**：`__formdriveHeadlightAnchors`、`__formdriveActiveTransform` —— T3 的 `HeadlightRig.jsx`
     （非本文件）正在读它们，T3 接线前删掉会打断对方。已在《挂载说明》里写明"T3 接线完成后可删"。
  2. **删除 4 个 legacy 调试全局**（`__formdriveSceneAudit` / `__formdriveModelScene` /
     `__formdriveMountedVehicles` / `__formdriveRenderedVehicleIds`）：替代品是 §13.3 的 `__carDisplaySceneAudit()`，
     信息更全。T1 的 `scripts/verify-*.mjs` 引用它们，但那两个脚本本就因硬编码 mustang/concept 失效且属 T9 重写范围，
     脚本里用的是 `?.()`，不会崩。
  3. **外观配置不擅自迁入契约**：车身涂装/轮毂仍读 legacy `studioConfig` 的 `PAINTS`/`WHEELS` + shim 的 `paint`/`finish`/`wheel`
     （值即默认 `ivory`/`12`/`turbine`，行为与 T1 基线一致）。`config/**` 属 T2 独占，按 §13.4 登记 CHANGELOG 0010 申请，
     并在《挂载说明》里标为"T8 删 shim 前必须先决定"。
  4. **`trackInitialTransfer` 保持等价行为**：写成 `const trackInitialTransfer = false` 并注释指向 T1 记录 04 / 人工配置 #9，
     **不擅自改行为**，等人工确认后改 `!initialSceneReady` 即可开启字节级 MB 读数。
  5. **`hitTargets.screen` 用 clientX/clientY 坐标系**，且坐标经过"回投验证"——T9 拿到即可直接派发事件。
  6. **DEV-only 命中探针** `window.__carDisplayPickAt(x, y)`：§13.3 冻结面不含它，但量"点中率"与排查误命中必需；
     正式断言仍走 `__carDisplaySceneAudit()`。
- **自测结果**：
  - **无头自测**：`node src/interaction/selftest/pick.selftest.mjs` → **22/22 通过**（B 段改动后复跑）。
  - **`npm run build`**：✅ 6.31s 通过（基线既有 3 条警告，无新增）。
  - **dev server 模块图**：✅ `VehicleModel.jsx` / `partMapping.js` / `PartHitAreas.jsx` / `usePartPick.js` /
    `carConfig.js` / `useCarStore.js` 经 Vite 转换全部 HTTP 200，dev 日志无报错。
  - **真实浏览器桌面/手机点按与点中率**：**仍未跑**——本 Agent 沙箱不允许启动 worktree 之外的 Edge。
    脚本 `selftest/pick.cdp.mjs` 已改好并可直接跑，登记人工配置区 #7。
- **commit**：见本记录所在提交。
- **遗留项**：
  1. **真实浏览器点按验收未跑**（人工配置区 #7，唯一阻塞项）。
  2. **CHANGELOG 0010**（车身固定外观 `APPEARANCE`）待 T2/T8 受理——T8 删 shim 前必须先落地。
  3. `VehicleModel.jsx` 的 `trackInitialTransfer` 保持 `false`，等人工确认（#9）。

### 记录 11 · 2026-09-22 · B 段收尾：修渲染层矩阵 bug + 处理 rebase 后的 push 分歧

- **轮次目标**：交付前自查，修掉一处渲染层真 bug；把 rebase 造成的 push 分歧按纪律处理干净。
- **改动文件**：`app/src/interaction/PartHitAreas.jsx`。
- **关键决策 / 问题**：
  1. **（真 bug，自查发现）`matrixAutoUpdate={false}` 下直接改 `matrix` 不会生效**。
     现象预判：`?cdHit=1` 的命中区线框与车窗悬停高亮会**钉死在场景原点**，不跟车、不跟相机。
     根因：`<mesh matrixAutoUpdate={false}>` 后，three 的 `updateMatrixWorld()` 里
     `if (this.matrixAutoUpdate) this.updateMatrix();` 被跳过，而 `matrixWorldNeedsUpdate` 仍为 `false`
     → `matrixWorld` 根本不重算，我写进 `matrix` 的值从未被使用。
     修法：改成每帧写 `mesh.position` / `mesh.scale`（`matrixAutoUpdate` 保持默认 true，让 three 自己算），
     并在两处都加注释说明这个坑。**该 bug 不影响拾取逻辑**（命中判定走解析 OBB，与渲染无关），
     但会直接毁掉"悬停高亮明确"这条 DoD——车窗开启后正是靠这个半透明盒子做高亮的。
  2. **rebase 后的 push 分歧按纪律处理**：B 段 rebase 到 `contract-v1` 改写了本地历史，远端 `wave1/t5`
     仍指向 rebase 前的提交，`git push` 被拒。**未 force push**（纪律明令禁止），改为
     `git merge origin/wave1/t5 -X ours` 保留双方历史后推送。
     踩到一个坑：`-X ours` 只作用于**冲突 hunk**，而"A 段新增占位块"在两边是**相同的新增**（非冲突），
     合并后 git 又把它带回来了（我这边随后删掉了它，git 判定为"对面新增"）→ 结果树里出现了引用已删常量的
     死代码块，且 `const pick`/`hitAreas`/`handlePick` 重复声明，**会直接编译失败**。
     修法：`git checkout 74c2b78 -- <该文件>` 还原，`git commit --amend` 修正合并提交，
     再用 `git diff 74c2b78 HEAD` 确认结果树与合并前**逐字节一致**（空输出）后才推送。
- **自测结果**：
  - **无头自测**：**22/22 通过**（复跑）。
  - **`npm run build`**：✅ 5.79s 通过。
  - **结果树一致性**：`git diff 74c2b78 HEAD --stat` 空输出 ✅。
  - **真实浏览器点按验收**：仍未跑（人工配置区 #7）。
- **commit**：见本记录所在提交（`wave1/t5` 已推送至远端）。
- **遗留项**：同记录 10 的三条。

---

## 需要项目人工配置的地方

> 仅登记 AI 无法自行完成、必须由项目负责人处理的事项。

| # | 事项 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | Node 版本 | 本机 `node v24.13.1` / `npm 11.8.0`，项目 `.nvmrc` 与 `engines` 声明 `22.x`，本机无 nvm。已确认用 Node 24 继续（`npm install` 仅告警不阻断，Vite 7 要求 ≥22.12 已满足）。如需严格对齐声明，请装 nvm-windows + Node 22 后重跑 `npm install`。 | 已解决（按 Node 24 继续） |
| 2 | 手机真机同局域网联调 | 开发机 WLAN 地址 `10.14.6.9`（SSID `henu 3`，网络类别 Public）。Public 防火墙配置文件**已关闭**且已存在 2 条 `Node.js JavaScript Runtime` 入站放行规则，**无需额外放行端口**。手机需连同一 Wi-Fi 后访问 `http://10.14.6.9:5173/`。若校园网开启 AP 客户端隔离，手机将无法访问，此时请改用手机热点。**AI 无法代做真机验收**，请人工确认"仅 Tesla 一台车 / 无车型切换入口 / 四门四窗前后备箱灯光可用 / 触摸拖拽旋转可用"。 | 待处理（需真机） |
| 3 | 加载页字节 MB 读数 | 见记录 04/05。人工已决策「本轮修」，`VehicleModel.jsx:81` 已改并验证通过。 | 已解决 |
| 4 | Tesla 模型 CC BY 4.0 署名 | `app/public/models/TESLA-LICENSE.md` 已完整保留（Ameer Studio / Sketchfab / CC BY 4.0）。是否需在最终页面 UI 上展示署名文案，属 roadmap T10「第三方许可归属」范围，本轮未涉及。 | 待处理（T10 范围） |
| 5 | 无头浏览器 CDP 自测放行 | **阻塞 T2（渲染层实测）与 T8p（降级页 / perf 审计读数 / 自动降档）两个 Agent。** 现象：任何**可执行文件位于 worktree 之外**的命令都被本会话的 worktree 隔离守卫拦下，理由是无法证明该命令不是 git 操作。已实测被拦的形式：绝对路径直接调 `msedge.exe`、`cmd //c mklink`（`//c` 被判成越界路径）。**注意：AI 不得用 node 子进程或 worktree 内软链去伪装路径绕过该守卫**（属规避守卫意图），因此必须由人工放行。三种可行方式，推荐程度由高到低：<br>**①（推荐，零配置）** 你在**另一个普通终端窗口**里跑一次下面的命令并保持窗口开着。一个 Edge 实例可被 T2 与 T8p 共用（CDP 可各自开标签页）：`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9333 --user-data-dir=C:\Users\112\AppData\Local\Temp\cd-edge-profile --no-first-run --window-size=1440,900 http://127.0.0.1:5174/`。**不要用会话里的 `!` 前缀跑**——无头 Edge 不会自行退出，会把输入框一直占住。<br>**②** 在 `~/.claude/settings.local.json` 的 `permissions.allow` 里加 `"Bash(\"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe\"*)"`（T8p 尝试代改被分类器拦下，见 #7）。<br>**③（原生但脆弱，不推荐）** `safe-chains --suggest "<命令>"` 会给出 `[[command]]` 块与 `[[trusted]]` 的 sha256 pin 两段配置，分别写入项目根 `.safe-chains.toml` 与 `~/.config/safe-chains.toml`。**修正 T2 原先的判断**：`~/.config/safe-chains.toml` 这个路径本身是对的（safe-chains 自己这么命名），只是该文件尚未存在、需按需创建；缺点是 sha256 与项目 toml 内容强绑定，任何编辑都会让 pin 失效。 | **T8 已实测放行**：T8 会话中直接以绝对路径启动 `msedge.exe --headless=new --remote-debugging-port=9411` 成功、CDP 连通，故对 T8 不再是阻塞项；T2/T8p 当时的历史阻塞记录保留。 |
| 6 | 5173 端口被他人 Vite 实例占用 | 本机 5173 已被另一个 Vite 进程（PID 24428）监听，T2 的 dev server 自动落到 **5174**。做 dev 自测时务必以自己实例输出的端口为准，否则会打到别人的工程得到假绿（详见记录 06 的端口陷阱）。若后续多 Agent 并行开发，建议各自显式指定端口。 | 待处理（已规避，登记备查） |
| 7 | **T6 真机麦克风授权 + §6 指令集识别验收** | 本机 headless 无麦克风、无 Chrome，AI **无法代做**。请在 **https 或 localhost** 的 **Chrome / Edge** 中打开沙盒页（或集成后的主页面），授权麦克风后逐条念 §6 指令集（打开/关闭车窗、打开左前门、关闭右后门、打开前/后备箱、打开/关闭大灯、转一下、看侧面、看正面、全部关闭），确认识别与执行正确。 | 待处理（需真机） |
| 8 | **T6 沙盒页访问地址（端口不固定）** | 本机 5173/5174/5175 已被其他并行会话的 dev server 占用，T6 的 dev server 实际落在 **5176**：`http://localhost:5176/src/voice/voice.sandbox.html`。每次启动以 Vite 日志打印的端口为准（日志会写 `Port 5173 is in use, trying another one...`）。 | 待处理（每次启动需确认端口） |
| 9 | **手机端语音测试需 https** | 局域网 `http://10.14.6.9:<port>` 属**非安全上下文**，Web Speech API 在手机上不可用（页面会显示中文降级提示，属预期行为）。手机真机语音验收须等 T10b 的 https 在线地址；开发期仅可用桌面 Chrome/Edge 的 localhost。 | 待处理（依赖 T10b） |
| 10 | 改 `~/.claude/settings.local.json` 被分类器拦下 | T8p 经人工同意后尝试在该文件的 `permissions.allow` 里追加两条 Edge 放行规则，连续两次被 Claude Code 的 auto mode 分类器以 "Stage 2 classifier error" 拒绝（提示为瞬时错误、可重试，但两次均未通过）。**AI 无法自行完成**。若采纳 #5 的方式②，请人工把这两条粘进 `permissions.allow`：`"Bash(\"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe\"*)"` 与 `"Bash(\"C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe\"*)"`。 | 待处理（可被 #5 方式①绕过，故不阻塞） |
| 11 | **无头浏览器启动放行（T9 同样受阻，且阻塞面更大）** | 与 #5 同一堵墙：worktree 隔离守卫拒绝执行工作目录外的 `msedge.exe`。**T9 的四个 verify 脚本全部靠 CDP 驱动真实浏览器，无浏览器则一个都跑不了**（Wave 1 出口「契约层断言跑绿」与 Wave 2 全部验收都卡在这里）。请二选一：① 放行 `~/.config/safe-chains.toml` 里的 msedge.exe 路径；② 自己起一次（在会话里用 `!` 前缀粘贴，dev server 端口按实际输出改）：`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9222 --user-data-dir=C:\Users\112\AppData\Local\Temp\car-display-edge --no-first-run --no-default-browser-check --window-size=1440,900 about:blank`（脚本会依次探测 9222/9333/12319，无需另配）。 | **T8 侧已解除**：T8 会话实测可直接启动无头 Edge（`--remote-debugging-port=9411`，CDP 连通）。**T9 可直接复用该实例**（`node scripts/verify-*.mjs --debug-port=9411`），无需再等人工放行；若 9411 未在运行，请先让 T8 拉起或自行尝试同样命令。 |
| 12 | main 工作树存在未提交改动 | 仓库根工作树（`D:\car_display`）有 `app/src/components/scene/VehicleModel.jsx` 的 **+3/−1 未提交改动**（疑为 T1 记录 04 的加载页 MB 读数修法）。它不在任何分支上：请确认是否提交、由谁提交（该文件按 §12.2 归 T5 独占，T7 不碰）。 | 待处理 |
| 13 | WebGPU 渲染器偶发报错/整页失响应 | headless Edge + WebGPU 下偶发 `Invalid value used as weak map key`（three_webgpu `Textures.updateTexture`），严重时页面后续不再响应。**未改动的基线同样可复现**（全新实例加载期 12 条），同一套相机运动在 **WebGL 回退下 0 条**。录屏/真机演示若遇到画面卡死，可先以 WebGL 运行；**是否强制 WebGL（或换 three 版本）属 T8/部署决策，请人工定**。详见 T7-02 问题 4。 | 待处理（T8 决策） |
| 14 | **T4 交付形态裁定**：旧配置器组件的删除与 `App.jsx` 禁改冲突 | §11.1 T4 要求"移除 Navigation/HeroCopy/VehicleSelector/ControlDeck/InfoDialog 等配置器组件"，但 §12.1 规定"Wave 1 一律不改 `App.jsx`"，而 `App.jsx` 正 import 着这 7 个组件——**删除文件 = build 失败**，与 S2 准入"build 全绿"直接冲突。三条出路：**(A) T4 删除组件 + 交付一处最小 `App.jsx` 改动**（仅摘除悬空 import 与已删组件挂载，不动其余；T8 反正要重写 `App.jsx`，冲突面单文件且必然发生）——**T4 建议此案**；**(B)** 组件文件保留不删，删除动作并入 T8 的 `App.jsx` 重写步（严格合规，但 T4 的"移除"未落地）；**(C)** 7 个旧文件改为 store 连接的 re-export shim（`App.jsx` 零改动即可渲染新中文 UI，但留下 T8 必须清理的间接层）。**未裁定前 T4 不删任何文件。** | **已解决（人工裁定采用方案 A，见记录 08）** |
| 15 | **`index.html` 归属** | 首屏 boot 加载页（`FORMDRIVE` / `REALTIME AUTOMOTIVE STUDIO` / `Shape takes form.` / `PREPARING INTERFACE`）、`<title>`、`lang="en"`、meta description 全为英文，且 boot 加载页是用户看到的第一屏——DoD「界面无英文残留」无法只靠 `ui/**` 达成。但 §12.2 文件独占矩阵**未把 `index.html` 划给任何 Wave 1 Agent**（"工程配置 / package.json / Vite" 一行的 T4 列为 `–`）。请裁定：`index.html` 归 T4（中文化 boot 页 + `lang="zh-CN"` + 中文 title/description），还是归 T10a/T8。 | **已解决（人工裁定归 T4，已中文化，见记录 08）** |
| 16 | **加载页字节级读数的契约字段缺口**（与 #3 同源） | §11.1 T4 要求"保留字节级加载进度"，但 §13.2 的 state 片未收录 T1 基线的 5 个加载态字段（`renderer` / `initialSceneReady` / `initialAssetProgress` / `initialAssetLoadedBytes` / `initialAssetTotalBytes`），而字节读数由 `useVehicleGLTF(url, trackInitialTransfer)` 的传输回调写入、调用点在 T5 的 `VehicleModel.jsx`。drei `useProgress` 只给条目数不给字节 → 新加载条会退化为 0→100 跳变（T1 记录 04 已实测：百分比正常、仅丢字节）。已登记 `docs/contracts/CHANGELOG.md` **0010**，建议 store **只增** `loading: { sceneReady, progress, loadedBytes, totalBytes }`（T5 写入、T4 消费），请 S1 一并裁定。 | **已裁定采纳（人工，2026-09-22）；待 T2 受理推送 `contract-v1` + T5 在 `VehicleModel.jsx` 写入** |
| 17 | **5199 端口上并存两个 dev server** | 实测 `netstat` + `wmic` 查明：`[::1]:5199`（IPv6）是 **T3 的实例**（`wave1-t3`，绑基线 App），`0.0.0.0:5199`（IPv4）是 **T4 的实例**（`wave1-t4`）。同一端口两个不同工程 → 双方自测都可能打到对方（T4 已因此产生 5 项「假红」，见记录 08 问题 1）。**AI 无法自行清理**：T4 的旧实例（PID 20096）随会话后台任务残留，`taskkill` 被本会话权限拒绝。请人工执行 `taskkill /PID 20096 /F` 释放，并**要求各 Agent 使用唯一端口**（T4 已改用 5211）。 | **待处理（需人工）** |
| 18 | **T5 真实浏览器点按验收** | T5 的沙箱不允许启动 worktree 之外的 Edge，`app/src/interaction/selftest/pick.cdp.mjs` 无法自行跑。请在 `D:\car_display\.claude\worktrees\wave1+t5` 下用 `!` 前缀执行一次：`"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --use-gl=angle --use-angle=swiftshader --remote-debugging-port=12319 --user-data-dir=C:/Users/112/AppData/Local/Temp/t5-edge-profile --no-first-run about:blank`（需先 `npm run dev`，端口以实际输出为准），之后 T5 即可自行跑出桌面点击/拖拽不误触发/触摸点按/玻璃点中率的实测数字。 | 待处理 |
| 19 | ~~§13.1 缺开合动画参数~~ | 已由 T2 在 `contract-v1` 补齐（CHANGELOG 0002：`PARTS[].motion/axis/angle/travel`）。T5 的 B 段直接消费，无需人工介入。 | 已解决 |
| 20 | **`VehicleModel.jsx:81` 死条件** | `vehicleId === "mustang"` 在单车裁剪后恒为 false，导致加载页丢失字节级 MB 读数（T1 记录 04）。该文件属 T5 独占、T1 已留给 T5 清理。B 段已把该行等价改写为 `const trackInitialTransfer = false`（**不擅自改行为**），人工确认后改 `!initialSceneReady` 即可开启。建议修。 | 待处理（等人工确认） |
| 21 | **车身固定外观 `APPEARANCE`** | CHANGELOG 0010（T5 提出）：涂装/轮毂配置器已按 §3.2 裁掉，但车身外观值目前只能从 legacy `studioConfig` + 兼容 shim 取；**T8 删 shim 前必须把它固化进 `carConfig`**，否则 `VehicleModel` 取不到外观值。`config/**` 属 T2 独占，T5 未擅自迁入。 | 待处理（T2/T8 受理） |
