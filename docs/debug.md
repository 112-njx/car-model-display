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

## Wave 1 · T6 语音控车引擎（Web Speech API）

> 分支 `wave1/t6`（worktree `.claude/worktrees/wave1+t6`），基线 `0c41982`（T1 交付）。
> A 段 = 契约无关阶段（启动即做），B 段 = 接线阶段（等 `contract-v1` 推送后 rebase）。
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

---

## 需要项目人工配置的地方

> 仅登记 AI 无法自行完成、必须由项目负责人处理的事项。

| # | 事项 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | Node 版本 | 本机 `node v24.13.1` / `npm 11.8.0`，项目 `.nvmrc` 与 `engines` 声明 `22.x`，本机无 nvm。已确认用 Node 24 继续（`npm install` 仅告警不阻断，Vite 7 要求 ≥22.12 已满足）。如需严格对齐声明，请装 nvm-windows + Node 22 后重跑 `npm install`。 | 已解决（按 Node 24 继续） |
| 2 | 手机真机同局域网联调 | 开发机 WLAN 地址 `10.14.6.9`（SSID `henu 3`，网络类别 Public）。Public 防火墙配置文件**已关闭**且已存在 2 条 `Node.js JavaScript Runtime` 入站放行规则，**无需额外放行端口**。手机需连同一 Wi-Fi 后访问 `http://10.14.6.9:5173/`。若校园网开启 AP 客户端隔离，手机将无法访问，此时请改用手机热点。**AI 无法代做真机验收**，请人工确认"仅 Tesla 一台车 / 无车型切换入口 / 四门四窗前后备箱灯光可用 / 触摸拖拽旋转可用"。 | 待处理（需真机） |
| 3 | 加载页字节 MB 读数 | 见记录 04，等待人工决策是否修 `VehicleModel.jsx:81`。 | 待处理 |
| 4 | Tesla 模型 CC BY 4.0 署名 | `app/public/models/TESLA-LICENSE.md` 已完整保留（Ameer Studio / Sketchfab / CC BY 4.0）。是否需在最终页面 UI 上展示署名文案，属 roadmap T10「第三方许可归属」范围，本轮未涉及。 | 待处理（T10 范围） |
| 5 | **T6 真机麦克风授权 + §6 指令集识别验收** | 本机 headless 无麦克风、无 Chrome，AI **无法代做**。请在 **https 或 localhost** 的 **Chrome / Edge** 中打开沙盒页（或集成后的主页面），授权麦克风后逐条念 §6 指令集（打开/关闭车窗、打开左前门、关闭右后门、打开前/后备箱、打开/关闭大灯、转一下、看侧面、看正面、全部关闭），确认识别与执行正确。 | 待处理（需真机） |
| 6 | **T6 沙盒页访问地址（端口不固定）** | 本机 5173/5174/5175 已被其他并行会话的 dev server 占用，T6 的 dev server 实际落在 **5176**：`http://localhost:5176/src/voice/voice.sandbox.html`。每次启动以 Vite 日志打印的端口为准（日志会写 `Port 5173 is in use, trying another one...`）。 | 待处理（每次启动需确认端口） |
| 7 | **手机端语音测试需 https** | 局域网 `http://10.14.6.9:<port>` 属**非安全上下文**，Web Speech API 在手机上不可用（页面会显示中文降级提示，属预期行为）。手机真机语音验收须等 T10b 的 https 在线地址；开发期仅可用桌面 Chrome/Edge 的 localhost。 | 待处理（依赖 T10b） |
