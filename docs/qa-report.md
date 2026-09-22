# 双端验收报告（qa-report.md）

> 项目：3D 仿真车模 Demo　|　规划依据：`docs/roadmap.md` §11.1 T9、§12.3 Wave 2
> 归属：T9（验证 Agent）独占　|　验收依据：`docs/qa-checklist.md`
> **本文件是 Wave 2 的滚动记录**：每跑完一轮（T8 每合并一条分支 / 集成收口 / 回归）追加一节，
> 不覆盖历史，便于追溯「哪个版本绿过、哪个版本引入过什么」。

- 验收人：项目负责人（真机与视觉项）　|　执行 Agent：T9
- 被测形态：dev（T9 验收实例 `http://127.0.0.1:5190/`，端口分配见 `qa-checklist.md` §1.0）
- 浏览器：Edge `153.0.4234.48`（`--headless=new`）+ CDP `127.0.0.1:9222`

---

## 轮次索引

| 轮次 | 日期 | 被测版本 | 范围 | 结论 |
| --- | --- | --- | --- | --- |
| **R0** | 2026-09-22 | `contract-v1` @ `6bcb863` | 契约基座：四脚本首次真跑（Wave 1 遗留风险闭合） | 四脚本**全部可跑**；契约层断言绿；集成层按设计 SKIP |

> **R0 不是 S3 验收轮**。它跑在契约基座（`contract-v1`）上，而不是 T8 的集成分支上 ——
> 目的是先把 Wave 1 从未执行过的四个脚本真跑一遍，暴露「只有真跑才出现的缺陷」。
> 结论：**未发现脚本自身缺陷**（无崩溃、无时序/序列化问题）。

---

## 1. 自动化脚本结果

### R0 · 契约基座（`contract-v1` @ `6bcb863`）

| 脚本 | 命令 | 退出码 | PASS | FAIL | SKIP | KNOWN | 用时 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| verify-parts | `node scripts/verify-parts.mjs --base-url=http://127.0.0.1:5190/` | 0 | 77 | 0 | 1 | 0–1 | 3.5–4.3s |
| verify-pick | `node scripts/verify-pick.mjs --base-url=http://127.0.0.1:5190/` | 0 | 0 | 0 | 1 | 0 | 45.6s |
| verify-voice | `node scripts/verify-voice.mjs --base-url=http://127.0.0.1:5190/` | 0 | 0 | 0 | 1 | 0 | 45.7s |
| verify-camera | `node scripts/verify-camera.mjs --base-url=http://127.0.0.1:5190/ --fast` | 0 | 19 | 0 | 1 | 0 | 46.6s |

> 退出码均为 **0**（未加 `--strict`）。**Wave 2 验收轮必须加 `--strict`（SKIP 计入失败、要求 SKIP=0）**，
> 故本轮的 SKIP 在验收口径下会判失败 —— 这是**设计意图**：SKIP 全部来自「功能分支尚未合并」，
> 集成收口后必须清零。R0 不加 `--strict` 是为了区分「脚本能不能跑」与「功能齐不齐」这两件事。

**SKIP 明细（全部为设计预期，非缺陷）**

| 脚本 | SKIP 项 | 原因 |
| --- | --- | --- |
| verify-parts | 集成层：过渡期采到真实动画进度（0<progress<1） | T5 未集成（`parts[].bbox` 全为 null，未注册 parts 审计源）；契约层 `progress` 缺省为 `open?1:0` |
| verify-pick | 全部用例 | T5 未集成：`hitTargets` 为空数组（§13.3 规定未注册时为 `[]`） |
| verify-voice | 全部用例 | T6 未集成：`window.__carDisplayVoiceInject` 不存在（T2 刻意未提供 stub，以免把「stub 存在」误判为「注入成功」） |
| verify-camera | 集成层：预设机位移动 / 环绕一周回正 / 待机自转与交互即停 | T7 未集成：`cameraAudit.position` 为 `null`（未注册相机审计源） |

**契约层已跑绿的断言（R0 实测）**

- `verify-parts`：3 个钩子存在；`parts` 10 项 / `lights` 2 项且**顺序与 §13.1 一致**；每项字段与类型正确；`cameraView`/`autoRotate`/`hitTargets`/`perf` 缺省值符合 §13.3；10 个部件逐一 开关 → `audit.open` 终态、`progress` 终值、store↔audit 一致、过渡期 `progress` 恒在 `[0,1]`；2 个灯光开关与 store 一致；`openGroup` 三个分组；`closeAll` 复位；未知 id 不写入状态且不改 audit 终态。
- `verify-camera`：4 个预设 `setCameraView` 后 `cameraAudit.view` 与 `sceneAudit.cameraView` 均跟随 store；`orbitOnce()` 产生 `cameraCommand.type='orbit-once'` 且 `token` 自增、**可重复触发**；`setAutoRotate` 与 `sceneAudit.autoRotate` 一致。

---

## 2. 人工验收结果

> **状态：未执行。** A/B/C 三组的逐项结果在 Wave 2 集成收口后由项目负责人执行、T9 记录。
> **T9 不会替任何人勾选，也不会把未执行项标成通过。**

### 2.1 A 组 · 桌面 Chrome / Edge（A1–A21）

| # | 检查项 | 结果 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| A1–A21 | 见 `qa-checklist.md` §3.1 | **待执行** | — | 需 T8 集成收口后执行 |

### 2.2 B 组 · 手机 Chrome 真机（B1–B13）

| # | 检查项 | 结果 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| B1–B10、B12、B13 | 见 `qa-checklist.md` §3.2 | **待执行（需真机 + 约定时间窗）** | — | AI 无法代做 |
| **B11** | **真机语音** | **阻塞（待 https）** | — | Web Speech API 要求安全上下文；局域网 `http://<IP>` 下手机 Chrome 拒绝麦克风授权。须等 T10b 的 https 在线 URL。**在此之前一律标阻塞，不得标通过** |

### 2.3 C 组 · 降级路径（C1–C2）

| # | 检查项 | 结果 | 证据 | 备注 |
| --- | --- | --- | --- | --- |
| C1–C2 | 见 `qa-checklist.md` §3.3 | **待执行** | — | 需 Firefox/Safari 与禁用 WebGL 环境 |

---

## 3. 环境与已知偏差

- 本机 Node `v24.13.1` / npm `11.8.0`（项目声明 22.x，经负责人确认按 24 继续）
- 被测实例：T9 验收实例 `5190`（`--host 127.0.0.1 --strictPort`）；端口分配表见 `qa-checklist.md` §1.0
- 浏览器 / 调试端口 / 视口：Edge 153 headless / `9222` / 1440×900（手机视口用例用 `--mobile`）
- **实例身份判据**：`curl` 核对 `/src/config/carConfig.js` 返回 `text/javascript`。
  **`index.html` 的字节数不可作判据** —— 本工程自己的 `index.html` 也是 2888 B，与 Vite 兜底页同长。

### 3.1 已裁定不计入 issue 的既有偏差

| # | 偏差 | 归因 | 影响 | 裁定 |
| --- | --- | --- | --- | --- |
| D1 | 无头 Edge 下 `three/webgpu` 渲染期间歇抛 `TypeError: Invalid value used as weak map key`（`Textures.updateTexture → Bindings._init`），0–12 条/4s，抖动 | FormDrive **基线**代码：`StudioCanvas.jsx` 的 `createRenderer` 只对 `await renderer.init()` 加了 try/catch，**渲染期**异常捕不到。非 Wave 1 任何分支引入（T1 记录 04/05、`77dc507` 已登记） | **零**。三次对照实验证实：① 裸 WebGPU API 在同一浏览器渲染离屏纹理并读回成功（`firstPixelBGRA=[229,153,51,255]`，`uncapturedErrors=[]`）→ 浏览器 WebGPU 正常；② `Page.captureScreenshot` 裁 3D 画布区域 = 有画面（252 色 / stdDev 43.3）；③ 连拍 6 帧亮度均值**极差 0.00** → 画面稳定，无闪烁/缺件 | 项目负责人 2026-09-22 裁定：按「已知偏差」记录，**不计入全绿判据**（`docs/debug.md` 人工配置区 #10）。已登记于 `scripts/lib/cdp.mjs` 的 `KNOWN_DEVIATIONS`，脚本以 `[KNOWN]` **单独打印并计数、不并入 PASS**；匹配为**窄特征**（须同时含 `Invalid value used as weak map key` 与 `three_webgpu`），**未登记的异常仍判 FAIL**，回归不被遮蔽 |
| D2 | WebGPU `powerPreference` 提示 | FormDrive 基线 | 无 | 既有偏差（T1 记录 02 已登记） |
| D3 | npm 传递依赖漏洞（`nanoid` high / `postcss` moderate） | vite 传递依赖 | 无（demo，未修以遵守 §12.1 依赖冻结） | 既有偏差（T1 记录 02 已登记） |

> **D1 的撤销条件**：T8 让渲染期异常也能回退到 WebGL，或升级 three 之后，应删除 `KNOWN_DEVIATIONS`
> 中的对应条目，该断言恢复为 FAIL 口径。届时本节同步更新。

### 3.2 方法论留档（避免重蹈）

- **判定「画面是否渲染」必须用 `Page.captureScreenshot`（合成器输出），不能用 `ctx.drawImage` 拷 WebGPU 画布** ——
  后者对 WebGPU 画布拷不出内容，会得到**全黑**的假象。R0 期间我据此一度准备上报「WebGPU 黑屏 P0」，
  被合成器截图证伪。
- **必须裁出 3D 画布区域再统计像素** —— 整页截图里含 DOM UI（导航/面板/加载页），其像素会冒充「有画面」。
- **跑脚本前先确证实例身份**（`curl` 核 `carConfig.js` 的 content-type）。

---

## 4. Issue 清单

> 级别口径：**P0** = 核心功能不可用或崩溃；**P1** = 功能可用但明显不符需求/明显影响体验；
> **P2** = 打磨项，可延后。
> 出口（roadmap S3）：**P0 / P1 必须清零**，四个脚本全绿（`--strict`、SKIP=0），A/B/C 三组逐项有结论。

| # | 级别 | 现象 | 复现步骤 | 期望 / 实得 | 归属 | 状态 | 回归结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **P2** | 无头 Edge 下 `three/webgpu` 渲染期间歇抛 `TypeError: Invalid value used as weak map key`，污染控制台（违反人工项 A20） | 打开被测页 → 静置数秒 → 观测 `Runtime.exceptionThrown` | 期望无未捕获异常 / 实得 0–12 条/4s。**画面与功能实测零影响**（见 §3.1 D1） | 基线 / T8（§11.1 集成期小修权） | **已裁定按已知偏差放行**（不阻塞 S3） | 已登记 `KNOWN_DEVIATIONS`，脚本 `[KNOWN]` 单独计数；未登记异常仍 FAIL |
| — | — | （暂无其它 issue） | — | — | — | — | — |

**P0 / P1 计数：0 / 0。**

> **注意**：R0 只覆盖了契约基座，**尚未覆盖 T8 集成分支的功能**。集成收口后必然新增 issue，
> 本节随每轮滚动更新。

---

## 5. 回归记录

| 轮次 | 日期 | 版本 commit | 修复的 issue | 回归方式 | 结论 |
| --- | --- | --- | --- | --- | --- |
| R0 | 2026-09-22 | `contract-v1` @ `6bcb863` | —（首轮，无修复） | 四脚本首跑 + 三次对照实验（探针 `app/.vite/t9-probe.mjs`，不随分支交付） | 四脚本全部可跑通；契约层绿；集成层按设计 SKIP；无脚本自身缺陷 |

---

## 6. S3 放行结论

**当前：未达到 S3，不放行 Wave 3。**

未达成项：

| S3 条件 | 状态 | 缺口 |
| --- | --- | --- |
| 四个自动化脚本全绿（`--strict`、SKIP=0） | **未达成** | 集成层 SKIP 待 T5/T6/T7/T8p 合并后清零；需在 **T8 集成分支**上重跑 |
| 双端验收清单逐项通过 | **未达成** | A/B/C 三组尚未执行（A/C 待集成收口；B 需真机，B11 另需 https） |
| P0 / P1 全部关闭并回归通过 | 当前 0/0，但**样本仅为契约基座** | 集成后必然新增 issue，待滚动回流与回归 |

下一步：等 T8 的 `wave2/integration` 每合并一条分支，即按 `qa-checklist.md` §2 跑对应脚本并更新本报告。
