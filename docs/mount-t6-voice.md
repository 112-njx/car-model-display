# T6 语音控车 · 挂载/接入说明

> 分支 `wave1/t6`　|　文件域：`app/src/voice/**`（T6 独占）　|　roadmap §11.1 T6、§13.3 ④
> 本文件是 T6 交付物 ③，面向 **T8（集成）** 与 **T9（验证）**。
> **A 段状态**：`voice/**` 已全部交付并自测通过（不含 store 接线）；B 段接线内容见 §3，推送后本节会补终稿。

---

## 1. 文件清单与职责

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `voice/commands.js` | 指令词表/别名表/同音纠错表；`buildVocabulary()`、`describeActions()`（中文回执）、`executePlan()`（计划→§13.2 action） | 无（纯数据 + 纯函数） |
| `voice/parseCommand.js` | `parseCommand()` / `parseCommandDetailed()` / `parseAlternatives()`，中文文本 → 动作计划（纯函数） | `commands.js` |
| `voice/commandCases.js` | 108 条用例 + `runCommandCases()`；文件底部有 Node CLI 入口 | `commands.js`、`parseCommand.js` |
| `voice/recognition.js` | `SpeechRecognition` 兼容封装：能力探测、权限、错误重试、安全上下文；`setRecognitionCtor()` 注入点底层 | 浏览器原生 API |
| `voice/synthesis.js` | `SpeechSynthesis` 播报封装（可选开关），不支持时静默降级 | 浏览器原生 API |
| `voice/VoiceButton.jsx` | **纯展示组件**（props 驱动，不读 store）：录音波纹、实时字幕、状态文案、中文降级提示、播报开关 | React、`voice.css` |
| `voice/voice.css` | 独立样式，类名一律 `cd-voice-` 前缀；颜色/圆角集中在 `.cd-voice` 自定义属性上，可被 T4 token 覆盖 | — |
| `voice/voice.sandbox.html` + `voice/sandbox.jsx` | 独立自测页（**不 import 主应用任何模块**），自带「假车状态」承接 `executePlan` | 上述全部 |
| `voice/useVoiceControl.js` | **B 段交付**：接 `store.voice` + toast、暴露 `window.__carDisplayVoiceInject` | `state/useCarStore.js` |

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

## 2. 沙盒自测页（现在就能用）

```bash
cd app && npm run dev
# 端口以 Vite 日志为准（5173 常被其他并行会话占用，会自动顺延）
# → http://localhost:<port>/src/voice/voice.sandbox.html
```

- 无需改 `vite.config.js`：Vite dev server 会直接服务 `src/` 下的 HTML。
- 页面能力：能力探测展示、真实麦克风链路、mock 注入回放、两条降级路径强制演示、手动输入指令（无麦克风环境的主力自测手段）、108 条用例一键跑、事件日志。
- **不在 `npm run build` 产物内**。如需把沙盒页打进 `dist`（例如给手机真机用），由 **T8 或 T10a** 在 `vite.config.js` 加一行（T6 无权改该文件，§12.2）：

```js
// vite.config.js → build.rollupOptions.input
input: { main: 'index.html', voiceSandbox: 'src/voice/voice.sandbox.html' },
```
> 已验证可行：用临时配置把该页加入构建输入，`voiceSandbox.js` 42 kB + `voiceSandbox.css` 5.8 kB 打包成功。

---

## 3. 给 T8 的挂载步骤

**A 段（当前）**：`voice/**` 不 import 任何主应用模块，**挂载与否都不影响主入口**，可以先合并。
若要在集成前单独点亮 UI，可临时用 props 驱动展示组件（自测用，不随分支交付）：

```jsx
import { VoiceButton } from "./voice/VoiceButton.jsx";
<VoiceButton status="listening" transcript="打开车窗" reply="打开全部车窗" onToggle={() => {}} />
```

**B 段（接线后）**：挂载容器组件（T6 在 B 段追加到 `VoiceButton.jsx`）：

```jsx
import { VoiceControl } from "./voice/VoiceControl.jsx"; // ← B 段确定最终路径后在此更正
<VoiceControl compact={/* 手机底栏传 true */} />
```
- 样式随组件自动引入（`VoiceButton.jsx` 内 `import "./voice.css"`），**无需在 `style.css` 里额外 @import**。
- 挂载位置：T4 已为 VoiceButton 预留容器位；桌面侧栏 / 手机底栏由 T8 决定。
- T6 **不改** `App.jsx` / `main.jsx`（§12.2），挂载归 T8。

**主题对齐**：`voice.css` 的配色集中在 `.cd-voice { --cd-voice-accent: …; }` 等自定义属性上。T8 收口主题时，只需在 T4 的 token 层覆盖这些变量，**不必改 `voice.css`**。

---

## 4. 给 T9 的 mock 契约（`scripts/verify-voice.mjs` / `scripts/mocks/speech-recognition-mock.js`）

§13.3 ④ 的注入点由 T6 提供，**接口已冻结**：

```js
window.__carDisplayVoiceInject(MockCtor);  // 注入：voice.supported 立即变 true，走完整链路
window.__carDisplayVoiceInject(null);      // 恢复真实 SpeechRecognition
```

注入后**不受安全上下文限制**——即使 T9 在 headless 的 `http://` 下跑脚本，也不会落到降级分支。

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
- 拿到定稿后会短暂进入 `processing` 态，随后由 T6 自动恢复；`continuous: true` 时不要在定稿后自动 `onend()`，否则会触发 T6 的重启逻辑（400ms 退避，上限 3 次）。
- 若要测重试：`this.onerror({error:'no-speech'})` 后**再**调用 `this.onend()`（浏览器就是这个顺序）。

**可直接复用的用例集**（只读 import，不必重写）：

```js
import { COMMAND_CASES, SPEC_CASES, runCommandCases } from "../../app/src/voice/commandCases.js";
runCommandCases(); // → { total, passed, failed, results }
```

---

## 5. 与 store 的接口（B 段接线用，§13.2）

`executePlan(plan, api)` 只要求 `api` 具备下列**同名函数**，B 段直接传 store 的 action 即可：

| api 成员 | 对应 §13.2 action |
| --- | --- |
| `setPart(id, open)` | `setPart` |
| `openGroup(groupId)` / `closeGroup(groupId)` | `openGroup` / `closeGroup` |
| `setLight(id, on)` | `setLight` |
| `setCameraView(viewId)` | `setCameraView` |
| `orbitOnce()` | `orbitOnce` |
| `bumpInteraction()` | `bumpInteraction`（**每条指令调用一次**） |

B 段还会写入 `store.voice` 的 `status / transcript / lastCommand / supported / error`（用 `setVoiceStatus` / `setTranscript` / `setLastCommand` / `setVoiceSupported` / `resetVoice`），并通过 `pushToast` 输出中文回执。

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

---

## 7. 自测命令（T6 侧，供 T9 参考）

```bash
cd app
node src/voice/commandCases.js          # parseCommand 用例：108/108
npm run build                           # DoD：构建通过
npm run dev                             # 沙盒页：http://localhost:<port>/src/voice/voice.sandbox.html
```
T6 的 headless 自测脚本（Edge + CDP，零依赖）位于 `app/tmp/`，**被 .gitignore 忽略、不进仓库**；如需复用可向 T6 索取。
