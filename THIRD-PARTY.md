# THIRD-PARTY.md — 第三方代码与资产归属

本项目由 FormDrive（开源项目）裁剪改造而来，并集成第三方 3D 车模资产与前端依赖。逐项归属如下，均可追溯。

## 1. 应用源码

| 来源 | 许可 | 说明 |
| --- | --- | --- |
| [FormDrive](https://github.com/nesdesignco/FormDrive) | MIT | 本项目的前端基线（React Three Fiber + Three.js 汽车展示应用）。版权：Copyright (c) 2026 Enes Kaymaz。完整许可文本见 `app/LICENSE`。本项目在其基础上进行 Tesla 单车裁剪、场景重制、交互/语音/性能扩展。 |

## 2. 3D 车模资产

| 资产 | 许可 | 作者 / 来源 | 许可文本 |
| --- | --- | --- | --- |
| Tesla 2018 Model 3 | CC BY 4.0 | Ameer Studio（Sketchfab: uchiha.321abc），[模型页](https://sketchfab.com/3d-models/tesla-2018-model-3-5ef9b845aaf44203b6d04e2c677e444f) | `app/public/models/TESLA-LICENSE.md` |

> 使用说明：CC BY 4.0 要求署名。模型在本 Demo 中保持署名信息展示（见加载页/关于信息，T10 定稿）。

## 3. 前端运行时依赖

以下为主要运行时依赖及其许可；完整许可文本以各依赖包内 LICENSE 文件为准（`app/node_modules/<包名>/LICENSE*`）。

| 依赖 | 版本 | 许可 |
| --- | --- | --- |
| three | ^0.180.0 | MIT |
| react | ^19.2.0 | MIT |
| react-dom | ^19.2.0 | MIT |
| @react-three/fiber | ^9.4.0 | MIT |
| @react-three/drei | ^10.7.7 | MIT |
| zustand | ^5.0.8 | MIT |
| vite（构建期） | ^7.1.7 | MIT |

## 4. 说明

- 未使用需单独署名的字体 / 图标 / 第三方脚本。
- 若后续引入新依赖或资产，须在本文件追加对应条目后再提交。
