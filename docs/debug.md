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
- **状态**：**已上报人工，等待决策**（本轮不擅自改动 T5 独占文件）。

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

## 需要项目人工配置的地方

> 仅登记 AI 无法自行完成、必须由项目负责人处理的事项。

| # | 事项 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | Node 版本 | 本机 `node v24.13.1` / `npm 11.8.0`，项目 `.nvmrc` 与 `engines` 声明 `22.x`，本机无 nvm。已确认用 Node 24 继续（`npm install` 仅告警不阻断，Vite 7 要求 ≥22.12 已满足）。如需严格对齐声明，请装 nvm-windows + Node 22 后重跑 `npm install`。 | 已解决（按 Node 24 继续） |
| 2 | 手机真机同局域网联调 | 开发机 WLAN 地址 `10.14.6.9`（SSID `henu 3`，网络类别 Public）。Public 防火墙配置文件**已关闭**且已存在 2 条 `Node.js JavaScript Runtime` 入站放行规则，**无需额外放行端口**。手机需连同一 Wi-Fi 后访问 `http://10.14.6.9:5173/`。若校园网开启 AP 客户端隔离，手机将无法访问，此时请改用手机热点。**AI 无法代做真机验收**，请人工确认"仅 Tesla 一台车 / 无车型切换入口 / 四门四窗前后备箱灯光可用 / 触摸拖拽旋转可用"。 | 待处理（需真机） |
| 3 | 加载页字节 MB 读数 | 见记录 04，等待人工决策是否修 `VehicleModel.jsx:81`。 | 待处理 |
| 4 | Tesla 模型 CC BY 4.0 署名 | `app/public/models/TESLA-LICENSE.md` 已完整保留（Ameer Studio / Sketchfab / CC BY 4.0）。是否需在最终页面 UI 上展示署名文案，属 roadmap T10「第三方许可归属」范围，本轮未涉及。 | 待处理（T10 范围） |
| 5 | 无头浏览器 CDP 自测放行 | T2 需要用本机 Edge（`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`）以 `--headless=new --remote-debugging-port=9333` 打开 `http://127.0.0.1:5174/` 做渲染层实测（部件动画 / 灯光发光 / 相机位移）。该命令被本会话的 worktree 隔离守卫拦下（它无法判定命令名不是 git）。**AI 无法自行放行**。请二选一：① 在 `~/.config/safe-chains.toml` 放行该路径/命令；② 自己执行一次（把下面命令里的路径原样粘贴到会话里，前缀 `!`）：`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9333 --user-data-dir=C:\Users\112\AppData\Local\Temp\t2-edge-profile --no-first-run --window-size=1440,900 http://127.0.0.1:5174/`（需先在 worktree 的 `app/` 里跑着 `npm run dev`，端口以实际输出为准）。 | 待处理（阻塞 T2 渲染层实测） |
| 6 | 5173 端口被他人 Vite 实例占用 | 本机 5173 已被另一个 Vite 进程（PID 24428）监听，T2 的 dev server 自动落到 **5174**。做 dev 自测时务必以自己实例输出的端口为准，否则会打到别人的工程得到假绿（详见记录 06 的端口陷阱）。若后续多 Agent 并行开发，建议各自显式指定端口。 | 待处理（已规避，登记备查） |
| 7 | **无头浏览器启动放行（T9 同样受阻，且阻塞面更大）** | 与 #5 同一堵墙：worktree 隔离守卫拒绝执行工作目录外的 `msedge.exe`。**T9 的四个 verify 脚本全部靠 CDP 驱动真实浏览器，无浏览器则一个都跑不了**（Wave 1 出口「契约层断言跑绿」与 Wave 2 全部验收都卡在这里）。请二选一：① 放行 `~/.config/safe-chains.toml` 里的 msedge.exe 路径；② 自己起一次（在会话里用 `!` 前缀粘贴，dev server 端口按实际输出改）：`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9222 --user-data-dir=C:\Users\112\AppData\Local\Temp\car-display-edge --no-first-run --no-default-browser-check --window-size=1440,900 about:blank`（脚本会依次探测 9222/9333/12319，无需另配）。 | **待处理（阻塞 T9 脚本自测与 Wave 2 全部验收）** |
