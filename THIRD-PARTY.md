# 第三方组件与资产许可归属（THIRD-PARTY）

> 交付物（roadmap §7 中间产物 ⑧）。本项目**分发的每一份第三方内容**都在此登记，
> 便于逐项追溯。仓库根 `LICENSE`（MIT）只覆盖本项目自身代码。
>
> 登记纪律：新增任何第三方代码/字体/模型/图片，都要在**同一提交**里补一行。

## 1. 应用源码

| 项 | 来源 | 许可 | 说明 |
| --- | --- | --- | --- |
| FormDrive（`formdrive-automotive-studio`） | Enes Kaymaz（@nesdesignco） | **MIT** | 本项目的**代码基线**。`app/` 由 FormDrive 源码裁剪而来，保留其 `app/LICENSE`（MIT，Copyright © 2026 Enes Kaymaz）与 `app/README.md`。修改处见 `docs/debug.md` 各轮记录。 |

## 2. 车模资产

| 项 | 来源 | 许可 | 说明 |
| --- | --- | --- | --- |
| Tesla 2018 Model 3（`app/public/models/tesla-model-3-2018.glb`，21.62 MiB） | Ameer Studio（Sketchfab） | **CC BY 4.0** | 署名与来源全文见 `app/public/models/TESLA-LICENSE.md`。**分发时必须保留该文件**。 |
| Tesla 预览图（`app/public/models/tesla-preview.jpg`） | 同上（同一下载包内） | **CC BY 4.0** | 与模型同源，署名同 `TESLA-LICENSE.md`。 |

> **已随裁剪移除的资产**（T1 单车型固化）：`mustang-2005.glb`、`car-concept.glb`、
> `mustang-preview.jpg`、`concept-preview.jpg`，以及对应的 `MUSTANG-LICENSE.md` /
> `CAR-CONCEPT-LICENSE.md`。CC BY 4.0 的署名义务随**被分发资产**产生；资产已不随仓库分发，
> 故其许可文件一并移除（详见 `docs/debug.md` T1 记录 03）。

## 3. 运行时依赖（npm）

以下均为 MIT 许可，随 `app/package-lock.json` 锁定版本。**本项目零新增依赖**（roadmap §12.1 依赖冻结）。

| 包 | 许可 | 用途 |
| --- | --- | --- |
| `react` / `react-dom` 19.x | MIT | UI 框架 |
| `@react-three/fiber` 9.x | MIT | React 渲染器（three.js 的 React 绑定） |
| `@react-three/drei` 10.x | MIT | R3F 辅助组件（`OrbitControls`、`MeshReflectorMaterial` 等） |
| `three` 0.180 | MIT | 3D 渲染引擎（WebGL 后端） |
| `zustand` 5.x | MIT | 全局状态（`useCarStore`） |
| `vite` 7.x（devDependency） | MIT | 构建工具 |

## 4. 字体

`app/index.html` 通过 Google Fonts 引入：

| 字体 | 许可 | 用途 |
| --- | --- | --- |
| Geist | **SIL Open Font License 1.1** | 界面正文/标题 |
| JetBrains Mono | **SIL Open Font License 1.1** | 数值/等宽显示 |

> 中文字形**不引入外部字体**，走系统回退栈（`PingFang SC` → `HarmonyOS Sans SC` →
> `Microsoft YaHei` → `Noto Sans SC`），避免中文 Web 字体的体积与授权复杂度。
> 若部署环境完全离线，Google Fonts 请求会失败并自动回退到系统字体，不影响功能。

## 5. 未使用的第三方内容（备查）

- **FormDrive 原仓的 `docs/formdrive-*.png` 展示图**：未复制（展示的是三车配置器界面，与本项目不符）。
- **`speech-recognition-mock.js`**（`scripts/mocks/`）：T9 自研的测试替身，非第三方。

## 6. 语音能力的边界（非许可问题，但影响分发口径）

Web Speech API 是**浏览器原生能力**，不引入任何第三方 SDK。其可用性受浏览器与安全上下文限制：
Chrome/Edge 在 https 或 localhost 下可用；Firefox / Safari 不支持；局域网 `http://<IP>` 属非安全上下文，
手机 Chrome 会拒绝麦克风。应用内已做中文降级提示（见 `app/src/voice/recognition.js`）。
