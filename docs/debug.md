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

## Wave 1 · T4 中文中控 UI（面板 / Toast / 加载页 / 主题）

### 记录 05 · 2026-09-22 · T4 A 段：组件骨架 + 中文文案表 + 深色中控主题

- **轮次目标**：A 段「契约无关阶段」——在 `contract-v1` 未就绪时先把与 store 无关的真实工作量做完：4 个组件骨架（props 驱动）、中文文案表、`tokens.css` 深色中控主题、响应式布局雏形、中文加载页与手势提示。
- **工作区**：`git worktree add .claude/worktrees/wave1-t4 -b wave1/t4 main`（与其他 Agent 的 `wave1+t2`/`wave1+t5`/`wave1-t3` 同一约定，路径 `.claude/worktrees/`）。
- **改动文件**：
  | 文件 | 改动 |
  | --- | --- |
  | `app/src/components/ui/strings.js` | 新增。中文文案表（界面文案唯一来源），供 T5/T6/T8 复用，保证同一动作在不同通道下反馈一致 |
  | `app/src/components/ui/PartButton.jsx` | 新增。单个部件按钮，props 驱动，含车窗/车门/前备箱三种内联 SVG 图示 |
  | `app/src/components/ui/ToastHost.jsx` | 新增。Toast 宿主，props 驱动，逐条自动消失 + 点击关闭 |
  | `app/src/components/ui/LoadingScreen.jsx` | 新增。中文加载页，保留字节级进度条结构与 00–100 百分比读数，含超时/退场状态机 |
  | `app/src/components/ui/ControlPanel.jsx` | 新增。中控面板：车辆状态标题 + 3 个部件分组（含组内全开/全关）+ 大灯/尾灯开关 + 视角按钮（复位/正面/侧面/细节）+ 环绕一周 + 待机自转 + 一键全部关闭 + 语音容器位 + 手势提示 |
  | `app/tokens.css` | 重写。深灰蓝黑底（`oklch(14% .022 252)`）+ 青色 `--color-accent: oklch(84% .12 195)` / 冰蓝 `--color-accent-2` 点缀 + 玻璃拟态材质；新增中文字体回退栈与 `--tap-min` 触控尺寸；**保留全部既有 token 名**（T3/T6/T8 只引用不重定义） |
  | `app/src/style.css` | 重写。`cd-ui-` 前缀命名隔离；手机底部面板（<40rem 默认收起）/ 平板右下浮层（≥40rem）/ 桌面右侧侧栏（≥60rem）三档响应式；含 reduced-motion / reduced-transparency / backdrop-filter 降级 |
- **关键决策**：
  1. **`ui/**` 落位 `app/src/components/ui/`**。依据：§12.2 的 `scene/VehicleModel.jsx` 对应既有 `src/components/scene/`，故 `ui/**` 对应既有 `src/components/ui/`（FormDrive 原目录，被移除的 ControlDeck 等也在此）。未新建 `src/ui/`。
  2. **组件一律 props 驱动、不读 store**（A 段纪律），但 props 形状与 §13.1/§13.2 字段一一对应，B 段接线为纯替换。
  3. **`tokens.css` 保留全部既有 token 名**（仅重调数值），并保留已无消费方的 `--paint-*`。原因：T3（`cd-env-`）、T6（`cd-voice-`）正在并行写各自的 css，改名/删名会让它们静默失效。文件头已标注 `--paint-*` 待 T8 集成末段清理。
  4. **加载页去掉 FormDrive 的 localStorage 跳过逻辑**（`formdrive:studio-ready:v1` 键）。原因：该键名是英文品牌残留，且与新加载页的"每次进入都展示中控启动"定位冲突；改为可选 `bypass` prop，由宿主决定（见《挂载说明》）。
  5. **加载页去掉 `WebGPU / WEBGL`、`FORMDRIVE © 2026` 等英文遥测文案**，改为「实时渲染通道」与「首次载入约 22 MB」。理由：DoD 要求"界面无英文残留"；`WebGPU/WebGL` 虽是技术专名，但非必要信息。
  6. **面板初始展开态按断点决定**（≥40rem 展开、手机收起），与 `style.css` 断点一致，宿主无需传参。
  7. **语音容器位渲染中文占位**（虚线框 + 「语音控制」），T8 传入 `voiceSlot` 后占位自动消失；本任务不实现任何语音逻辑。
- **自测结果**：
  - `npm run build`：✅ 625 modules，4.50s（与 T1 基线一致——新组件此时尚未被 import，被 tree-shake）。自带警告（Circular chunk / empty chunk / >500kB）均为 FormDrive 原有。
  - **真实浏览器实测（Edge 153 headless + CDP，脚本在仓库外 `%TEMP%/t4-selftest/`）**：临时改写 `App.jsx` 挂载（**该改动不入交付，已还原并另存自测件**），用 §13.1 形状的假数据驱动，**42/42 项断言全部通过**：
    - **375×812 手机视口**：无横向溢出元素（逐元素 `getBoundingClientRect` 越界扫描）；面板贴合视口（l=12, r=363）；默认收起（面板高 109px）；点击展开后 `body` 高 435px；10 个部件按钮全部渲染；无标签截断（`scrollWidth > clientWidth` 扫描为空）。
    - **交互链路**：点「左前车窗」→ `aria-pressed` 翻转 + Toast「左前车窗已打开」+ 状态摘要「已开启 1 / 10 个部件」；点「车窗 全开」→ 组计数 4/4 + Toast「车窗已全部打开」；点大灯开关 → `aria-checked=true` + Toast「大灯已开启」；点「侧面」→ 激活态切换 + Toast「视角已切换到侧面」；点「环绕一周」→ Toast「正在环绕车辆一周」；Toast 3.2s 后自动消失；点「全部关闭」→ 部件与灯光全复位 + 状态摘要「车辆已全部关闭」；点 Toast 本体可立即关闭。
    - **中文加载页**：品牌「智能座舱」、大标题「车形即现」、状态文案随进度在「正在准备资源→正在加载车身模型→正在校准材质」间切换、`role="progressbar"` 的 `aria-valuenow` 实测推进 8 → 43、就绪后自动退场。
    - **1440×900 桌面视口**：面板默认展开、位于右侧侧栏（l=1016, r=1416）、完全在视口内；手势提示可见；语音容器位存在；内部滚动生效（scrollHeight 1020 > clientHeight 646）。
    - **英文残留扫描**：375 与 1440 两个视口逐文本节点扫描 `[A-Za-z]{2,}`，仅剩专名 `Tesla`/`Model` 与单位 `MB`，**界面无英文文案残留**。
    - **控制台 0 错误**。
  - **视觉确认（人工看图）**：截图 `%TEMP%/t4-selftest/{375-loading,375-collapsed,375-expanded,375-interacted,1440-desktop}.png`。深色蓝黑底 + 青色点缀 + 玻璃卡片渲染正确，中文排版无截断、无换行错位；部件按钮 2 列网格、分组计数青色高亮、开启态青色描边发光均正常。
  - **一次误判纠正**：桌面截图中「大灯」开关疑似呈开启态，用探针脚本核实 `aria-checked="false"`、滑块距左 5px（`switchW=52`），确认是低分辨率读图误差，**非 bug**。
- **commit**：`0c21106`（已 push 到 `origin/wave1/t4`）
- **遗留项**：
  1. **B 段未开始**：A 段完成时 `origin/contract-v1` 已推送（T2 提交 `0387166`），已 `git fetch` 确认内容齐备（`carConfig.js` / `useCarStore.js` / `auditHooks.js` / 兼容 shim / `CHANGELOG.md` 0001–0009）。**注意：T2 的 DoD 要求产出 `docs/contracts/store-contract.md`，该文件尚未出现，而 `useCarStore.js` 已引用它**——已上报（见人工配置区）。
  2. **加载页字节级读数缺口**：§13.2 的 state 片未收录 T1 基线的 5 个加载态字段，字节读数取不到 → 已登记 `docs/contracts/CHANGELOG.md` 0010，待 S1 裁定。
  3. **旧配置器组件的删除与 `App.jsx` 禁改冲突**：删除 `ControlDeck` 等 7 个组件会让未改动的 `App.jsx` 编译失败（S2 要求 build 全绿）。已上报（见人工配置区），待裁定交付形态。
  4. **`index.html` 归属未定**：首屏 boot 加载页、`<title>`、`lang="en"`、meta description 全为英文，但 §12.2 未把 `index.html` 划给任何 Wave 1 Agent。已上报。
  5. **`HeroCopy` 过时英文文案**（T1 记录 03 遗留 5）随该组件在 B 段一并移除。
  6. `--paint-*` token 与 legacy `studioConfig.js` 的清理归 T8 集成末段（与 T2 CHANGELOG 0008/0009 同批）。

---

## 需要项目人工配置的地方

> 仅登记 AI 无法自行完成、必须由项目负责人处理的事项。

| # | 事项 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | Node 版本 | 本机 `node v24.13.1` / `npm 11.8.0`，项目 `.nvmrc` 与 `engines` 声明 `22.x`，本机无 nvm。已确认用 Node 24 继续（`npm install` 仅告警不阻断，Vite 7 要求 ≥22.12 已满足）。如需严格对齐声明，请装 nvm-windows + Node 22 后重跑 `npm install`。 | 已解决（按 Node 24 继续） |
| 2 | 手机真机同局域网联调 | 开发机 WLAN 地址 `10.14.6.9`（SSID `henu 3`，网络类别 Public）。Public 防火墙配置文件**已关闭**且已存在 2 条 `Node.js JavaScript Runtime` 入站放行规则，**无需额外放行端口**。手机需连同一 Wi-Fi 后访问 `http://10.14.6.9:5173/`。若校园网开启 AP 客户端隔离，手机将无法访问，此时请改用手机热点。**AI 无法代做真机验收**，请人工确认"仅 Tesla 一台车 / 无车型切换入口 / 四门四窗前后备箱灯光可用 / 触摸拖拽旋转可用"。 | 待处理（需真机） |
| 3 | 加载页字节 MB 读数 | 见记录 04，等待人工决策是否修 `VehicleModel.jsx:81`。 | 待处理 |
| 4 | Tesla 模型 CC BY 4.0 署名 | `app/public/models/TESLA-LICENSE.md` 已完整保留（Ameer Studio / Sketchfab / CC BY 4.0）。是否需在最终页面 UI 上展示署名文案，属 roadmap T10「第三方许可归属」范围，本轮未涉及。 | 待处理（T10 范围） |
| 5 | **T4 交付形态裁定**：旧配置器组件的删除与 `App.jsx` 禁改冲突 | §11.1 T4 要求"移除 Navigation/HeroCopy/VehicleSelector/ControlDeck/InfoDialog 等配置器组件"，但 §12.1 规定"Wave 1 一律不改 `App.jsx`"，而 `App.jsx` 正 import 着这 7 个组件——**删除文件 = build 失败**，与 S2 准入"build 全绿"直接冲突。三条出路：**(A) T4 删除组件 + 交付一处最小 `App.jsx` 改动**（仅摘除悬空 import 与已删组件挂载，不动其余；T8 反正要重写 `App.jsx`，冲突面单文件且必然发生）——**T4 建议此案**；(B) 组件文件保留不删，删除动作并入 T8 的 `App.jsx` 重写步（严格合规，但 T4 的"移除"未落地）；(C) 7 个旧文件改为 store 连接的 re-export shim（`App.jsx` 零改动即可渲染新中文 UI，但留下 T8 必须清理的间接层）。**未裁定前 T4 不删任何文件**。 | **待人工裁定** |
| 6 | **`index.html` 归属** | 首屏 boot 加载页（`FORMDRIVE` / `REALTIME AUTOMOTIVE STUDIO` / `Shape takes form.` / `PREPARING INTERFACE`）、`<title>`、`lang="en"`、meta description 全为英文，且 boot 加载页是用户看到的第一屏——DoD「界面无英文残留」无法只靠 `ui/**` 达成。但 §12.2 文件独占矩阵**未把 `index.html` 划给任何 Wave 1 Agent**（"工程配置/package.json/Vite" 一行的 T4 列为 `–`）。请裁定：`index.html` 归 T4（中文化 boot 页 + `lang="zh-CN"` + 中文 title/description）还是归 T10a/T8。 | **待人工裁定** |
| 7 | **加载页字节级读数的契约字段缺口** | §11.1 T4 要求"保留字节级加载进度"，但 §13.2 的 state 片未收录 T1 基线的 5 个加载态字段（`renderer` / `initialSceneReady` / `initialAssetProgress` / `initialAssetLoadedBytes` / `initialAssetTotalBytes`），而字节读数由 `useVehicleGLTF(url, trackInitialTransfer)` 的传输回调写入、调用点在 T5 的 `VehicleModel.jsx`。drei `useProgress` 只给条目数不给字节 → 新加载条会退化为 0→100 跳变。已登记 `docs/contracts/CHANGELOG.md` **0010**（建议 store 只增 `loading: { sceneReady, progress, loadedBytes, totalBytes }`，T5 写入、T4 消费），请 S1 裁定。 | **待人工裁定（S1）** |
| 8 | `docs/contracts/store-contract.md` 缺失 | T2 的 `contract-v1`（`0387166`）已含 `carConfig.js` / `useCarStore.js` / `auditHooks.js` / shim / `CHANGELOG.md`，但 §11.1 T2 的 DoD 明确要求产出 `docs/contracts/store-contract.md`，且 `useCarStore.js` 正文已两处引用它（"见 docs/contracts/store-contract.md"）。该文档是 S1 评审对象，缺失会导致 S1 无法逐条比对。请提醒 T2 补交。 | **待处理（T2）** |
