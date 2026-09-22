# 3D 仿真车模 Demo

以 Vibe Coding（多 Agent 并行）方式实现的 3D 仿真车模交互 Demo：新能源中控大屏风格的车模展示，可在手机与电脑浏览器直接打开。

## 功能

- **高还原车模**：Tesla 2018 Model 3 高精模型，配中控大屏风格场景（深色渐变背景、镜面反射地面、科技网格、环形光带、扫光、大灯/尾灯光束）
- **拖拽旋转**：任意角度环绕查看，支持待机自动旋转与相机预设切换（正面 / 侧面 / 细节）
- **点击控车**：点击车窗 / 车门 / 前备箱 / 后备箱 / 大灯 / 尾灯，对应部件开合与灯光切换
- **语音控车**：中文语音指令（Chrome / Edge 的 Web Speech API），如"打开车窗""关闭左前门"
- **双端适配**：桌面与手机竖屏自动调整相机与性能档位（高 / 中 / 低）

## 技术栈

- React 19 + React Three Fiber + Three.js（WebGPU / WebGL 双后端）
- Zustand 状态管理
- Vite 构建

## 本地运行

```bash
cd app
npm install        # 首次
npm run dev        # 开发服务器，默认 http://localhost:5173
```

> 手机联调：确保手机与电脑同一局域网，访问 `http://<电脑局域网IP>:5173`（语音识别需 https 或 localhost，正式演示走线上 https URL）。

## 构建

```bash
cd app
npm run build      # 产物输出到 app/dist，base 为相对路径，可离线打开
npm run preview    # 本地预览构建产物
```

## 线上访问

> 部署地址待 T10b 上线后填写（Vercel / GitHub Pages，https 为手机语音识别硬性条件）。

## 项目结构

```
app/                        前端工程（Vite）
  src/components/scene/     3D 场景（环境 / 车模 / 大灯光束 / 相机）
  src/components/ui/        控制面板与加载页
  src/components/voice/     语音识别与指令映射
  src/components/interaction/ 点选交互（部件拾取 / 拖拽）
  src/state/                契约化状态（useCarStore）
  src/config/carConfig.js   车模契约（部件 / 灯光 / 相机 / 质量档位）
  src/perf/                 性能档位
docs/                       过程文档（roadmap / prompt / debug / qa / 挂载说明）
scripts/                    自动化验收脚本（verify-*.mjs）
```

## 许可与致谢

见 [THIRD-PARTY.md](./THIRD-PARTY.md)：本项目源码沿用 FormDrive（MIT）基础；车模资产为 Tesla 2018 Model 3（CC BY 4.0，Ameer Studio）。
