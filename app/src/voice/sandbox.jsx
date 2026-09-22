/**
 * T6 语音控车 · 自测沙盒入口（由 voice.sandbox.html 加载）
 *
 * 两种模式，共用同一套 DOM 结构（同一套断言在两种模式下都能跑）：
 *   ① 假 store（A 段链路）：页面自建假 store 承接 executePlan，**不碰主应用 store**，
 *      用来验证「解析 → 计划 → 动作」的映射本身。
 *   ② 真 store（B 段链路）：挂载**真正的 `<VoiceControl/>`**，走 `useVoiceControl` → carConfig 词表
 *      → 真 store（§13.2）→ 真 toast。用手动输入驱动即可在**无麦克风**环境下验证整条接线。
 *
 * 本页始终不 import `App.jsx` / 场景 / UI，因此不影响主入口，也不需要 T8 先完成集成。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { carStore } from "../state/useCarStore.js";
import { DEFAULT_VOCABULARY, describeActions } from "./commands.js";
import { parseCommandDetailed } from "./parseCommand.js";
import { runCommandCases } from "./commandCases.js";
import { detectSupport, getInjectedCtor, queryMicrophonePermission, setSupportOverrideForTest } from "./recognition.js";
import { createSnapshot, createVoiceController } from "./voiceController.js";
import { cancelSpeech, isSpeechSynthesisSupported, speak } from "./synthesis.js";
import { VoiceButton } from "./VoiceButton.jsx";
import { VoiceControl } from "./VoiceControl.jsx";
import { VOICE_VOCABULARY } from "./useVoiceControl.js";

const VOCAB = DEFAULT_VOCABULARY;

// ── 回放 mock：模拟 SpeechRecognition，按 §6 指令集循环「说话」 ──
const REPLAY = [
  ["打开车窗"],
  ["打开左前门"],
  ["关闭右后门"],
  ["打开前备箱"],
  ["打开后备箱"],
  ["打开大灯"],
  ["关闭大灯"],
  ["转一下"],
  ["看侧面"],
  ["看正面"],
  ["复位"],
  ["全部关闭"],
  // 多候选场景：第一条是 ASR 误识别，第二条才正确 —— 验证「择优」能救回来
  ["打开车床", "打开车窗"],
  ["打开后辈箱", "打开后备箱"],
  ["看测面", "看侧面"],
];

function createReplayMockClass(onEvent) {
  return class ReplayMockSpeechRecognition {
    constructor() {
      this.lang = "";
      this.continuous = false;
      this.interimResults = false;
      this.maxAlternatives = 1;
      this.started = false;
      this.index = 0;
      this.timers = [];
    }
    start() {
      if (this.started) {
        const error = new Error("already started");
        error.name = "InvalidStateError";
        throw error;
      }
      this.started = true;
      if (this.onstart) this.onstart();
      this.tick();
    }
    stop() {
      this.clear();
      this.started = false;
      if (this.onend) this.onend();
    }
    abort() {
      this.stop();
    }
    clear() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
    }
    tick() {
      const entry = REPLAY[this.index % REPLAY.length];
      this.index += 1;
      this.timers.push(
        setTimeout(() => {
          if (!this.started || !this.onresult) return;
          const results = [entry.map((transcript) => ({ transcript, confidence: 0.9 }))];
          results[0].isFinal = false;
          this.onresult({ resultIndex: 0, results });
        }, 600),
      );
      this.timers.push(
        setTimeout(() => {
          if (!this.started || !this.onresult) return;
          const results = [entry.map((transcript) => ({ transcript, confidence: 0.9 }))];
          results[0].isFinal = true;
          this.onresult({ resultIndex: 0, results });
          if (onEvent) onEvent(`mock 回放：${entry.join(" / ")}`);
          this.tick();
        }, 1500),
      );
    }
  };
}

// ── 假车状态（承接 executePlan，替代 store） ──

function createFakeCarState() {
  const parts = {};
  for (const part of VOCAB.parts) parts[part.id] = false;
  const lights = {};
  for (const light of VOCAB.lights) lights[light.id] = false;
  return { parts, lights, cameraView: "hero", orbits: 0, bumps: 0 };
}

/** 真 store 状态 → 与假车状态相同的展示结构（同一套断言可用） */
function fromStore(state) {
  if (!state) return { parts: {}, lights: {}, cameraView: "—", orbits: 0, bumps: "—" };
  return {
    parts: state.parts || {},
    lights: state.lights || {},
    cameraView: state.cameraView,
    orbits: state.cameraCommand?.token ?? 0,
    bumps: state.lastInteractionAt,
  };
}

function Sandbox() {
  const [mode, setMode] = useState("fake");
  const [snap, setSnap] = useState(createSnapshot);
  const [car, setCar] = useState(createFakeCarState);
  const [logs, setLogs] = useState([]);
  const [manual, setManual] = useState("打开左前车窗");
  const [permission, setPermission] = useState("unknown");
  const [realState, setRealState] = useState(() => carStore.getState());

  const fakeControllerRef = useRef(null);
  const realControllerRef = useRef(null);

  const log = useCallback((text) => {
    const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogs((prev) => [`[${stamp}] ${text}`, ...prev].slice(0, 120));
  }, []);

  // ── 假 store 的 action（名字与 §13.2 一致，便于对照真 store）──
  const fakeApi = useMemo(
    () => ({
      setPart: (id, open) => setCar((state) => ({ ...state, parts: { ...state.parts, [id]: open } })),
      openGroup: (groupId) =>
        setCar((state) => {
          const parts = { ...state.parts };
          for (const part of VOCAB.parts) if (part.group === groupId) parts[part.id] = true;
          return { ...state, parts };
        }),
      closeGroup: (groupId) =>
        setCar((state) => {
          const parts = { ...state.parts };
          for (const part of VOCAB.parts) if (part.group === groupId) parts[part.id] = false;
          return { ...state, parts };
        }),
      setLight: (id, on) => setCar((state) => ({ ...state, lights: { ...state.lights, [id]: on } })),
      setCameraView: (view) => setCar((state) => ({ ...state, cameraView: view })),
      orbitOnce: () => setCar((state) => ({ ...state, orbits: state.orbits + 1 })),
      bumpInteraction: () => setCar((state) => ({ ...state, bumps: state.bumps + 1 })),
    }),
    [],
  );

  useEffect(() => {
    const controller = createVoiceController({
      api: fakeApi,
      vocabulary: VOCAB,
      onChange: setSnap,
      onLog: log,
      speak,
    });
    fakeControllerRef.current = controller;
    controller.refreshSupport();
    return () => {
      controller.destroy();
      fakeControllerRef.current = null;
      cancelSpeech();
    };
  }, [fakeApi, log]);

  // 真 store 镜像（§13.3 ① 的 store 句柄）
  useEffect(() => {
    setRealState(carStore.getState());
    return carStore.subscribe((state) => setRealState(state));
  }, []);

  useEffect(() => {
    queryMicrophonePermission().then(({ state }) => setPermission(state));
  }, []);

  const activeController = () => (mode === "real" ? realControllerRef.current : fakeControllerRef.current);

  const handleInject = useCallback(() => {
    activeController()?.injectRecognition(createReplayMockClass(log));
  }, [log, mode]);

  const handleRestore = useCallback(() => {
    activeController()?.injectRecognition(null);
  }, [mode]);

  const handleOverride = useCallback(
    (code) => {
      setSupportOverrideForTest(code);
      const next = activeController()?.refreshSupport() || detectSupport();
      log(`强制降级：${code || "关闭"}（supported=${next.supported}）`);
    },
    [log, mode],
  );

  const handleManual = useCallback(() => {
    const text = manual.trim();
    if (text) activeController()?.handleAlternatives([text], "手动输入");
  }, [manual, mode]);

  const handleRealReady = useCallback((controller) => {
    realControllerRef.current = controller;
  }, []);

  const caseReport = useMemo(() => runCommandCases({ vocabulary: VOCAB }), []);
  // B 段关键校验：换成 **carConfig 派生的词表**后，全部用例是否仍然通过
  const caseReportCfg = useMemo(() => runCommandCases({ vocabulary: VOICE_VOCABULARY }), []);
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of caseReport.results) {
      const bucket = map.get(item.group) || { pass: 0, total: 0 };
      bucket.total += 1;
      if (item.pass) bucket.pass += 1;
      map.set(item.group, bucket);
    }
    return Array.from(map.entries());
  }, [caseReport]);

  const detail = parseCommandDetailed(manual, { vocabulary: VOCAB });

  const support = detectSupport();
  const injected = Boolean(getInjectedCtor());
  const supported = mode === "real" ? Boolean(realState?.voice?.supported) : snap.supported;
  const displayCar = mode === "real" ? fromStore(realState) : car;
  const toasts = realState?.toast || [];

  return (
    <div>
      <div className="toolbar">
        <button type="button" className="tool" aria-pressed={mode === "fake"} onClick={() => setMode("fake")}>
          假 store（契约无关）
        </button>
        <button type="button" className="tool" aria-pressed={mode === "real"} onClick={() => setMode("real")}>
          真 store（VoiceControl）
        </button>
        <button type="button" className="tool" aria-pressed={injected} onClick={handleInject}>
          注入回放 mock
        </button>
        <button type="button" className="tool" aria-pressed={!injected} onClick={handleRestore}>
          恢复真实识别
        </button>
        <button type="button" className="tool" onClick={() => handleOverride("unsupported")}>
          强制「不支持」
        </button>
        <button type="button" className="tool" onClick={() => handleOverride("insecure-context")}>
          强制「非安全上下文」
        </button>
        <button type="button" className="tool" onClick={() => handleOverride(null)}>
          取消降级
        </button>
        <button type="button" className="tool" onClick={() => setLogs([])}>
          清空日志
        </button>
      </div>

      <div className="grid">
        <section className="card">
          <h2>① 能力探测</h2>
          <dl className="kv">
            <dt>supported</dt>
            <dd className={supported ? "ok" : "bad"}>{String(supported)}</dd>
            <dt>secure</dt>
            <dd className={support.secure ? "ok" : "warn"}>{String(support.secure)}</dd>
            <dt>injected</dt>
            <dd className={injected ? "ok" : ""}>{String(injected)}</dd>
            <dt>code</dt>
            <dd>{injected ? "injected" : supported ? "ok" : support.secure ? "unsupported" : "insecure-context"}</dd>
            <dt>麦克风权限</dt>
            <dd>{permission}</dd>
            <dt>语音播报</dt>
            <dd>{String(isSpeechSynthesisSupported())}</dd>
            {support.message ? (
              <>
                <dt>降级提示</dt>
                <dd className="warn">{support.message}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className="card">
          <h2>② 语音控车{mode === "real" ? "（VoiceControl · 真 store）" : "（VoiceButton · 假 store）"}</h2>
          {mode === "real" ? (
            <VoiceControl onReady={handleRealReady} onLog={log} />
          ) : (
            <VoiceButton
              status={snap.status}
              supported={snap.supported}
              transcript={snap.transcript}
              reply={snap.reply}
              hint={snap.hint}
              message={snap.message}
              error={snap.error}
              onToggle={() => fakeControllerRef.current?.toggle()}
              onRetry={() => fakeControllerRef.current?.start()}
              speechEnabled={snap.speechEnabled}
              onToggleSpeech={() => {
                const next = !snap.speechEnabled;
                if (!next) cancelSpeech();
                fakeControllerRef.current?.setSpeechEnabled(next);
              }}
              speechSupported={isSpeechSynthesisSupported()}
            />
          )}
          <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
            状态：<strong>{mode === "real" ? realState?.voice?.status || "idle" : snap.status}</strong>
            {mode === "real" ? ` ｜ store.voice.lastCommand：${String(realState?.voice?.lastCommand)}` : ""}
          </p>
        </section>

        <section className="card">
          <h2>③ 手动输入指令（无麦克风环境自测）</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleManual();
              }}
              aria-label="手动输入语音指令"
              style={{
                flex: 1,
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "rgba(0,0,0,0.3)",
                color: "var(--text)",
                font: "inherit",
              }}
            />
            <button type="button" className="tool" onClick={handleManual}>
              执行
            </button>
          </div>
          <dl className="kv" style={{ marginTop: 12 }}>
            <dt>归一化</dt>
            <dd className="mono">{detail.normalized || "（空）"}</dd>
            <dt>分句</dt>
            <dd className="mono">{(detail.fragments || []).join(" | ") || "—"}</dd>
            <dt>计划</dt>
            <dd className="mono">{detail.actions.length ? JSON.stringify(detail.actions) : "[]（不执行）"}</dd>
            <dt>回执</dt>
            <dd>{describeActions(detail.actions, { vocabulary: VOCAB }) || "—"}</dd>
            {detail.hint ? (
              <>
                <dt>提示</dt>
                <dd className="warn">{detail.hint}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className="card">
          <h2>④ {mode === "real" ? "真 store 状态（carStore.getState()）" : "假车状态（executePlan 的结果）"}</h2>
          <div className="chips">
            {VOCAB.parts.map((part) => (
              <span key={part.id} className={`chip ${displayCar.parts[part.id] ? "chip--open" : ""}`}>
                {part.label}
                {displayCar.parts[part.id] ? " 开" : " 关"}
              </span>
            ))}
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {VOCAB.lights.map((light) => (
              <span key={light.id} className={`chip ${displayCar.lights[light.id] ? "chip--on" : ""}`}>
                {light.label}
                {displayCar.lights[light.id] ? " 亮" : " 灭"}
              </span>
            ))}
            <span className="chip chip--open">视角：{displayCar.cameraView}</span>
            <span className="chip">环绕次数：{displayCar.orbits}</span>
            <span className="chip">bumpInteraction：{displayCar.bumps}</span>
          </div>
          {mode === "real" ? (
            <dl className="kv" style={{ marginTop: 12 }}>
              <dt>store.voice.status</dt>
              <dd>{String(realState?.voice?.status)}</dd>
              <dt>store.voice.lastCommand</dt>
              <dd>{String(realState?.voice?.lastCommand)}</dd>
              <dt>store.voice.supported</dt>
              <dd>{String(realState?.voice?.supported)}</dd>
              <dt>store.toast</dt>
              <dd>
                {toasts.length} 条{toasts.length ? ` ｜ 最后：${toasts[toasts.length - 1].text}（${toasts[toasts.length - 1].level}）` : ""}
              </dd>
            </dl>
          ) : null}
          <button
            type="button"
            className="tool"
            style={{ marginTop: 12 }}
            onClick={() => {
              setCar(createFakeCarState());
              if (mode === "real") carStore.getState().closeAll();
            }}
          >
            复位状态
          </button>
        </section>

        <section className="card">
          <h2>⑤ parseCommand 用例（{caseReport.passed}/{caseReport.total}）</h2>
          <div className="summary">
            {groups.map(([group, bucket]) => (
              <span key={group} className={bucket.pass === bucket.total ? "ok" : "bad"}>
                {group} {bucket.pass}/{bucket.total}
              </span>
            ))}
          </div>
          <p className={`case-carcfg ${caseReportCfg.failed.length ? "bad" : "ok"}`} style={{ margin: "0 0 8px" }}>
            carConfig 词表（B 段实际使用的词表）：{caseReportCfg.passed}/{caseReportCfg.total}
            {caseReportCfg.failed.length ? ` ｜ 失败：${caseReportCfg.failed.map((item) => item.text).join("、")}` : " 通过"}
          </p>
          {caseReport.failed.length ? (
            <table>
              <thead>
                <tr>
                  <th>用例</th>
                  <th>期望</th>
                  <th>实际</th>
                </tr>
              </thead>
              <tbody>
                {caseReport.failed.map((item) => (
                  <tr key={`${item.group}-${item.text}`}>
                    <td>{item.text || "（空）"}</td>
                    <td className="mono">{JSON.stringify(item.expect)}</td>
                    <td className="mono">{JSON.stringify(item.actual)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="sub" style={{ margin: 0 }}>
              全部用例通过。
            </p>
          )}
        </section>

        <section className="card">
          <h2>⑥ 事件日志</h2>
          <pre className="log">{logs.join("\n") || "（暂无）"}</pre>
        </section>
      </div>
    </div>
  );
}

createRoot(document.getElementById("cd-voice-sandbox-root")).render(
  <React.StrictMode>
    <Sandbox />
  </React.StrictMode>,
);
