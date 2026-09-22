# T6 语音控车 · 挂载/接入说明

> 分支 `wave1/t6`（已并入 `contract-v1`）　|　文件域：`app/src/voice/**`（T6 独占）　|　roadmap §11.1 T6、§13.3 ④
> 本文件是 T6 交付物 ③，面向 **T8（集成）** 与 **T9（验证）**。
> 状态：**A 段 + B 段均已完成并自测通过**（headless Edge + CDP 76 项断言，假/真 store 两种模式）。

---

## 1. 文件清单与职责

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `voice/commands.js` | 指令词表/别名表/同音纠错表/「本车模没有的功能」表；`buildVocabulary()`、`describeActions()`（中文回执）、`executePlan()`（计划 → §13.2 action） | 无（纯数据 + 纯函数） |
| `voice/parseCommand.js` | `parseCommand()` / `parseCommandDetailed()` / `parseAlternatives()`（多候选择优），中文文本 → 动作计划（纯函数） | `commands.js` |
| `voice/commandCases.js` | 108 条用例 + `runCommandCases()`；文件底部有 Node CLI 入口 | `commands.js`、`parseCommand.js` |
| `voice/recognition.js` | `SpeechRecognition` 兼容封装：能力探测、权限、错误重试、安全上下文；`setRecognitionCtor()` 注入点底层 | 浏览器原生 API |
| `voice/synthesis.js` | `SpeechSynthesis` 播报封装（可选开关），不支持时静默降级 | 浏览器原生 API |
| `voice/voiceController.js` | **状态机**（框架无关、store 无关）：识别事件 → 解析 → `executePlan` → 快照/回执；`injectRecognition()` | `commands.js`、`parseCommand.js`、`recognition.js` |
| `voice/useVoiceControl.js` | **B 段接线**：carConfig 词表、接 `store.voice` + `toast`、暴露 `window.__carDisplayVoiceInject` | `config/carConfig.js`、`state/useCarStore.js` |
| `voice/VoiceButton.jsx` | **纯展示组件**（props 驱动，不读 store）：录音波纹、实时字幕、状态文案、中文降级提示、播报开关 | React、`voice.css` |
| `voice/VoiceControl.jsx` | **容器组件**（T8 挂载的就是它）：把 `useVoiceControl()` 摊给 `VoiceButton` | 上述两者 |
| `voice/voice.css` | 独立样式，类名一律 `cd-voice-` 前缀 | — |
| `voice/voice.sandbox.html` + `voice/sandbox.jsx` | 独立自测页，双模式（假 store / 真 store） | 上述全部 |

**计划（ActionPlan）形状**（`parseCommand` 的输出，`executePlan` 的输入）：

```js
{ type: 'part',   id: 'window_lf', open: true }      // 部件
{ type: 'group',  id: 'windows',   open: true }      // 组（PART_GROUPS.id）
{ type: 'light',  id: 'headlight', on: true }        // 灯光
{ type: 'camera', view: 'profile' }                  // 视角预设（CAMERA_VIEWS.id）
{ type: 'camera', command: 'orbit-once' }            // 「转一下」环绕一周
```
无法执行时返回**空数组 `[]`**（绝不猜测执行），配套中文提示见 `REASON_HINTS`。

---

## 2. 给 T8 的挂载步骤

```jsx
import { VoiceControl } from "./voice/VoiceControl.jsx";

// 桌面侧栏
<VoiceControl />
// 手机底栏
<VoiceControl compact />
```

- **props**：`compact`（紧凑模式）、`className`（追加类名，布局用）。
  `onReady(controller)` / `onLog(text)` 是测试/调试用钩子（沙盒在用），生产挂载不需要传。
- 样式随组件自动引入（`VoiceButton.jsx` 内 `import "./voice.css"`），**无需在 `style.css` 里额外 @import**。
- **挂载位置**：T4 已为 VoiceButton 预留容器位；桌面侧栏 / 手机底栏由 T8 决定。
- T6 **不改** `App.jsx` / `main.jsx`（§12.2），挂载归 T8。
- **主题对齐**：配色集中在 `.cd-voice { --cd-voice-accent: …; }` 等自定义属性上，T8 收口主题时只需在 T4 的 token 层覆盖这些变量，**不必改 `voice.css`**。

**与 T4 的容器位**：T4 若预留的是一个纯容器（不含逻辑），直接放 `<VoiceControl/>` 即可；
T4 若已放了占位按钮，请删掉占位，避免出现两个麦克风入口。

---

## 3. 沙盒自测页

```bash
cd app && npm run dev
# 端口以 Vite 日志为准（5173 常被其他并行会话占用，会自动顺延）
# → http://localhost:<port>/src/voice/voice.sandbox.html
```

- 无需改 `vite.config.js`：Vite dev server 直接服务 `src/` 下的 HTML。
- **两种模式**（同一套 DOM 结构，同一套断言在两种模式下都跑）：
  - **假 store（契约无关）**：页面自建假 store 承接 `executePlan`，验证「解析 → 计划 → 动作」映射本身；
  - **真 store（VoiceControl）**：挂载**真正的 `<VoiceControl/>`**，走 `useVoiceControl` → carConfig 词表 → 真 store + 真 toast。
- 页面能力：能力探测展示、手动输入指令（无麦克风环境的主力自测手段）、mock 注入回放、两条降级路径强制演示、108 条用例一键跑（**默认词表与 carConfig 词表各跑一遍**）、真 store 状态与 `store.voice`/`toast` 镜像、事件日志。
- **不在 `npm run build` 产物内**。如需打进 `dist`（例如给手机真机用），由 **T8 或 T10a** 在 `vite.config.js` 加一行（T6 无权改该文件，§12.2）：

```js
// vite.config.js → build.rollupOptions.input
input: { main: 'index.html', voiceSandbox: 'src/voice/voice.sandbox.html' },
```
> 已验证可行：把该页加入构建输入后打包成功（`voiceSandbox` chunk 含 `voiceController`/`useVoiceControl`/`VoiceControl`）。

---

## 4. 给 T9 的 mock 契约（`scripts/verify-voice.mjs` / `scripts/mocks/speech-recognition-mock.js`）

§13.3 ④ 的注入点由 T6 提供，**接口已冻结**：

```js
window.__carDisplayVoiceInject(MockCtor);  // 注入：voice.supported 立即变 true，走完整链路
window.__carDisplayVoiceInject(null);      // 恢复真实 SpeechRecognition
```

- **模块被引入即生效**，不依赖 `<VoiceControl/>` 是否挂载；已挂载的组件会立刻刷新为可用态。
- 注入后**不受安全上下文限制**——即使 T9 在 headless 的 `http://` 下跑脚本，也不会落到降级分支。
- 注入时若正在聆听，T6 会用新实现重新开始会话。

`MockCtor` 需要满足的全部要求（T6 的封装会这样使用它）：

```js
class MockSpeechRecognition {
  // 1. 必须能 new（无参构造）。若写成箭头函数，T6 会退化为直接调用，但请优先用 class。
  // 2. start() 之前，T6 会写入这 4 个属性（请容忍被赋值，值可用于断言）：
  //      lang = 'zh-CN' | continuous = true | interimResults = true | maxAlternatives = 3
  // 3. 必须实现三个方法：
  start() {}   // 内部必须触发 this.onstart()
  stop() {}    // 内部必须触发 this.onend()
  abort() {}   // 内部必须触发 this.onend()
  // 4. 需要触发的事件（由 mock 自己调用，T6 只负责挂上这些 handler）：
  //      this.onstart()
  //      this.onresult({ resultIndex: 0, results })
  //      this.onerror({ error: 'no-speech' })
  //      this.onend()
  // 5. results 形状（与浏览器一致）：类数组，元素是候选数组，元素上带 isFinal
  //      const results = [ [{ transcript: '打开车窗', confidence: 0.9 }] ];
  //      results[0].isFinal = true;
}
```

**回放要点**：
- 一次 `onresult` 可带多条候选（`maxAlternatives: 3`）→ T6 会**逐条尝试解析，取第一条能出计划的**，因此可以让第 1 条故意是误识别（如「打开车床」），验证择优救回。
- 拿到定稿后会短暂进入 `processing` 态，随后自动回到 `listening`；`continuous: true` 时不要在定稿后自动 `onend()`，否则会触发 T6 的重启逻辑（400ms 退避，上限 3 次）。
- 若要测重试：`this.onerror({error:'no-speech'})` 后**再**调用 `this.onend()`（浏览器就是这个顺序）。
- **注意**：T6 早期版本在注入时误调了 `recognizer.destroy()`，症状是「注入后状态卡在 requesting、识别事件一条都收不到」。若你看到该症状请先确认分支版本。

**可直接复用的用例集**（只读 import，不必重写）：

```js
import { COMMAND_CASES, SPEC_CASES, runCommandCases } from "../../app/src/voice/commandCases.js";
runCommandCases();                                  // 默认词表 → { total, passed, failed, results }
runCommandCases({ vocabulary: VOICE_VOCABULARY });  // carConfig 词表（B 段实际使用）
```
`SPEC_CASES` 是 §6 原文指令，DoD 逐条核对用它。

---

## 5. 与 store 的接口（已接线，§13.2）

`executePlan(plan, api)` 只要求 `api` 具备下列同名函数；`useVoiceControl` 已把 `VOICE_STORE_ACTIONS` 接上 `carStore`：

| api 成员 | 对应 §13.2 action |
| --- | --- |
| `setPart(id, open)` | `setPart` |
| `openGroup(groupId)` / `closeGroup(groupId)` | `openGroup` / `closeGroup` |
| `setLight(id, on)` | `setLight` |
| `setCameraView(viewId)` | `setCameraView` |
| `orbitOnce()` | `orbitOnce` |
| `bumpInteraction()` | `bumpInteraction`（**每条指令调用一次**，§13.2 要求输入层负责） |

**写入 `store.voice` 的字段**（T9 可直接断言）：

| 字段 | T6 写入规则 |
| --- | --- |
| `status` | 由识别器状态映射：`idle/requesting/listening/processing/error/unsupported` |
| `transcript` | 最近一次识别的文本（含未定稿的实时字幕） |
| `lastCommand` | **最近一条成功执行的指令原文**；识别失败时**不改写**（保持上一条），初值 `null` |
| `supported` | 能力探测结果；`__carDisplayVoiceInject(ctor)` 后立即变 `true`，传 `null` 后按真实环境重算 |

**toast**：每条识别结果处理完（`resultSeq` 自增）推送一条 —— 执行成功 `pushToast('已执行：<回执>', 'success')`；
识别失败 `pushToast('<中文纠错提示>', 'warn')`。手动/按钮通道不受影响。

**注意**：`executePlan` 会调 `bumpInteraction()`，因此语音指令会重置 T7 的待机自转计时（符合 §13.2）。

---

## 6. 降级行为矩阵（T8 移动端与 T10b 部署请对照）

| 环境 | `detectSupport().code` | 表现 |
| --- | --- | --- |
| Chrome/Edge + https 或 localhost | `ok` | 正常语音控车 |
| Chrome/Edge + http（含局域网 IP） | `insecure-context` | 麦克风按钮禁用 + 中文提示「需要 https 或 localhost」 |
| Firefox | `unsupported` | 禁用 + 「请用 Chrome 或 Edge 打开」 |
| Safari | `unsupported` | 禁用 + 「Safari 支持不完整，请用 Chrome 或 Edge」 |
| 权限被拒绝 | `not-allowed` | 停止重试 + 「请在站点设置里允许麦克风」 |
| 无麦克风设备 | `audio-capture` | 可重试 + 「没有检测到可用的麦克风」 |
| 网络异常 | `network` | 自动重试（400ms 起退避，上限 3 次） |
| 连续中断超限 | `restart-exhausted` | 停止 + 「连续中断 N 次，请点击麦克风重新开始」 |
| 注入了 mock | `injected` | 强制 `supported: true`，走完整链路 |

**指令识别失败时一律「不动作 + 中文提示」**，绝不猜测执行。含两类：
- 缺动词/缺部位/未识别（如「打开」「车窗」「今天天气不错」）；
- **本车模没有的功能**（如「打开天窗」「打开氛围灯」「锁上车门锁」）——这类词含「窗」「灯」「车门」，
  若不拦截会误开全部车窗/大灯/车门，故显式拒绝并提示「本车模没有这个部件或功能」。

---

## 7. 自测命令

```bash
cd app
node src/voice/commandCases.js          # parseCommand 用例：108/108（纯 Node，无需浏览器）
npm run build                           # DoD：构建通过
npm run dev                             # 沙盒页：http://localhost:<port>/src/voice/voice.sandbox.html
```

T6 的 headless 自测脚本（Edge + CDP，零依赖）位于 `app/tmp/`，**被 .gitignore 忽略、不进仓库**：

| 脚本 | 作用 |
| --- | --- |
| `tmp/t6-sandbox.test.mjs` | 沙盒页双模式全链路（76 项断言） |
| `tmp/t6-recognition.test.mjs` | `recognition.js` 状态机/注入/重试/权限（22 项断言，纯 Node + 假 window） |
| `tmp/t6-main-smoke.mjs` | 合并后主应用冒烟（canvas + §13.3 钩子 + store 契约字段） |
| `tmp/t6-cdp.mjs` | 共用 CDP 工具（随机调试端口，避免与其他 Agent 撞车） |

如需复用请向 T6 索取（这些脚本刻意不入库，避免与 T9 的 `scripts/verify-*.mjs` 冲突）。
