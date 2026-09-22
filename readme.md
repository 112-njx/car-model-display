# 3D 仿真车模 Demo（智能座舱 · 3D 车模控制台）

用 **Vibe Coding** 方式实现的新能源汽车中控大屏风格 3D 车模展示与交互 Demo。
手机与电脑**网页直接打开**，零安装。

---

## 原始需求（项目 brief）

用 Vibe Coding 方式实现一个 3D 仿真车模 demo。

- 要求：车模高还原（参考新能源汽车中控大屏的车模）、可拖动旋转、可点击控车（比如车窗）、可语音控车（比如车窗）。
- Demo 形式不限，可网页、安卓 app、小程序。
- 交付物：整个 Vibe Coding 过程的录制视频、可运行的 demo、以及任何觉得有价值的中间产物。
- 考核维度：AI 工具使用程度、AI 交互协同程度、AI 需求理解程度。

---

## 功能

| # | 功能 | 说明 |
| --- | --- | --- |
| 1 | 车模展示 | Tesla Model 3 2018（21.62 MiB GLB），深色中控科技感场景：反射地面、科技网格、环形光带、扫光 |
| 2 | 拖动旋转 | 鼠标拖拽 / 触摸拖拽 / 滚轮与双指缩放；四档视角预设（复位·正面·侧面·细节）；待机约 8 秒缓速自转，任意输入即停 |
| 3 | 点击控车 | 点按车模本体开合 10 个部件（4 门 4 窗、前/后备箱）+ 大灯/尾灯；悬停高亮 + 中文部件名提示 |
| 4 | 语音控车 | 中文指令：打开车窗 / 关闭左前门 / 打开大灯 / 看侧面 / 转一下 / 全部关闭 等 |
| 5 | 双端可用 | 桌面 Chrome/Edge 与手机 Chrome 打开同一 URL |

**三条通道共用一个状态源**：点击、语音、按钮 → 同一个 `useCarStore` → 同一套阻尼动画与 Toast 反馈。

## 快速开始

```bash
cd app
npm install
npm run dev            # 开发服务器（手机同局域网访问需 --host，见下）
```

手机联调：`npm run dev -- --host` 后访问 `http://<开发机IP>:<端口>/`。
**注意语音在局域网 http 下不可用**（Web Speech API 要求安全上下文），详见「已知限制」。

```bash
npm run build          # 产物在 app/dist/
npm run preview        # 本地静态预览产物
```

## 部署

| 方式 | 说明 |
| --- | --- |
| 任意静态托管 | 把 `app/dist/` 整个目录传上去即可。`vite.config.js` 的 `base` 已设为 `'./'`，**任意子路径都能工作**（含 GitHub Pages 的 `/<repo>/`） |
| Vercel | 已备 `vercel.json`，关联仓库后自动构建部署 |
| GitHub Pages | 已备 `.github/workflows/deploy-pages.yml`（**手动触发**：需先在 Settings → Pages 把 Source 设为 "GitHub Actions"） |

> **`file://` 双击打开 dist 不可用**：Chrome 对 `file://` 源以 CORS 策略拒绝加载 ES module 与 CSS。
> 这是浏览器安全策略，与构建配置无关；交付形态是"静态服务器托管"。

## 目录结构

```
car_display/
├── app/                          # 应用（由 FormDrive 裁剪而来，MIT）
│   ├── src/
│   │   ├── components/scene/     # 渲染器宿主、车模、环境、相机与自转
│   │   ├── components/ui/        # 中文中控面板、Toast、加载页、中文文案表
│   │   ├── config/carConfig.js   # 【契约】部件/灯光/相机/交互阈值/画质分级
│   │   ├── state/useCarStore.js  # 【契约】全局状态（单一状态源）
│   │   ├── devtools/auditHooks.js# 【契约】注册式审计钩子（自动化脚本的唯一依赖面）
│   │   ├── interaction/          # 3D 点击拾取（raycast）、手势判别、悬停高亮
│   │   ├── voice/                # 语音识别封装、中文指令解析、语音按钮与沙盒页
│   │   └── perf/                 # 设备档位判定、帧率采样与自动降档、WebGL 降级页
│   └── public/models/            # 车模 GLB 与许可（CC BY 4.0）
├── docs/                         # 规划、过程记录、契约文档、验收记录
│   ├── roadmap.md                # 项目规划（含 §13 契约规格）
│   ├── prompt.md                 # Prompt 与决策留痕
│   ├── debug.md                  # 每一轮编码的过程记录
│   ├── contracts/                # 契约文档与变更记录（只增不改）
│   ├── screenshots/              # 演示截图（readme / Release 用）
│   └── qa-checklist.md / qa-report.md  # 双端验收清单与报告
├── scripts/                      # 自动化验证脚本（verify-*.mjs）
└── THIRD-PARTY.md                # 第三方许可归属
```

## 文档索引

| 文档 | 用途 |
| --- | --- |
| `docs/roadmap.md` | 项目规划、任务拆解、多 Agent 波次方案、契约规格 |
| `docs/prompt.md` | 每轮 prompt 与决策留痕（体现 AI 交互协同过程） |
| `docs/debug.md` | 每一轮编码的目标、改动、关键决策、自测结果、遗留项；并维护「需要人工配置的地方」 |
| `docs/contracts/store-contract.md` | 数据/行为契约的落地细节 |
| `docs/contracts/CHANGELOG.md` | 契约变更记录（**只增不改**） |
| `docs/qa-checklist.md` / `docs/qa-report.md` | 双端验收清单与执行报告 |
| `docs/release-notes.md` | 发布说明与部署章节 |
| `THIRD-PARTY.md` | 第三方组件与资产许可归属 |

## 已知限制

1. **手机语音需 https**：Web Speech API 要求安全上下文。局域网 `http://<IP>` 下手机 Chrome 会拒绝麦克风，应用内显示中文降级提示。公网 https 部署后即可用。
2. **语音浏览器支持**：仅 Chrome / Edge；Firefox 与 Safari 显示"请用 Chrome 或 Edge"。
3. **弱机自动降档**：帧率持续偏低时自动降到低画质档，该档**关闭反射地面**（换取流畅度）。
4. **性能目标待真机复核**：桌面 ≥55fps / 手机 ≥30fps 需在正常桌面机与真机上复核。
5. **`file://` 打开 dist 不可用**（见「部署」）。

## 演示截图

<div align="center">
  <img src="https://github.com/112-njx/car-model-display/raw/main/docs/screenshots/demo-desktop.png" alt="桌面端" width="720" />
  <br />
  <sub>桌面端 · 3D 车模与右侧车辆控制面板</sub>
  <br /><br />
  <img src="https://github.com/112-njx/car-model-display/raw/main/docs/screenshots/demo-mobile.jpg" alt="手机端" width="280" />
  <br />
  <sub>手机端 · 竖屏自适应布局</sub>
</div>

## 许可

- 本项目自身代码：**MIT**（`LICENSE`）。
- 代码基线 **FormDrive**（Enes Kaymaz，@nesdesignco）：**MIT**（`app/LICENSE`）。
- 车模 **Tesla 2018 Model 3**（Ameer Studio / Sketchfab）：**CC BY 4.0**（`app/public/models/TESLA-LICENSE.md`）。

逐项归属见 **`THIRD-PARTY.md`**。
