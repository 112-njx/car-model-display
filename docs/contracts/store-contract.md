# 契约落地文档 · store-contract.md

> **契约版本：v1.0（对应 `docs/roadmap.md` §13 冻结规格 v1）**
> 交付分支：`contract-v1`（commit `0387166`，2026-09-22）
> 落地者：T2 契约 Agent　|　状态：**待 S1 评审冻结**
> 权威性顺序：**GLB 实测 > 本文档 > §13 规格**（§13 已声明"实测节点名 > 本规格"）
>
> **纪律**：本文件与 `carConfig.js` / `useCarStore.js` / `auditHooks.js` 由 T2 独占；其余 Agent
> 只读、只调用。字段不够用 → 登记 `docs/contracts/CHANGELOG.md`（**只增不改**）；涉及既有语义
> 变更 → 升级到人（S1 复议）。变更后本文件顶部版本号必须同步更新（§13.4 第 3 条）。

---

## 0. 一句话摘要

`config/carConfig.js` 提供全部静态契约（部件/灯光/相机/阈值/质量），`state/useCarStore.js`
是**唯一状态源**（点击 / 语音 / UI 按钮 / 相机四条通道读写同一 store），`devtools/auditHooks.js`
是 T9 脚本的**唯一依赖面**（注册式，九个 Agent 不抢改同一文件），`state/useStudioStore.js`
是保证工程全程可编译的**兼容 shim**（Wave 2 末段由 T8 删除）。

```
app/src/
├── config/carConfig.js        ← 本契约（§13.1 冻结 + T2 增补）
├── config/studioConfig.js     ← legacy，仅旧组件引用，见 §6.5
├── state/useCarStore.js       ← 本契约（§13.2 冻结）
├── state/useStudioStore.js    ← 兼容 shim（过渡，勿在新代码引用）
└── devtools/auditHooks.js     ← 本契约（§13.3 冻结）
```

---

## 1. `config/carConfig.js`（§13.1）

全部为**具名只读导出，无默认导出**。

### 1.1 冻结字段（与 §13.1 逐字一致）

| 导出 | 类型 | 落地值 / 说明 |
| --- | --- | --- |
| `CAR_ID` | `string` | `'tesla-model-3-2018'` |
| `CAR_NAME` | `string` | `'Tesla Model 3'` |
| `PART_GROUPS` | `{id,label,order}[]` | `windows 车窗 / doors 车门 / closures 前·后备箱`（order 1/2/3） |
| `PARTS` | `{id,group,label,node,aliases}[]` | 10 个部件，见 1.2 |
| `LIGHTS` | `{id,label,aliases}[]` | `headlight 大灯`、`taillight 尾灯` |
| `CAMERA_VIEWS` | `{id,label,order}[]` | `hero 复位 / front 正面 / profile 侧面 / detail 细节` |
| `INTERACTION` | `object` | 6 个阈值字段，见 1.4 |
| `QUALITY` | `{tiers,features}` | 3 档 `high/mid/low`，见 1.5 |

### 1.2 `PARTS` 实测节点名（T2 落地补值，CHANGELOG 0001）

`node` 取值以 **T1 基线浏览器实测**为准（T1 `debug.md` 记录 03：CDP 实测 10/10 部件 `resolved`，
开窗时玻璃 mesh 隐藏，四门/前备箱/后备箱开合正常）。与 §13.1 示例一致，无冲突。

| `id` | `group` | `label` | `node`（GLB 实测） | 运动学 |
| --- | --- | --- | --- | --- |
| `window_lf` | windows | 左前车窗 | `door_lf_glass0_0` | slide，travel 0.31 |
| `window_rf` | windows | 右前车窗 | `door_rf_glass0_0` | slide，travel 0.31 |
| `window_lr` | windows | 左后车窗 | `door_lr_glass0_0` | slide，travel 0.27 |
| `window_rr` | windows | 右后车窗 | `door_rr_glass0_0` | slide，travel 0.27 |
| `door_lf` | doors | 左前门 | `door_lf_dummy` | hinge，axis z，angle −1.08 |
| `door_rf` | doors | 右前门 | `door_rf_dummy` | hinge，axis z，angle +1.08 |
| `door_lr` | doors | 左后门 | `door_lr_dummy` | hinge，axis z，angle −1.02 |
| `door_rr` | doors | 右后门 | `door_rr_dummy` | hinge，axis z，angle +1.02 |
| `frunk` | closures | 前备箱 | `bonnet_dummy` | hinge，axis x，angle +0.58 |
| `trunk` | closures | 后备箱 | `boot_dummy` | hinge，axis x，angle −0.82 |

> **消费方注意**：一律通过 `id` 引用部件，**绝不硬编码 `node`**（§13.1 明确要求）。

### 1.3 T2 增补字段（**只增不改**，CHANGELOG 0002 / 0003 / 0004）

§13.1 只冻结了字段名，未含运动学与机位数值；而 `config/**` 由 T2 独占、其余 Agent 只读，
若各 Agent 各自复制模型事实就会造成"同一事实多处硬编码"的契约漂移。故由 T2 一次性给出唯一来源，
**数值与 T1 基线逐项一致，零行为变化**：

| 增补位置 | 字段 | 消费方 | 说明 |
| --- | --- | --- | --- |
| `PARTS[]` | `motion` / `axis` / `angle` / `travel` | T5 | `'hinge'` 读 `axis`+`angle`；`'slide'` 读 `travel`（局部单位，与 T1 基线同口径） |
| `CAMERA_VIEWS[]` | `position` / `target` | T7 | 预设机位与注视点（世界坐标），id 与 T1 基线 `CAMERAS` 一致 |
| 新导出 | `MODEL_URL` | T5 | `models/tesla-model-3-2018.glb`（`import.meta.env.BASE_URL` 感知） |
| 新导出 | `MODEL_TRANSFORM` | T5 | `{ rotation: [0, π, 0], groundOffset: -0.025 }` |
| 新导出 | `MODEL_MATERIALS` | T5、T3 | 材质识别名（小写子串匹配）：`paint` / `rims` / `headlights` / `taillights` |

### 1.4 `INTERACTION`（T5 与 T7 共读，T8 联调统一调参）

| 字段 | 值 | 语义 |
| --- | --- | --- |
| `tapMaxMovePx` | `6` | pointerdown→up 位移超过此值判为拖拽，不触发点击 |
| `tapMaxDurationMs` | `300` | 超过此值判为长按，不触发点击 |
| `hitPaddingRatio` | `0.02` | 命中包围盒外扩比例（薄玻璃命中容差） |
| `hoverHighlight` | `true` | 悬停高亮开关 |
| `idleAutoRotateDelayMs` | `8000` | 待机自转启动延时（T7 读） |
| `orbitOnceDurationMs` | `6000` | "转一下"环绕一周时长（T7 读） |

### 1.5 `QUALITY`

`tiers: ['high','mid','low']`；`features[tier] = { reflector, shadow, sweepLight, dprMax, gridSegments }`
（high：`true/true/true/2/96`；mid：`true/true/false/1.5/64`；low：`false/false/false/1/32`）。
**T8p 是档位的判定与写入方，T3/T8 是消费方**；T2 不读不写档位。

---

## 2. `state/useCarStore.js`（§13.2）

### 2.1 State 片

| 字段 | 类型 | 落地初值 | 说明 |
| --- | --- | --- | --- |
| `parts` | `Record<partId, boolean>` | 10 个 id 全 `false` | `true` = 已打开 |
| `lights` | `Record<lightId, boolean>` | 2 个 id 全 `false` | |
| `cameraView` | `'hero'\|'front'\|'profile'\|'detail'` | `'hero'` | 当前预设 |
| `cameraCommand` | `{type:'orbit-once'\|null, token:number}` | `{type:null, token:0}` | `token` 自增，保证同一命令可重复触发 |
| `voice` | `{status, transcript, lastCommand, supported, error}` | 见 2.2 | |
| `toast` | `ToastItem[]` | `[]` | `ToastItem = { id, text, level, ts }`，`level: 'info'\|'success'\|'warn'` |
| `autoRotate` | `boolean` | `false` | |
| `lastInteractionAt` | `number` | `Date.now()` | 由 `bumpInteraction()` 写入 |

### 2.2 `voice` 片初值（T2 落地补值，CHANGELOG 0005）

```js
{ status: 'idle', transcript: '', lastCommand: null, supported: false, error: null }
```

`voice.status` 枚举：`'unsupported' | 'idle' | 'requesting' | 'listening' | 'processing' | 'error'`。
`supported: false` 为**失败安全默认**（能力探测成功前不显示麦克风入口）；T6 探测或经
`__carDisplayVoiceInject` 注入后置 `true`。

### 2.3 Actions（全部为 store 上的同步函数）

| action | 签名 | 语义与落地细节 |
| --- | --- | --- |
| `setPart` | `(id, open) => void` | 幂等；`open` 经 `Boolean()` 归一 |
| `togglePart` | `(id) => void` | |
| `openGroup` / `closeGroup` | `(groupId) => void` | 按 `PARTS[].group` 批量；未知 groupId → 告警且 no-op |
| `closeAll` | `() => void` | **全部部件 + 全部灯光**复位为 `false` |
| `setLight` / `toggleLight` | `(id, on?) / (id) => void` | |
| `setCameraView` | `(viewId) => void` | 仅接受 `CAMERA_VIEWS[].id` |
| `orbitOnce` | `() => void` | 等价 `token++` 且 `type='orbit-once'` |
| `pushToast` | `(text, level='info') => void` | 自动分配 `id`（`toast-<n>` 会话内唯一）与 `ts`；**不做自动消失**（计时归 UI 层，见 §6.4） |
| `dismissToast` | `(id) => void` | |
| `setAutoRotate` | `(on) => void` | |
| `bumpInteraction` | `() => void` | 写 `lastInteractionAt = Date.now()`，是待机自转的复位信号 |
| `setVoiceStatus` / `setTranscript` / `setLastCommand` / `setVoiceSupported` / `resetVoice` | 对应 `voice` 片字段 | `resetVoice()` 复位为 2.2 的初值 |

**校验策略**：所有按 id 寻址的 action 都对未知 id 做**告警 + no-op**（DEV 下 `console.warn`，前缀
`[carStore]`），**不写入非法键**——避免 T9 脚本或语音解析器把错 id 悄悄写进状态。

**`bumpInteraction` 的责任划分（重要）**：§13.2 规定"所有用户输入（指针/键盘/点击/语音指令）
必须调用"。T2 **刻意不让命令型 action 隐式 bump**，以免掩盖输入层的漏调。因此：

- T5（指针点击/拖拽）、T6（语音指令）、T7（指针/键盘）、T4（面板按钮）**必须自行调用** `bumpInteraction()`；
- 兼容 shim 作为旧 UI 的输入层，已在 `togglePart / closeAllParts / toggleHeadlights / toggleTailLights / setCameraView` 中代为调用；
- `pushToast` 属"后果"而非"输入"，**任何情况下都不 bump**。

### 2.4 派生纯函数（具名导出）

| 函数 | 签名 | 语义 |
| --- | --- | --- |
| `isPartOpen` | `(state, id) => boolean` | 容错：`state` 为 `undefined` 时返回 `false` |
| `openPartIds` | `(state) => string[]` | 按 `PARTS` 声明顺序返回已打开部件 id |
| `isAllClosed` | `(state) => boolean` | **全部部件已关 且 全部灯光已灭**——与 `closeAll` 的复位范围一致 |

> `isAllClosed` 的口径说明：它对齐 `closeAll()`（部件 + 灯光），因此"仅灯亮"时返回 `false`。
> 若 UI 需要"仅部件"口径，用 `openPartIds(state).length === 0`，勿私改本函数语义。

### 2.5 Store 句柄

```js
export const useCarStore;   // React 组件：useCarStore(s => s.parts)
export const carStore;      // 非 React：carStore.getState() / .setState(partial) / .subscribe(fn)
```

`carStore` 形状与 §13.3① 一致（`getState / setState / subscribe`），供 T6 语音模块与 T9 的
CDP 脚本使用。二者是**同一 store 实例**。

---

## 3. `state/useStudioStore.js` 兼容 shim（过渡）

**用途**：让 T1 基线的旧组件在 T3–T7 接线完成前仍能编译并运行。**新代码一律不得引用。**
**删除时机**：§12.4 第 5 步，Wave 2 集成末段由 T8 删除（此时已无引用）。

### 3.1 旧部件 key → 新逻辑 id 映射

| 旧 key（`VEHICLES.tesla.parts`） | 新 id（§13.1） | 旧 key | 新 id |
| --- | --- | --- | --- |
| `leftDoor` | `door_lf` | `leftWindow` | `window_lf` |
| `rearLeftDoor` | `door_lr` | `rearLeftWindow` | `window_lr` |
| `rightDoor` | `door_rf` | `rightWindow` | `window_rf` |
| `rearRightDoor` | `door_rr` | `rearRightWindow` | `window_rr` |
| `hood` | `frunk` | `trunk` | `trunk` |

灯光：`headlights → headlight`、`tailLights → taillight`。相机：旧 `CAMERAS` 的 key 与
`CAMERA_VIEWS[].id` 同名，为恒等映射。

### 3.2 机制

- **镜像（新 → 旧）**：`carStore.subscribe()` 把 `parts / lights / cameraView` 投影为旧的
  `partStates / headlights / tailLights / cameraView`（值变化才 `setState`，避免多余渲染）。
  **真值只在 carStore**，shim 不存第二份真相。
- **反向（旧 UI → 新）**：`togglePart / closeAllParts / toggleHeadlights / toggleTailLights /
  setCameraView` 转调 carStore 对应 action，并代为 `bumpInteraction()`。
- **过渡字段**：`vehicle / pendingVehicle / vehicleLoadError / paint / finish / wheel / studio /
  panelOpen / infoOpen / renderer / initialSceneReady / initialAsset*` 与
  `setPaint / setFinish / setWheel / setStudio / requestVehicle / completeVehicleLoad /
  failVehicleLoad / togglePanel / openInfo / closeInfo / setRenderer / setInitialSceneReady /
  setInitialAssetTransfer / capture` **原样保留为本地状态**（新契约已裁剪这些配置器属性），
  仅为旧组件可运行，随 shim 一并删除。

### 3.3 与 T1 基线的两处**有意行为变化**（消费方须知）

1. **灯光默认值**：旧基线 `headlights / tailLights` 默认 `true`（大灯尾灯常亮）；§13.2 冻结
   `lights` 初值全 `false`。shim 以 carStore 为真值，故过渡期**灯光默认关闭**（规格要求，非缺陷）。
2. **`closeAllParts` 范围**：旧版只复位部件；现映射到 `closeAll()`，**同时熄灭两盏灯**（§13.2 语义）。
3. `completeVehicleLoad` 不再重置 `partStates / cameraView`（这两片自 T2 起归 carStore 所有）。

---

## 4. `devtools/auditHooks.js`（§13.3）

**本文件由 T2 独占**；T5/T7/T8p 只调用注册函数，不修改文件本体（§12.4 冲突预案）。

### 4.1 `window.__carDisplayStore`

store 句柄，形如 `{ getState(), setState(partial), subscribe(fn) }`。T9 用它读终态、驱动 action。

### 4.2 `window.__carDisplaySceneAudit()` → `SceneAudit`

```ts
{
  parts:  [{ id: string, open: boolean, progress: number, bbox: [w,h,d] | null }],
  lights: [{ id: string, on: boolean }],
  cameraView: string | null,
  autoRotate: boolean,
  hitTargets: [{ id, center: [x,y,z], size: [x,y,z], screen: { x, y } }],  // T5 注册；未注册 = []
  perf: { fps: number, dpr: number, tier: 'high'|'mid'|'low' } | null,     // T8p 注册；未注册 = null
}
```

落地细节（T2 补值，CHANGELOG 0006）：

- `parts` / `lights` 恒为**全量 10 项 / 2 项**（顺序同 `carConfig`），消费方无需自行补全；
- `progress` 缺省为 `open ? 1 : 0`；**T5 经 `registerSceneAuditSource('parts', fn)` 提供真实动画进度**；
- `bbox` 语义定为**部件包围盒尺寸 `[w,h,d]`**，未提供为 `null`（T9 点击请优先用 `hitTargets`）；
- `perf` 未注册为 `null`，**消费方必须判空**。

### 4.3 `window.__carDisplayCameraAudit()` → `CameraAudit`

```ts
{ view: string | null, position: [x,y,z] | null, target: [x,y,z] | null,
  distance: number | null, autoRotating: boolean, orbiting: boolean }
```

`view` 来自 store；`position / target / distance` 未注册为 `null`；`autoRotating / orbiting` 未注册为
`false`。**若 `position` 与 `target` 均已注册而 `distance` 未注册，自动按欧氏距离补算**。

### 4.4 注册 API

```js
registerSceneAuditSource(key, fn) → unregister()   // 传 fn = null 亦注销
```

| 参数 | 说明 |
| --- | --- |
| `key` | 字段名。落点由**路由表**决定：`view / position / target / distance / autoRotating / orbiting` → `__carDisplayCameraAudit()`；**其余 key → `__carDisplaySceneAudit()`** |
| `fn` | 无参取值函数。返回 `undefined` / `null` 视为"本次不提供该字段"；抛错只丢弃该字段并 `console.warn`，**不连坐整个审计** |
| 返回值 | 注销函数（适合放在 React effect 的 cleanup 中） |

合并规则：**`key === 'parts'` → 深合并**（`fn()` 返回 `{ [partId]: { progress?, bbox? } }`，逐项覆盖基准值）；
**其余 key → 整体覆盖**。重复注册同一 key 以最后一次为准。非法入参（非字符串 key / 非函数 fn）
返回空操作注销函数并告警。

各 Agent 的注册清单（§13.3 + §12.4 约定）：

| Agent | 调用 | 提供字段 |
| --- | --- | --- |
| T5 | `registerSceneAuditSource('hitTargets', fn)`（+ 可选 `'parts'`） | 命中目标包围盒与屏幕坐标、真实动画进度 |
| T8p | `registerSceneAuditSource('perf', fn)` | `{ fps, dpr, tier }` |
| T7 | `registerSceneAuditSource('autoRotating' \| 'orbiting' \| 'position' \| 'target' \| 'distance', fn)` | 相机审计字段 |
| T3 | `registerSceneAuditSource('autoRotate', fn)`（按需） | 场景侧自转真值 |

### 4.5 安装时机

由 `state/useCarStore.js` 在模块求值时调用 `installAuditHooks(carStore)`（**依赖注入，无循环 import**）。
因此任何引入 store 的模块——包括兼容 shim 与全部旧组件——都会自动装好三个 `window.__carDisplay*` 钩子，
**无需改动 `App.jsx` / `main.jsx`**（Wave 1 禁改）。`installAuditHooks` 幂等，可重复调用。

**生产构建同样安装**（未加 `import.meta.env.DEV` 判断）：§13.3 未限定 DEV，而 T9 需要对
`dist` 产物跑契约层断言。

### 4.6 `window.__carDisplayVoiceInject`（§13.3④，**实现归 T6**）

约定：T6 在 `voice/recognition.js` 中安装 `window.__carDisplayVoiceInject = (ctor | null) => {...}`；
传入自定义构造函数即替换真实 `SpeechRecognition`，传 `null` 恢复；**注入后 `voice.supported` 必须
变为 `true`**，使 mock 回放走完整链路而非降级分支。

T2 只提供 `installVoiceInject(inject)` 助手与上述约定，**刻意不提供 stub**——若提供，T9 的
`verify-voice` 会把"stub 存在"误判为"注入成功"而拿到假绿。

---

## 5. 消费方接入指引（速查）

| Agent | 该怎么做 | 不该做什么 |
| --- | --- | --- |
| **T3** 场景 | 从 `carConfig.QUALITY` 读降级字段；`HeadlightRig` 接 `lights.headlight` | 改 `carConfig`；在自有文件里硬编码材质名（用 `MODEL_MATERIALS`） |
| **T4** UI | 用 `useCarStore(s => ...)` 取状态、调 action；分组渲染用 `PART_GROUPS` + `PARTS` | 改 store；用 `useStudioStore`（shim 仅供旧组件） |
| **T5** 拾取 | 用 `carConfig.PARTS[].node` 找 pivot、读 `motion/axis/angle/travel` 驱动动画；注册 `hitTargets`；`interaction` 阈值读 `carConfig.INTERACTION` | 改 `auditHooks.js`；硬编码 node 名 |
| **T6** 语音 | 指令解析用 `PARTS[].aliases` / `LIGHTS[].aliases` / `CAMERA_VIEWS[].label`；执行后 `bumpInteraction()` + `pushToast()`；安装注入点 | 改 store；自行维护第二份词表（别名已在契约里） |
| **T7** 相机 | 预设读 `CAMERA_VIEWS[].position/target`；监听 `cameraCommand.token` 触发环绕；注册相机审计字段 | 改 `CameraRig.jsx` 以外的契约文件 |
| **T8p** 性能 | 只读 `QUALITY`；注册 `perf` | 改 `QUALITY` 数值（要改走 CHANGELOG） |
| **T9** 验证 | 只用 `window.__carDisplayStore` + 两个 audit + `__carDisplayVoiceInject` | 直接 import store 内部实现细节 |

---

## 6. 与 §13 的差异清单（**全部为"只增不改"**）

| CHANGELOG | 差异 | 性质 |
| --- | --- | --- |
| 0001 | `PARTS[].node` 由占位符填为 T1 实测值 | 落地补值（§13 授权 T2 填） |
| 0002 / 0003 / 0004 | `PARTS[]` 运动学字段、`CAMERA_VIEWS[]` 机位、`MODEL_URL/MODEL_TRANSFORM/MODEL_MATERIALS` | **只增**，零行为变化 |
| 0005 / 0006 | `voice` 初值、`bbox` 语义、未注册字段缺省值 | 落地补值（§13 未规定） |
| 0007 | `installVoiceInject` 助手 | **只增**（不提供 stub 的说明） |
| 0008 / 0009 | legacy `studioConfig.js` 去留、`PAINTS/WHEELS/STUDIOS/HEADLIGHT_RIGS` 归属 | **待人工确认（S1）** |

**没有任何既有字段/action/钩子被改名、删除或改变语义。**

---

## 7. T2 自测记录（本节为交付证据，详见 `docs/debug.md` T2 各轮记录）

| 项目 | 结果 |
| --- | --- |
| `npm run build` | ✅ 628 modules，5.70s（T1 基线 625 + T2 新增 3 个模块），无新增告警 |
| `npm run dev`（端口 5174，5173 被他人实例占用） | ✅ 就绪；`carConfig.js` / `useCarStore.js` / `useStudioStore.js` / `auditHooks.js` / `VehicleModel.jsx` 经 dev 转换管线全部 HTTP 200 |
| 契约层断言（Node + Vite `ssrLoadModule` 加载真实模块） | ✅ **111 项断言全部通过**：config 形状与实测节点名、store 初值与 18 个 action、10 部件 + 2 灯光驱动、分组开关、`closeAll`、未知 id 拒绝、相机与 `orbitOnce` token 自增、toast、`bumpInteraction`、语音系列、3 个派生函数、shim 双向映射与旧字段齐备、审计三钩子结构与注册/注销/深合并/抛错隔离 |
| 旧 UI 经 shim 的 SSR 烟测 | ✅ 7 个旧 UI 组件（`ControlDeck`/`CameraControls`/`HeroCopy`/`InfoDialog`/`Navigation`/`InitialLoadingScreen`/`VehicleSelector`）全部渲染成功；6 个场景组件模块静态加载 OK。注：zustand v5 服务端快照取 `getInitialState()`，SSR **不能**用于验证驱动后的响应性 |
| 浏览器 CDP 实测（部件动画、灯光发光、相机位移） | ⛔ **未完成**：无头 Edge 启动被 worktree 隔离守卫拦截，已登记 `debug.md` 人工配置区 #5 |

---

## 8. 待人工确认项（S1 评审时请一并裁定）

1. **CHANGELOG 0008**：legacy `config/studioConfig.js` 是否保留到 T8 集成末段？T2 的处置是"原样保留 +
   legacy 头注释"，因为按 §12.2 文件边界 T2 不跨文件接线，删除它会让 T1 基线的 9 个旧组件在
   T3–T7 接线完成前编译失败。
2. **CHANGELOG 0009**：`PAINTS / WHEELS / STUDIOS / HEADLIGHT_RIGS` 是否迁入 `carConfig`？T2 未擅自迁入
   （避免发明契约），暂留 legacy 文件；T5 的 `VehicleModel` 仍需 `PAINTS/WHEELS` 给车身上色。
3. **`isAllClosed` 口径**（部件 + 灯光，对齐 `closeAll`）：若 T4 期望"仅部件"口径，请裁定。
4. **`bumpInteraction` 不隐式触发**的划分：T4/T5/T6/T7 需各自调用（§13.2 原文即如此），确认无异议。
