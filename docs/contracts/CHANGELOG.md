# 契约变更记录（CHANGELOG）

> 适用范围：`app/src/config/carConfig.js`、`app/src/state/useCarStore.js`、`app/src/devtools/auditHooks.js`
> 与 `docs/roadmap.md` §13 契约规格。
>
> **纪律（§12.1 / §13.4）：只增不改。** 字段不够用 → 在此追加一行；涉及既有语义变更 →
> 升级到人（S1 复议）；违反流程私改 store / 私改规格的分支不得通过 S2 准入。
>
> 格式：编号 / 日期 / 提出者 / 变更类型 / 字段 / 理由 / 建议方案 / 状态

| 编号 | 日期 | 提出者 | 类型 | 涉及字段 | 理由与方案 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 0001 | 2026-09-22 | T2 | 落地补值 | `PARTS[].node`（10 项） | §13.1 的 `node` 为 `⟨T2 实测⟩` 占位。按 T1 基线实测（T1 debug.md 记录 03：CDP 实测 10/10 部件 resolved）填实：门 `door_lf_dummy`/`door_rf_dummy`/`door_lr_dummy`/`door_rr_dummy`，窗 `door_lf_glass0_0`/`door_rf_glass0_0`/`door_lr_glass0_0`/`door_rr_glass0_0`，前备箱 `bonnet_dummy`，后备箱 `boot_dummy`。与规格示例一致，无冲突。 | 已落地（`contract-v1`） |
| 0002 | 2026-09-22 | T2 | **只增** | `PARTS[].motion` / `.axis` / `.angle` / `.travel` | §13.1 只冻结了 id/group/label/node/aliases，未含运动学参数，而 T5 重写 `VehicleModel.jsx` 必须按部件开合方式（铰链旋转 / 玻璃下滑）驱动动画。若不落进契约，T5 只能在自有文件里硬编码第二份模型事实，正是 §13.1 明令避免的漂移。取值与 T1 基线 `studioConfig.VEHICLES.tesla.parts` 逐项一致（门 ±1.08/±1.02 绕 z，前备箱 0.58 绕 x，后备箱 -0.82 绕 x，窗 slide travel 0.31/0.27），零行为变化。 | 已落地（`contract-v1`） |
| 0003 | 2026-09-22 | T2 | **只增** | `CAMERA_VIEWS[].position` / `.target` | 同上：T7 重写 `CameraRig.jsx` 需要预设机位与注视点。取自 T1 基线 `studioConfig.CAMERAS` 同名预设（id 一致 hero/front/profile/detail），零行为变化。 | 已落地（`contract-v1`） |
| 0004 | 2026-09-22 | T2 | **只增（新导出）** | `MODEL_URL`、`MODEL_TRANSFORM`、`MODEL_MATERIALS` | T5 的 `VehicleModel` 需要资产路径、摆放变换与材质识别名；T3 的 `HeadlightRig` 需要灯光材质名。三者原在 legacy `studioConfig.VEHICLES.tesla` 内，而 `config/**` 为 T2 独占、其余 Agent 只读，故由 T2 一次性给出唯一来源，避免三处各抄一份。数值与 T1 基线逐项一致，零行为变化。 | 已落地（`contract-v1`） |
| 0005 | 2026-09-22 | T2 | 落地补值（非语义变更） | `voice` 片初值 | §13.2 对 `voice` 只写"见下"，未给初值。T2 落地取 `{ status:'idle', transcript:'', lastCommand:null, supported:false, error:null }`：`supported:false` 为失败安全默认（能力探测成功前不显示麦克风入口），`status:'idle'` 避免在探测前就宣称 unsupported。T6 探测/注入后置为 `true`。 | 已落地（`contract-v1`） |
| 0006 | 2026-09-22 | T2 | 落地补值（非语义变更） | `SceneAudit.parts[].bbox`、`hitTargets`/`perf` 缺省 | §13.3 的 `bbox: [x,y,z] | null` 未说明语义。T2 定为**部件包围盒尺寸 [w,h,d]**，缺省 `null`（T5 经 `registerSceneAuditSource('parts', fn)` 提供）。`hitTargets` 未注册时为 `[]`，`perf` 未注册时为 `null`（消费方须判空）。 | 已落地（`contract-v1`） |
| 0007 | 2026-09-22 | T2 | **只增（新函数）** | `installVoiceInject(inject)` | §13.3④ 的 `window.__carDisplayVoiceInject` 归 T6 实现。T2 只在 `auditHooks.js` 提供安装助手与约定说明，**刻意不提供 stub**——否则 T9 的 `verify-voice` 会把"stub 存在"误判为"注入成功"而拿到假绿。 | 已落地（`contract-v1`） |
| 0008 | 2026-09-22 | T2 | 待决（升级到人） | legacy `studioConfig.js` 的去留 | §11.1 写"`studioConfig.js` → `config/carConfig.js`"，但 §12.2 的删除清单（§12.4 第 5 步）只提 `state/useStudioStore.js`。T2 按文件边界不跨文件接线，若删除 `studioConfig.js`，T1 基线的 9 个旧组件会在 T3–T7 接线完成前编译失败（违反 T2 的"工程保持可跑"DoD）。**T2 处置：原样保留并加 legacy 头注释**，由 T3/T4/T5/T7 在各自分支迁移引用、T8 集成末段决定是否与 shim 一并删除。请在 S1 确认该处置。 | **待人工确认（S1）** |
| 0009 | 2026-09-22 | T2 | 待决（升级到人） | `PAINTS` / `WHEELS` / `STUDIOS` / `HEADLIGHT_RIGS` 的归属 | 配置器属性已按 §3.2 裁剪，新契约未收录；但 `VehicleModel`（T5 文件）仍读 `PAINTS`/`WHEELS` 给车身上色。T2 未擅自迁入 `carConfig`（避免发明契约），暂留 legacy `studioConfig.js`。若 T5/T4 需要固定外观配置进契约，请登记申请。 | **待人工确认（S1）** |
| 0010 | 2026-09-22 | T4 | 待决（升级到人） | 加载态字段：`renderer` / `initialSceneReady` / `initialAssetProgress` / `initialAssetLoadedBytes` / `initialAssetTotalBytes`（建议合并为 `loading: { sceneReady, progress, loadedBytes, totalBytes }`） | §11.1 T4 的 DoD 要求"重写中文加载页（**保留字节级加载进度**）"，但 §13.2 的 state 片只冻结了 parts/lights/cameraView/cameraCommand/voice/toast/autoRotate/lastInteractionAt **八项**，未收录 T1 基线 `useStudioStore` 里的 5 个加载态字段，故新 store 下**字节级读数无处可取**。事实链：字节进度由 `useVehicleGLTF(url, trackInitialTransfer)` 的传输回调 `reportInitialTransfer` 写入（`src/hooks/useVehicleGLTF.js`），其唯一调用点在 **T5 独占的 `VehicleModel.jsx:81`**（T1 debug.md 记录 04 已实测：百分比正常、仅丢 MB 读数）；drei `useProgress` 只给"条目数"不给字节，GLTFLoader 的 `onProgress` 事件也未透出到 `ui/**`。**不增字段的后果**：新加载条退化为 0 → 100 一次性跳变（22 MB GLB 上肉眼可见），M2"中控风格改造"的加载体验回退。**建议方案（只增不改）**：store 增补 `loading: { sceneReady, progress, loadedBytes, totalBytes }`（初值 `{sceneReady:false, progress:0, loadedBytes:0, totalBytes:0}`），由 **T5** 在 `VehicleModel.jsx` 内把 `useVehicleGLTF` 的传输回调接进该片，**T4** 的加载页只读消费；`renderer` 不再需要（T4 改用 drei `useProgress` 判就绪）。若 S1 不采纳，T4 的加载页将按"百分比 + 中文回退文案"交付，并在《挂载说明》标注字节读数待补。 | **待人工裁定（S1）** |
