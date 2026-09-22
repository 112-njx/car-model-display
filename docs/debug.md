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

## 需要项目人工配置的地方

> 仅登记 AI 无法自行完成、必须由项目负责人处理的事项。

| # | 事项 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | Node 版本 | 本机 `node v24.13.1` / `npm 11.8.0`，项目 `.nvmrc` 与 `engines` 声明 `22.x`，本机无 nvm。已确认用 Node 24 继续（`npm install` 仅告警不阻断，Vite 7 要求 ≥22.12 已满足）。如需严格对齐声明，请装 nvm-windows + Node 22 后重跑 `npm install`。 | 已解决（按 Node 24 继续） |
| 2 | 手机真机同局域网联调 | 开发机 WLAN 地址 `10.14.6.9`（SSID `henu 3`，网络类别 Public）。Public 防火墙配置文件**已关闭**且已存在 2 条 `Node.js JavaScript Runtime` 入站放行规则，**无需额外放行端口**。手机需连同一 Wi-Fi 后访问 `http://10.14.6.9:5173/`。若校园网开启 AP 客户端隔离，手机将无法访问，此时请改用手机热点。**AI 无法代做真机验收**，请人工确认"仅 Tesla 一台车 / 无车型切换入口 / 四门四窗前后备箱灯光可用 / 触摸拖拽旋转可用"。 | 待处理（需真机） |
| 3 | 加载页字节 MB 读数 | 见记录 04/05。人工已决策「本轮修」，`VehicleModel.jsx:81` 已改并验证通过。 | 已解决 |
| 4 | Tesla 模型 CC BY 4.0 署名 | `app/public/models/TESLA-LICENSE.md` 已完整保留（Ameer Studio / Sketchfab / CC BY 4.0）。是否需在最终页面 UI 上展示署名文案，属 roadmap T10「第三方许可归属」范围，本轮未涉及。 | 待处理（T10 范围） |
