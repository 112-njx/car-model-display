/**
 * T6 语音控车 · 自测沙盒入口（由 voice.sandbox.html 加载）
 *
 * 契约无关：本页**不 import 主应用的 store / App / 场景**，只用自己的「假车状态」承接 executePlan，
 * 因此可在 T2 的 carConfig / useCarStore 落地之前独立自测整条链路。
 *
 * 自测能力：
 *   1. 能力探测结果（supported / secure / injected / 中文降级文案）
 *   2. 真实麦克风链路（需 https 或 localhost 的 Chrome / Edge）
 *   3. mock 注入链路：用 setRecognitionCtor 注入回放 mock（等价于 §13.3 ④ 的注入点）
 *   4. 降级路径：强制「不支持」「非安全上下文」
 *   5. 手动输入指令（headless 环境无麦克风时的主要自测手段）
 *   6. 80 条 parseCommand 用例一键跑
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_VOCABULARY, describeActions, executePlan } from "./commands.js";
import { parseAlternatives, parseCommandDetailed } from "./parseCommand.js";
import { runCommandCases } from "./commandCases.js";
import {
  VoiceRecognizer,
  detectSupport,
  queryMicrophonePermission,
  requestMicrophonePermission,
  setRecognitionCtor,
  setSupportOverrideForTest,
} from "./recognition.js";
import { isSpeechSynthesisSupported, speak, cancelSpeech } from "./synthesis.js";
import { VoiceButton } from "./VoiceButton.jsx";

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

function Sandbox() {
  const [support, setSupport] = useState(() => detectSupport());
  const [permission, setPermission] = useState("unknown");
  const [status, setStatus] = useState(() => (detectSupport().supported ? "idle" : "unsupported"));
  const [transcript, setTranscript] = useState("");
  const [reply, setReply] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [injected, setInjected] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const [manual, setManual] = useState("打开左前车窗");
  const [car, setCar] = useState(createFakeCarState);
  const [logs, setLogs] = useState([]);

  const recognizerRef = useRef(null);

  const log = useCallback((text) => {
    const stamp = new Date().toLocaleTimeString("zh-CN", { hour12: false });
    setLogs((prev) => [`[${stamp}] ${text}`, ...prev].slice(0, 120));
  }, []);

  const refreshSupport = useCallback(() => {
    const next = detectSupport();
    setSupport(next);
    setStatus((current) => {
      if (!next.supported) return "unsupported";
      return current === "unsupported" ? "idle" : current;
    });
    return next;
  }, []);

  // ── 假 store 的 action（名字与 §13.2 一致，便于 B 段原样替换为真实 store）──
  const api = useMemo(
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

  // ── 一条识别结果 → 解析 → 执行 → 回执 ──
  const handleAlternatives = useCallback(
    (alternatives, source) => {
      const detailed = parseAlternatives(alternatives, { vocabulary: VOCAB });
      setTranscript(detailed.text || (alternatives && alternatives[0]) || "");
      if (!detailed.actions.length) {
        setReply("");
        setHint(detailed.hint || "");
        log(`${source} 未执行（${detailed.reason}）：${detailed.hint}`);
        return;
      }
      setHint("");
      executePlan(detailed.actions, api);
      const text = describeActions(detailed.actions, { vocabulary: VOCAB });
      setReply(text);
      log(`${source} 执行：${text}（${detailed.actions.length} 个动作）`);
      if (speechEnabled) speak(text);
    },
    [api, log, speechEnabled],
  );

  // ── 识别器（真实或注入的 mock 都走同一条链路）──
  const getRecognizer = useCallback(() => {
    if (recognizerRef.current) return recognizerRef.current;
    const recognizer = new VoiceRecognizer({ restartDelayMs: 400 });
    recognizer.on("status", ({ state }) => {
      if (state === "starting") setStatus("requesting");
      else setStatus(state);
      log(`状态 → ${state}`);
    });
    recognizer.on("interim", ({ transcript: text }) => setTranscript(text));
    recognizer.on("result", ({ alternatives }) => {
      handleAlternatives(alternatives, "识别");
      // 连续聆听：处理完立刻回到聆听态
      setTimeout(() => setStatus((current) => (current === "processing" ? "listening" : current)), 0);
    });
    recognizer.on("error", ({ message, fatal, permission: isPermission }) => {
      setError(message);
      log(`错误：${message}`);
      if (isPermission) setPermission("denied");
      if (fatal) setStatus("error");
    });
    recognizer.on("end", ({ reason }) => log(`会话结束：${reason}`));
    recognizerRef.current = recognizer;
    return recognizer;
  }, [handleAlternatives, log]);

  const handleToggle = useCallback(async () => {
    const recognizer = getRecognizer();
    if (recognizer.state === "listening" || recognizer.state === "processing" || recognizer.wantListening) {
      recognizer.stop();
      setStatus("idle");
      setTranscript("");
      log("用户停止聆听");
      return;
    }
    setError("");
    setHint("");
    setStatus("requesting");
    const result = await requestMicrophonePermission();
    setPermission(result.state);
    if (!result.ok) {
      setStatus("error");
      setError(result.message || "麦克风不可用。");
      log(`权限请求失败：${result.state}`);
      return;
    }
    if (!recognizer.start()) {
      setStatus("error");
      log("识别器启动失败（能力探测未通过）");
      return;
    }
    log("开始聆听");
  }, [getRecognizer, log]);

  const handleManual = useCallback(() => {
    const text = manual.trim();
    if (!text) return;
    handleAlternatives([text], "手动输入");
  }, [handleAlternatives, manual]);

  const handleInject = useCallback(() => {
    setRecognitionCtor(createReplayMockClass(log));
    setInjected(true);
    refreshSupport();
    log("已注入回放 mock（等价 __carDisplayVoiceInject(ctor)），voice.supported 应为 true");
  }, [log, refreshSupport]);

  const handleRestore = useCallback(() => {
    setRecognitionCtor(null);
    setInjected(false);
    recognizerRef.current = null;
    refreshSupport();
    setStatus(detectSupport().supported ? "idle" : "unsupported");
    log("已恢复真实 SpeechRecognition");
  }, [log, refreshSupport]);

  const handleOverride = useCallback(
    (code) => {
      setSupportOverrideForTest(code);
      setStatus("unsupported");
      recognizerRef.current = null;
      refreshSupport();
      log(`强制降级：${code || "关闭"}`);
    },
    [log, refreshSupport],
  );

  useEffect(() => {
    const timer = setTimeout(refreshSupport, 0);
    queryMicrophonePermission().then(({ state }) => setPermission(state));
    return () => {
      clearTimeout(timer);
      cancelSpeech();
      if (recognizerRef.current) recognizerRef.current.destroy();
    };
  }, [refreshSupport]);

  const caseReport = useMemo(() => runCommandCases({ vocabulary: VOCAB }), []);
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

  return (
    <div>
      <div className="toolbar">
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
            <dd className={support.supported ? "ok" : "bad"}>{String(support.supported)}</dd>
            <dt>secure</dt>
            <dd className={support.secure ? "ok" : "warn"}>{String(support.secure)}</dd>
            <dt>injected</dt>
            <dd className={support.injected ? "ok" : ""}>{String(support.injected)}</dd>
            <dt>code</dt>
            <dd>{support.code}</dd>
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
          <h2>② 语音控车（VoiceButton）</h2>
          <VoiceButton
            status={status}
            supported={support.supported}
            transcript={transcript}
            reply={reply}
            hint={hint}
            message={support.message}
            error={error}
            onToggle={handleToggle}
            onRetry={handleToggle}
            speechEnabled={speechEnabled}
            onToggleSpeech={() => {
              setSpeechEnabled((value) => {
                if (value) cancelSpeech();
                return !value;
              });
            }}
            speechSupported={isSpeechSynthesisSupported()}
          />
          <p className="sub" style={{ marginTop: 12, marginBottom: 0 }}>
            状态：<strong>{status}</strong>
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
          <h2>④ 假车状态（executePlan 的结果）</h2>
          <div className="chips">
            {VOCAB.parts.map((part) => (
              <span key={part.id} className={`chip ${car.parts[part.id] ? "chip--open" : ""}`}>
                {part.label}
                {car.parts[part.id] ? " 开" : " 关"}
              </span>
            ))}
          </div>
          <div className="chips" style={{ marginTop: 8 }}>
            {VOCAB.lights.map((light) => (
              <span key={light.id} className={`chip ${car.lights[light.id] ? "chip--on" : ""}`}>
                {light.label}
                {car.lights[light.id] ? " 亮" : " 灭"}
              </span>
            ))}
            <span className="chip chip--open">视角：{car.cameraView}</span>
            <span className="chip">环绕次数：{car.orbits}</span>
            <span className="chip">bumpInteraction：{car.bumps}</span>
          </div>
          <button type="button" className="tool" style={{ marginTop: 12 }} onClick={() => setCar(createFakeCarState())}>
            复位假车状态
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
