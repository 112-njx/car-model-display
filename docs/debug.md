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

---

## 需要项目人工配置的地方

> 仅登记 AI 无法自行完成、必须由项目负责人处理的事项。

| # | 事项 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | Node 版本 | 本机 `node v24.13.1` / `npm 11.8.0`，项目 `.nvmrc` 与 `engines` 声明 `22.x`，本机无 nvm。已确认用 Node 24 继续（`npm install` 仅告警不阻断，Vite 7 要求 ≥22.12 已满足）。如需严格对齐声明，请装 nvm-windows + Node 22 后重跑 `npm install`。 | 已解决（按 Node 24 继续） |
| 2 | 手机真机同局域网联调 | 开发机 WLAN 地址 `10.14.6.9`（SSID `henu 3`，网络类别 Public）。Public 防火墙配置文件**已关闭**且已存在 2 条 `Node.js JavaScript Runtime` 入站放行规则，**无需额外放行端口**。手机需连同一 Wi-Fi 后访问 `http://10.14.6.9:5173/`。若校园网开启 AP 客户端隔离，手机将无法访问，此时请改用手机热点。**AI 无法代做真机验收**，请人工确认"仅 Tesla 一台车 / 无车型切换入口 / 四门四窗前后备箱灯光可用 / 触摸拖拽旋转可用"。 | 待处理（需真机） |
| 3 | 加载页字节 MB 读数 | 见记录 04，等待人工决策是否修 `VehicleModel.jsx:81`。 | 待处理 |
| 4 | Tesla 模型 CC BY 4.0 署名 | `app/public/models/TESLA-LICENSE.md` 已完整保留（Ameer Studio / Sketchfab / CC BY 4.0）。是否需在最终页面 UI 上展示署名文案，属 roadmap T10「第三方许可归属」范围，本轮未涉及。 | 待处理（T10 范围） |
| 5 | 无头浏览器 CDP 自测放行 | **阻塞 T2（渲染层实测）与 T8p（降级页 / perf 审计读数 / 自动降档）两个 Agent。** 现象：任何**可执行文件位于 worktree 之外**的命令都被本会话的 worktree 隔离守卫拦下，理由是无法证明该命令不是 git 操作。已实测被拦的形式：绝对路径直接调 `msedge.exe`、`cmd //c mklink`（`//c` 被判成越界路径）。**注意：AI 不得用 node 子进程或 worktree 内软链去伪装路径绕过该守卫**（属规避守卫意图），因此必须由人工放行。三种可行方式，推荐程度由高到低：<br>**①（推荐，零配置）** 你在**另一个普通终端窗口**里跑一次下面的命令并保持窗口开着。一个 Edge 实例可被 T2 与 T8p 共用（CDP 可各自开标签页）：`"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --headless=new --remote-debugging-port=9333 --user-data-dir=C:\Users\112\AppData\Local\Temp\cd-edge-profile --no-first-run --window-size=1440,900 http://127.0.0.1:5174/`。**不要用会话里的 `!` 前缀跑**——无头 Edge 不会自行退出，会把输入框一直占住。<br>**②** 在 `~/.claude/settings.local.json` 的 `permissions.allow` 里加 `"Bash(\"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe\"*)"`（T8p 尝试代改被分类器拦下，见 #7）。<br>**③（原生但脆弱，不推荐）** `safe-chains --suggest "<命令>"` 会给出 `[[command]]` 块与 `[[trusted]]` 的 sha256 pin 两段配置，分别写入项目根 `.safe-chains.toml` 与 `~/.config/safe-chains.toml`。**修正 T2 原先的判断**：`~/.config/safe-chains.toml` 这个路径本身是对的（safe-chains 自己这么命名），只是该文件尚未存在、需按需创建；缺点是 sha256 与项目 toml 内容强绑定，任何编辑都会让 pin 失效。 | 待处理（阻塞 T2 与 T8p） |
| 6 | 5173 端口被他人 Vite 实例占用 | 本机 5173 已被另一个 Vite 进程（PID 24428）监听，T2 的 dev server 自动落到 **5174**。做 dev 自测时务必以自己实例输出的端口为准，否则会打到别人的工程得到假绿（详见记录 06 的端口陷阱）。若后续多 Agent 并行开发，建议各自显式指定端口。 | 待处理（已规避，登记备查） |
| 7 | 改 `~/.claude/settings.local.json` 被分类器拦下 | T8p 经人工同意后尝试在该文件的 `permissions.allow` 里追加两条 Edge 放行规则，连续两次被 Claude Code 的 auto mode 分类器以 "Stage 2 classifier error" 拒绝（提示为瞬时错误、可重试，但两次均未通过）。**AI 无法自行完成**。若采纳 #5 的方式②，请人工把这两条粘进 `permissions.allow`：`"Bash(\"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe\"*)"` 与 `"Bash(\"C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe\"*)"`。 | 待处理（可被 #5 方式①绕过，故不阻塞） |
