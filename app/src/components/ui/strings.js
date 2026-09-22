// T4 · 中文文案表（本项目界面文案的唯一来源）
//
// 纪律：
//   1. `ui/**` 内不得出现硬编码的中文/英文界面文案，一律从本表取用；
//   2. 其他模块（T5 点击拾取、T6 语音控车、T8 集成）可直接 import 本表，
//      以保证「同一动作在不同通道下的反馈文案完全一致」；
//   3. 车型名（Tesla Model 3）、单位（MB）等专有名词不翻译，属有意保留。
//
// 命名：按界面区域分组，函数型条目用于拼装带参数的句子。

export const STRINGS = {
  // ── 跳过导航 ──
  skipLink: "跳到车辆控制面板",

  // ── 控制面板外壳 ──
  panel: {
    eyebrow: "车辆控制",
    ariaLabel: "车辆控制面板",
    expand: "展开面板",
    collapse: "收起面板",
    title: (name, year) => (year ? `${name} · ${year}` : name),
    statusAllClosed: "车辆已全部关闭",
    statusOpened: (open, total) => `已开启 ${open} / ${total} 个部件`,
  },

  // ── 部件分组 ──
  groups: {
    openAll: "全开",
    closeAll: "全关",
    openAllAria: (label) => `打开全部${label}`,
    closeAllAria: (label) => `关闭全部${label}`,
  },

  // ── 单个部件按钮 ──
  parts: {
    stateOpen: "已打开",
    stateClose: "已关闭",
    ariaLabel: (label, open) => `${label}，当前${open ? "已打开" : "已关闭"}`,
  },

  // ── 灯光 ──
  lights: {
    title: "灯光",
    hints: {
      headlight: "前照灯光束",
      taillight: "尾部灯光",
    },
    switchAria: (label) => `开关${label}`,
  },

  // ── 视角 ──
  camera: {
    title: "视角",
    ariaLabel: "视角控制",
    orbitOnce: "环绕一周",
    orbitOnceHint: "绕车缓转一圈后复位",
    autoRotate: "待机自转",
    autoRotateHint: "静止后自动缓速旋转",
    viewAria: (label) => `切换到${label}视角`,
  },

  // ── 一键复位 ──
  actions: {
    closeAll: "全部关闭",
    closeAllHint: "关闭所有部件与灯光",
  },

  // ── 语音容器位（T6 接入 VoiceButton，本任务不实现语音逻辑）──
  voice: {
    slotLabel: "语音控制",
    placeholder: "语音控制",
  },

  // ── 手势提示 ──
  gesture: "拖动旋转 · 双指缩放 · 点按车身部件开合",

  // ── Toast 执行反馈 ──
  toast: {
    dismiss: "点击关闭提示",
    partOpened: (label) => `${label}已打开`,
    partClosed: (label) => `${label}已关闭`,
    groupOpened: (label) => `${label}已全部打开`,
    groupClosed: (label) => `${label}已全部关闭`,
    allClosed: "所有部件与灯光已关闭",
    lightOn: (label) => `${label}已开启`,
    lightOff: (label) => `${label}已关闭`,
    cameraView: (label) => `视角已切换到${label}`,
    orbitOnce: "正在环绕车辆一周",
    autoRotateOn: "待机自转已开启",
    autoRotateOff: "待机自转已关闭",
  },

  // ── 加载页 ──
  loading: {
    brand: "智能座舱",
    edition: "3D 车模控制台",
    heroKicker: "正在载入车辆",
    heroTitle: "车形即现",
    statusLoading: "正在加载车身模型",
    statusCalibrating: "正在校准材质",
    statusReady: "画面已就绪",
    statusError: "资源加载中断",
    statusPreparing: "正在准备资源",
    channel: "实时渲染通道",
    fallbackNote: "首次载入约 22 MB",
    bytes: (loaded, total) => `${loaded} / ${total} MB`,
    retry: "重新加载",
    ariaLabel: "车辆模型加载中",
    progressAria: "车辆模型加载进度",
  },
};
