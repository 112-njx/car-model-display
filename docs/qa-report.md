# 双端验收报告（qa-report.md）

> 项目：3D 仿真车模 Demo　|　规划依据：`docs/roadmap.md` §11.1 T9、§12.3 Wave 2
> 归属：T9（验证 Agent）独占　|　验收依据：`docs/qa-checklist.md`
> **本文件是 Wave 2 的滚动记录**：每跑完一轮追加一节，不覆盖历史，便于追溯「哪个版本绿过、哪个版本引入过什么」。

- 验收人：项目负责人（真机与视觉项）　|　执行 Agent：T9
- 浏览器：Edge `153.0.4234.48`（`--headless=new`）+ CDP `127.0.0.1:9222`，视口 1440×900
- 被测实例：`http://127.0.0.1:5191/`（T8 集成实例）。**每次跑前均以 `curl` 核 `/src/config/carConfig.js` 返回 `text/javascript`** 确证实例身份（端口分配表见 `qa-checklist.md` §1.0）

---

## 轮次索引

| 轮次 | 日期 | 被测版本 | 范围 | 结论 |
| --- | --- | --- | --- | --- |
| **R0** | 2026-09-22 | `contract-v1` @ `6bcb863` | 契约基座：四脚本**首次真跑**（Wave 1 遗留风险闭合） | 四脚本全部可跑；契约层绿；集成层按设计 SKIP |
| **R1** | 2026-09-22 | `wave2/integration` @ **`7aead33`**（代码冻结） | 集成分支滚动验收（四脚本 `--strict`） | **3/4 全绿**；`verify-camera` 1 项 FAIL（P1，待修） |

> **R0 不是 S3 验收轮**（跑在契约基座而非集成分支），其价值是闭合「四脚本从未执行过」这一未知风险。
> **R1 是首个在集成分支上、代码冻结状态下取得的可信轮次。**

---

## 1. 自动化脚本结果

### R1 · 集成分支（`wave2/integration` @ `7aead33`，代码冻结）

| 脚本 | 命令（均加 `--strict`） | 退出码 | PASS | FAIL | SKIP | KNOWN | 用时 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| verify-parts | `node scripts/verify-parts.mjs --base-url=http://127.0.0.1:5191/ --strict` | **0** | 79 | 0 | 0 | 0 | 42–43s |
| verify-pick | `node scripts/verify-pick.mjs --base-url=http://127.0.0.1:5191/ --strict` | **0** | 38 | 0 | 0 | 0 | 65s（连跑 3 次均绿） |
| verify-voice | `node scripts/verify-voice.mjs --base-url=http://127.0.0.1:5191/ --strict` | **0** | 100 | 0 | 0 | 0 | 67s |
| verify-camera | `node scripts/verify-camera.mjs --base-url=http://127.0.0.1:5191/ --strict` | **1** | 34 | **1** | 0 | 0 | 42s |

**SKIP = 0 已达成**（Wave 2 验收要求）。四个脚本的 JSON 证据在 `docs/qa-artifacts/`。

**覆盖要点（R1 实测）**

- `verify-parts`：10 部件逐一开关 → `audit.open` 终态、**真实动画进度曲线**（`采样 [0, 0.304, 0.505, …, 0.992]`）、store↔audit 一致、过渡期 `progress` 恒在 `[0,1]`；2 个灯光；3 个分组；`closeAll`；未知 id 不写入状态且不改 audit 语义终态。
- `verify-pick`：`hitTargets` 结构合法性（12 项，id 全来自 §13.1）；**10 个部件鼠标点击开合翻转 + 再点翻回**；2 个灯光点击；**拖拽 60px 不触发点击**（且证明确实转动了相机，非事件被吞）；**长按 600ms 不触发**；**触摸点按开合**；触摸拖拽不触发；点击后 `bumpInteraction` 推进 + 中文 toast。
- `verify-voice`：注入 mock → `voice.supported=true`；经 T8 的 `__carDisplayVoiceStart()`（CHANGELOG 0010 方案①）驱动；**§6 指令集 18 条 + 别名/范围词全覆盖**，逐条**全量状态比对**（能抓过度触发）；`cameraCommand.token` 自增；错误路径（权限拒绝）反映到 `voice` 片；传 `null` 恢复真实实现。
- `verify-camera`：4 个预设 `view` 跟随；`orbit-once` token 自增可重复触发；**环绕一周回正**；**待机自转与交互即停**；拖拽旋转。

### R0 · 契约基座（`contract-v1` @ `6bcb863`）

| 脚本 | 退出码 | PASS | FAIL | SKIP | 说明 |
| --- | --- | --- | --- | --- | --- |
| verify-parts | 0 | 77 | 0 | 1 | SKIP＝集成层（T5 未集成） |
| verify-pick | 0 | 0 | 0 | 1 | 整体 SKIP（T5 未集成） |
| verify-voice | 0 | 0 | 0 | 1 | 整体 SKIP（T6 未集成） |
| verify-camera | 0 | 19 | 0 | 1 | SKIP＝集成层（T7 未集成） |

---

## 2. 人工验收结果

> **状态：未执行。** A/B/C 三组的逐项结果待集成收口、P1 清零后由项目负责人执行、T9 记录。
> **T9 不会替任何人勾选，也不会把未执行项标成通过。**

### 2.1 A 组 · 桌面 Chrome / Edge（A1–A21）

| # | 检查项 | 结果 | 备注 |
| --- | --- | --- | --- |
| A1–A20 | 见 `qa-checklist.md` §3.1 | **待执行** | 待 P1 清零后执行 |
| **A14** | 交互即停 | **已知不满足（语音/程序化路径）** | 见 issue #3；真实指针路径正常，语音路径实测不停 |
| **A21** | 性能 | **待执行** | 需真机/桌面实测帧率 |

### 2.2 B 组 · 手机 Chrome 真机（B1–B13）

| # | 检查项 | 结果 | 备注 |
| --- | --- | --- | --- |
| B1–B10、B12、B13 | 见 `qa-checklist.md` §3.2 | **待执行（需真机 + 约定时间窗）** | AI 无法代做 |
| **B11** | **真机语音** | **阻塞（待 https）** | Web Speech API 要求安全上下文；局域网 `http://<IP>` 下手机 Chrome 拒绝麦克风授权。须等 T10b 的 https URL。**在此之前一律标阻塞，不得标通过** |

### 2.3 C 组 · 降级路径（C1–C2）

| # | 检查项 | 结果 | 备注 |
| --- | --- | --- | --- |
| C1–C2 | 见 `qa-checklist.md` §3.3 | **待执行** | 需 Firefox/Safari 与禁用 WebGL 环境 |

---

## 3. 环境与已知偏差

- 本机 Node `v24.13.1` / npm `11.8.0`（项目声明 22.x，经负责人确认按 24 继续）
- 端口分配（经负责人裁定）：**T9 验收实例 5190 / T8 集成实例 5191** / 5173 归 T1 手机联调 / 5174+5181 禁用。详见 `qa-checklist.md` §1.0
- **实例身份判据**：`curl` 核 `/src/config/carConfig.js` 返回 `text/javascript`。**`index.html` 的字节数不可作判据**（本工程自己的也是 2888–2941 B，与 Vite 兜底页同长）

### 3.1 已关闭的既有偏差

| # | 偏差 | 处置 |
| --- | --- | --- |
| D1 | 无头 Edge 下 `three/webgpu` 渲染期间歇抛 `TypeError: Invalid value used as weak map key`（0–12 条/4s） | **已关闭**。T8 于集成分支 `8d20840` **去掉 WebGPU 优先分支、强制 WebGL**（未捕获异常 514→0；`StudioCanvas.jsx` 现只 import `WebGLRenderer`）。R1 轮四个脚本 KNOWN 均为 0。**`KNOWN_DEVIATIONS` 登记条目已按 `revokeWhen` 删除，恢复最严口径** —— 该异常若日后重现，断言必须重新 FAIL |
| D2 | WebGPU `powerPreference` 提示 | 随 D1 一并消失 |
| D3 | npm 传递依赖漏洞（`nanoid` high / `postcss` moderate） | 既有偏差（T1 记录 02 登记），未修以遵守 §12.1 依赖冻结 |

### 3.2 方法论留档（避免重蹈）

1. **判定「画面是否渲染」必须用 `Page.captureScreenshot`（合成器输出），不能用 `ctx.drawImage` 拷 WebGPU 画布** —— 后者对 WebGPU 画布拷不出内容，会得到**全黑**假象。R0 期间我据此一度准备上报「WebGPU 黑屏 P0」，被合成器截图证伪。
2. **必须裁出 3D 画布区域再统计像素** —— 整页截图含 DOM UI，其像素会冒充「有画面」。
3. **点击 DOM 元素前必须确证点击能落在它上面**：`getBoundingClientRect()` 取到的中心可能**在视口之外**（实测「复位」按钮在 `y=1005`、视口高仅 900），此时 `Input.dispatchMouseEvent` 派发的点击**根本不会命中元素**。R1 期间我因此上报过一个**测试无效的 P1**（详见 §4 issue #2 的更正）。已固化为 `scripts/lib/cdp.mjs` 的 `clickElement()`：`scrollIntoView` + `elementFromPoint` 双重回验，任一不满足即拒绝派发。
4. **判「功能是否就绪」必须等场景停稳**：`setCameraView()` 是平滑阻尼、`closeAll()`/开合是约 4s 动画；不等停稳就读 `hitTargets[].screen` 会读到**运动中的快照**（实测开窗后 900ms 读到 (706,380)，停稳后是 (879,411)，差 174px）。已固化为 `waitForSceneSettled()`。
5. **必须检测页面中途重载**：被测代码在被编辑时 Vite HMR 会整页刷新，清空注入的 mock 与 store 状态，使断言失去意义（实测同一脚本三次运行失败集合各不相同）。已固化为 `checkNoReload()`，命中即提示「本轮结果不可信」，**不把重载污染当作功能失败**。

---

## 4. Issue 清单

> 级别口径：**P0** = 核心功能不可用或崩溃；**P1** = 功能可用但明显不符需求/明显影响体验；**P2** = 打磨项，可延后。
> 出口（roadmap S3）：**P0 / P1 必须清零**，四个脚本全绿（`--strict`、SKIP=0），A/B/C 三组逐项有结论。

| # | 级别 | 现象 | 复现步骤 | 期望 / 实得 | 归属 | 状态 | 回归结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | P2 | 无头 Edge 下 `three/webgpu` 渲染期间歇抛 `TypeError: Invalid value used as weak map key`，污染控制台（违反 A20） | 打开被测页 → 静置数秒 → 观测 `Runtime.exceptionThrown` | 期望无未捕获异常 / 实得 0–12 条/4s。画面与功能实测零影响 | 基线 / T8 | **已修复**（T8 `8d20840` 强制 WebGL） | ✅ R1 四脚本 KNOWN 均 0；登记条目已按 `revokeWhen` 删除 |
| 2 | P1 | **拖走相机后点「复位」无反应** | 真实拖拽转动相机 → 真实点击「复位」按钮 | 期望相机平滑回到 hero 预设 / 实得相机不动 | T8（CHANGELOG 0011，Wave 2 起 T2 的 owner 由 T8 承担） | **已修复**（T8 受理 0011 → 0019，新增 `applyCameraView(viewId)` 带令牌，`ControlPanel` 与语音通道均改调它） | ✅ **回归通过**：滚动按钮入视口并 `elementFromPoint` 确证命中后，真实拖拽 + 真实点击「复位」→ 相机回到 `[6.8, 3.1, 7.6]`（位移 11.463） |
| 3 | **P1** | **待机自转的「交互即停」不满足语音与程序化路径** | ① 静置约 10s 待自转启动 → ② 经 mock 说「打开车窗」 | 期望（A14 / §11.1 T7「任意指针/按键/**指令**即停并重置计时」）：指令执行且**自转立即停止** / 实得：4 个车窗正确打开，但 `cameraAudit.autoRotating` **true → true**（自转继续） | **T8**（相机/自转集成期） | **待修** | 另实测：每 2s 调一次 `store.bumpInteraction()` 持续 16s，自转**仍在约 10s 后启动**（`[false×4, true×4]`）⇒ §13.2 冻结的 `lastInteractionAt` 与自转计时**完全解耦**。真实指针路径（canvas 点击/拖拽、面板按钮真实点击）**均能正常停转** ✅ |

**P0 / P1 计数：0 / 1**（issue #3 未关闭）。

### 4.1 issue #3 的根因与修复建议

**根因**：T7 的 `IdleAutoRotate` 维护**自己的内部 `lastInteractionAtRef`**，只由真实 DOM 指针事件触发的 `notifyInteraction()` 更新；它**不消费 §13.2 冻结的 `store.lastInteractionAt`**。因此凡是**不经指针事件**的交互（语音指令、以及 `bumpInteraction()` 本身）都无法停止/重置自转。

**建议修法**：让 `IdleAutoRotate` 订阅 `store.lastInteractionAt`，任何变化即视为一次交互（停转 + 重置计时）；`notifyInteraction()` 保留用于「指针正在拖拽」的守卫。这样语音、面板按钮、程序化三条通道一并满足 A14，且与 §13.2 的字段语义一致。

### 4.2 更正记录（我自己的一次误报）

issue #2 我最初上报时称「已**端到端确证**」。**该结论的测试是无效的**：我取「复位」按钮 `getBoundingClientRect()` 中心得 `y=1005`，而视口高度仅 900 —— `Input.dispatchMouseEvent` 在视口外派发，**点击根本没落在按钮上**，我却把「相机没动」当成了按钮无反应。
**缺陷本身是真的**（T7 在 CHANGELOG 0011 里以自己的证据记录了同一现象，T8 也已受理修复），但**我提供的"证明"不成立**。已按 §3.2 第 3 条固化为 `clickElement()`，并在本轮用有效测试完成了回归确认。

---

## 5. 回归记录

| 轮次 | 日期 | 版本 commit | 修复的 issue | 回归方式 | 结论 |
| --- | --- | --- | --- | --- | --- |
| R0 | 2026-09-22 | `contract-v1` @ `6bcb863` | —（首轮） | 四脚本首跑 + 三次对照实验（探针 `app/.vite/t9-probe.mjs`，不随分支交付） | 四脚本全部可跑通；契约层绿；无脚本自身缺陷 |
| R1 | 2026-09-22 | `wave2/integration` @ `7aead33` | #1（WebGPU）、#2（复位） | `verify-parts` 79/0/0；`verify-pick` 38/0/0（连跑 3 次）；`verify-voice` 100/0/0；`verify-camera` 34/1/0；另以 `clickElement()` 有效测试回归 #2 | #1、#2 **回归通过**；#3 新开（P1，待修） |

**R1 期间修掉的脚本自身缺陷（5 处，均为「契约基座看不出、一集成即暴露」类型）**

| # | 缺陷 | 后果 | 修法 |
| --- | --- | --- | --- |
| 1 | `session.waitFor` 不转发 `...args` | 轮询表达式每轮立刻抛错，收敛等待形同虚设 ⇒ **11 处「progress 未收敛」假 FAIL** | `waitFor` 增加 `...args` 并透传给 `evaluate` |
| 2 | `waitForIntegrationSignals` 默认「等任意信号」 | `cameraRig/perf/voice` 模块加载即真、`pick/partGeometry` 要等 22MB GLB ⇒ **假 SKIP**（实测 `hitTargets=12` 却被判「T5 未集成」） | `require: [信号名]` 改为**必填** |
| 3 | `resetToBaseline` 不等场景停稳（只等 120ms） | 读到运动中的坐标快照 | 新增 `waitForSceneSettled()`（相机 + 全部部件 `progress`），`resetToBaseline` 内置 |
| 4 | 点击后只 `delay(900ms)` 就读坐标 | 开窗动画约 4s，读到滑动中快照（差 174px）⇒ 假失败 | 改为 `waitForSceneSettled()` |
| 5 | `verify-voice` 的 `sameMap` 要求键数相等，而期望只列子集 | **断言 FAIL 但 diff 显示"状态一致"**的自相矛盾 | 期望 map **补全为全量**（未列出者视为关闭），保留防过度触发的严格性 |

> 另修：`verify-voice` 的重复 `start()` 抛 `InvalidStateError` 打断脚本；`verify-pick` 的「再次点击翻回」断言**空洞通过**（部件从未打开也满足）。

---

## 6. S3 放行结论

**当前：未达到 S3，不放行 Wave 3。**

| S3 条件 | 状态 | 缺口 |
| --- | --- | --- |
| 四个自动化脚本全绿（`--strict`、SKIP=0） | **未达成** | SKIP=0 已达成；`verify-camera` 1 项 FAIL（issue #3，P1） |
| 双端验收清单逐项通过 | **未达成** | A/B/C 三组尚未执行（B 组需真机 + 时间窗；B11 另需 T10b 的 https URL） |
| P0 / P1 全部关闭并回归通过 | **未达成** | **P1 尚有 1 项未关**（issue #3） |

**下一步**：issue #3 回流 T8 → 修复后回归 `verify-camera`（预期 35/0/0）→ 四脚本全绿 → 组织 A/B/C 三组人工验收 → 更新本报告并给出 S3 结论。
