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
| 7 | **T6 真机麦克风授权 + §6 指令集识别验收** | 本机 headless 无麦克风、无 Chrome，AI **无法代做**。请在 **https 或 localhost** 的 **Chrome / Edge** 中打开沙盒页（或集成后的主页面），授权麦克风后逐条念 §6 指令集（打开/关闭车窗、打开左前门、关闭右后门、打开前/后备箱、打开/关闭大灯、转一下、看侧面、看正面、全部关闭），确认识别与执行正确。 | 待处理（需真机） |
| 8 | **T6 沙盒页访问地址（端口不固定）** | 本机 5173/5174/5175 已被其他并行会话的 dev server 占用，T6 的 dev server 实际落在 **5176**：`http://localhost:5176/src/voice/voice.sandbox.html`。每次启动以 Vite 日志打印的端口为准（日志会写 `Port 5173 is in use, trying another one...`）。 | 待处理（每次启动需确认端口） |
| 9 | **手机端语音测试需 https** | 局域网 `http://10.14.6.9:<port>` 属**非安全上下文**，Web Speech API 在手机上不可用（页面会显示中文降级提示，属预期行为）。手机真机语音验收须等 T10b 的 https 在线地址；开发期仅可用桌面 Chrome/Edge 的 localhost。 | 待处理（依赖 T10b） |
