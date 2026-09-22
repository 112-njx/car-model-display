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

## 需要项目人工配置的地方

> 仅登记 AI 无法自行完成、必须由项目负责人处理的事项。

| # | 事项 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | Node 版本 | 本机 `node v24.13.1` / `npm 11.8.0`，项目 `.nvmrc` 与 `engines` 声明 `22.x`，本机无 nvm。已确认用 Node 24 继续（`npm install` 仅告警不阻断，Vite 7 要求 ≥22.12 已满足）。如需严格对齐声明，请装 nvm-windows + Node 22 后重跑 `npm install`。 | 已解决（按 Node 24 继续） |
| 2 | 手机真机同局域网联调 | 开发机 WLAN 地址 `10.14.6.9`（SSID `henu 3`，网络类别 Public）。Public 防火墙配置文件**已关闭**且已存在 2 条 `Node.js JavaScript Runtime` 入站放行规则，**无需额外放行端口**。手机需连同一 Wi-Fi 后访问 `http://10.14.6.9:5173/`。若校园网开启 AP 客户端隔离，手机将无法访问，此时请改用手机热点。**AI 无法代做真机验收**，请人工确认"仅 Tesla 一台车 / 无车型切换入口 / 四门四窗前后备箱灯光可用 / 触摸拖拽旋转可用"。 | 待处理（需真机） |
| 3 | 加载页字节 MB 读数 | 见记录 04，等待人工决策是否修 `VehicleModel.jsx:81`。 | 待处理 |
| 4 | Tesla 模型 CC BY 4.0 署名 | `app/public/models/TESLA-LICENSE.md` 已完整保留（Ameer Studio / Sketchfab / CC BY 4.0）。是否需在最终页面 UI 上展示署名文案，属 roadmap T10「第三方许可归属」范围，本轮未涉及。 | 待处理（T10 范围） |
| 5 | main 工作树存在未提交改动 | 仓库根工作树（`D:\car_display`）有 `app/src/components/scene/VehicleModel.jsx` 的 **+3/−1 未提交改动**（疑为 T1 记录 04 的加载页 MB 读数修法）。它不在任何分支上：请确认是否提交、由谁提交（该文件按 §12.2 归 T5 独占，T7 不碰）。 | 待处理 |
