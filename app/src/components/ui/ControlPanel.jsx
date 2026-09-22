import React, { useCallback, useState } from "react";
import { CAR_NAME, LIGHTS, PART_GROUPS, PARTS, CAMERA_VIEWS } from "../../config/carConfig";
import { useCarStore } from "../../state/useCarStore";
import { GlassSwitch } from "./GlassSwitch";
import { PartButton } from "./PartButton";
import { STRINGS } from "./strings";

// T4 · 中文中控控制面板（store 连接版，B 段）
//
// 挂载：`<ControlPanel />`（无必需 props）。组件直接读写 §13.2 的 useCarStore，
//       部件/灯光/视角清单来自 §13.1 的 carConfig，不硬编码任何部件事实。
//
// props（全部可选）：
//   voiceSlot   ReactNode  语音容器位；不传则渲染中文占位（T8 把 T6 的 VoiceButton 挂这里）
//   defaultOpen boolean    强制初始展开/收起；不传时按断点决定（≥40rem 展开、手机收起）
//
// 覆盖的 store 动作：togglePart / openGroup / closeGroup / closeAll / toggleLight /
//                   setCameraView / orbitOnce / setAutoRotate / pushToast / bumpInteraction
//
// 纪律：
//   1. 每个用户输入都调 `bumpInteraction()`（§13.2：命令型 action 不隐式 bump，输入层负责）；
//   2. Toast 文案取自 `strings.js`，与 T5 点击拾取、T6 语音共用同一张表，保证三通道反馈一致；
//   3. 本组件是「UI 通道」的 Toast 唯一发出点，T5/T6 各自发各自的，不重复。

const PART_KIND_BY_GROUP = { windows: "window", doors: "door", closures: "closure" };

export function ControlPanel({ voiceSlot = null, defaultOpen }) {
  // 初始展开态：宿主未指定时按断点决定（与 style.css 的 40rem 断点一致）
  const [open, setOpen] = useState(() => {
    if (typeof defaultOpen === "boolean") return defaultOpen;
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(min-width: 40rem)").matches;
  });

  const parts = useCarStore((state) => state.parts);
  const lights = useCarStore((state) => state.lights);
  const cameraView = useCarStore((state) => state.cameraView);
  const autoRotate = useCarStore((state) => state.autoRotate);

  const togglePart = useCarStore((state) => state.togglePart);
  const openGroup = useCarStore((state) => state.openGroup);
  const closeGroup = useCarStore((state) => state.closeGroup);
  const closeAll = useCarStore((state) => state.closeAll);
  const toggleLight = useCarStore((state) => state.toggleLight);
  // T8 集成期改调 applyCameraView（CHANGELOG 0011/0019）：带自增令牌，
  // 使「拖走后点复位」这类同值重复下发也能可靠到位。setCameraView 语义未变，仍在契约中。
  const applyCameraView = useCarStore((state) => state.applyCameraView);
  const orbitOnce = useCarStore((state) => state.orbitOnce);
  const setAutoRotate = useCarStore((state) => state.setAutoRotate);
  const pushToast = useCarStore((state) => state.pushToast);
  const bumpInteraction = useCarStore((state) => state.bumpInteraction);

  const openPartCount = PARTS.reduce((sum, part) => sum + (parts[part.id] ? 1 : 0), 0);
  const anyLightOn = LIGHTS.some((light) => lights[light.id]);
  const statusText = openPartCount === 0 && !anyLightOn
    ? STRINGS.panel.statusAllClosed
    : STRINGS.panel.statusOpened(openPartCount, PARTS.length);

  // ── 事件处理：先 bumpInteraction（待机自转复位），再执行动作，最后中文反馈 ──

  const handleToggleOpen = useCallback(() => {
    bumpInteraction();
    setOpen((value) => !value);
  }, [bumpInteraction]);

  const handleTogglePart = useCallback((id) => {
    bumpInteraction();
    const label = PARTS.find((part) => part.id === id)?.label ?? id;
    const willOpen = !useCarStore.getState().parts[id];
    togglePart(id);
    pushToast(willOpen ? STRINGS.toast.partOpened(label) : STRINGS.toast.partClosed(label), willOpen ? "success" : "info");
  }, [bumpInteraction, togglePart, pushToast]);

  const handleGroup = useCallback((groupId, shouldOpen) => {
    bumpInteraction();
    const label = PART_GROUPS.find((group) => group.id === groupId)?.label ?? groupId;
    if (shouldOpen) openGroup(groupId);
    else closeGroup(groupId);
    pushToast(shouldOpen ? STRINGS.toast.groupOpened(label) : STRINGS.toast.groupClosed(label), shouldOpen ? "success" : "info");
  }, [bumpInteraction, openGroup, closeGroup, pushToast]);

  const handleToggleLight = useCallback((id) => {
    bumpInteraction();
    const label = LIGHTS.find((light) => light.id === id)?.label ?? id;
    const willOpen = !useCarStore.getState().lights[id];
    toggleLight(id);
    pushToast(willOpen ? STRINGS.toast.lightOn(label) : STRINGS.toast.lightOff(label), willOpen ? "success" : "info");
  }, [bumpInteraction, toggleLight, pushToast]);

  const handleCameraView = useCallback((id) => {
    bumpInteraction();
    const label = CAMERA_VIEWS.find((view) => view.id === id)?.label ?? id;
    applyCameraView(id);
    pushToast(STRINGS.toast.cameraView(label));
  }, [bumpInteraction, applyCameraView, pushToast]);

  const handleOrbitOnce = useCallback(() => {
    bumpInteraction();
    orbitOnce();
    pushToast(STRINGS.toast.orbitOnce);
  }, [bumpInteraction, orbitOnce, pushToast]);

  const handleAutoRotate = useCallback(() => {
    bumpInteraction();
    const willOpen = !useCarStore.getState().autoRotate;
    setAutoRotate(willOpen);
    pushToast(willOpen ? STRINGS.toast.autoRotateOn : STRINGS.toast.autoRotateOff);
  }, [bumpInteraction, setAutoRotate, pushToast]);

  const handleCloseAll = useCallback(() => {
    bumpInteraction();
    closeAll();
    pushToast(STRINGS.toast.allClosed, "success");
  }, [bumpInteraction, closeAll, pushToast]);

  return (
    <>
      <aside
        id="studio-controls"
        className={`cd-ui-panel${open ? "" : " is-collapsed"}`}
        aria-label={STRINGS.panel.ariaLabel}
      >
        <header className="cd-ui-panel__head">
          <div className="cd-ui-panel__heading">
            <p className="cd-ui-panel__eyebrow">{STRINGS.panel.eyebrow}</p>
            <h1 className="cd-ui-panel__title">{CAR_NAME}</h1>
            <p className="cd-ui-panel__status">{statusText}</p>
          </div>
          <button
            type="button"
            className="cd-ui-panel__toggle"
            aria-expanded={open}
            aria-controls="cd-ui-panel-body"
            aria-label={open ? STRINGS.panel.collapse : STRINGS.panel.expand}
            onClick={handleToggleOpen}
          >
            <span className="cd-ui-panel__toggle-text">
              {open ? STRINGS.panel.collapse : STRINGS.panel.expand}
            </span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5" /></svg>
          </button>
        </header>

        <div className="cd-ui-panel__body" id="cd-ui-panel-body">
          <div className="cd-ui-panel__inner">
            {/* 语音容器位：T6 的 VoiceButton 由 T8 作为 voiceSlot 传入 */}
            <div className="cd-ui-voice-slot" data-voice-slot="" aria-label={STRINGS.voice.slotLabel}>
              {voiceSlot ?? <span className="cd-ui-voice-slot__placeholder">{STRINGS.voice.placeholder}</span>}
            </div>

            {PART_GROUPS.map((group) => {
              const groupParts = PARTS.filter((part) => part.group === group.id);
              if (groupParts.length === 0) return null;
              const openedInGroup = groupParts.reduce((sum, part) => sum + (parts[part.id] ? 1 : 0), 0);
              return (
                <section className="cd-ui-section" key={group.id}>
                  <div className="cd-ui-section__head">
                    <h2 className="cd-ui-section__title">
                      {group.label}
                      <span className="cd-ui-section__count">{openedInGroup}/{groupParts.length}</span>
                    </h2>
                    <div className="cd-ui-section__tools">
                      <button
                        type="button"
                        className="cd-ui-mini"
                        aria-label={STRINGS.groups.openAllAria(group.label)}
                        onClick={() => handleGroup(group.id, true)}
                      >
                        {STRINGS.groups.openAll}
                      </button>
                      <button
                        type="button"
                        className="cd-ui-mini"
                        aria-label={STRINGS.groups.closeAllAria(group.label)}
                        onClick={() => handleGroup(group.id, false)}
                      >
                        {STRINGS.groups.closeAll}
                      </button>
                    </div>
                  </div>
                  <div className="cd-ui-part-grid">
                    {groupParts.map((part) => (
                      <PartButton
                        key={part.id}
                        label={part.label}
                        open={Boolean(parts[part.id])}
                        kind={PART_KIND_BY_GROUP[group.id] ?? "closure"}
                        onToggle={() => handleTogglePart(part.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            <section className="cd-ui-section">
              <div className="cd-ui-section__head">
                <h2 className="cd-ui-section__title">{STRINGS.lights.title}</h2>
              </div>
              <div className="cd-ui-switch-list">
                {LIGHTS.map((light) => (
                  <div className="cd-ui-switch-row" key={light.id}>
                    <span className="cd-ui-switch-row__text">
                      <strong>{light.label}</strong>
                      <small>{STRINGS.lights.hints[light.id] ?? ""}</small>
                    </span>
                    <GlassSwitch
                      checked={Boolean(lights[light.id])}
                      label={STRINGS.lights.switchAria(light.label)}
                      onChange={() => handleToggleLight(light.id)}
                    />
                  </div>
                ))}
              </div>
            </section>

            <section className="cd-ui-section">
              <div className="cd-ui-section__head">
                <h2 className="cd-ui-section__title">{STRINGS.camera.title}</h2>
              </div>
              <div className="cd-ui-camera-grid" role="group" aria-label={STRINGS.camera.ariaLabel}>
                {CAMERA_VIEWS.map((view) => (
                  <button
                    key={view.id}
                    type="button"
                    className={`cd-ui-camera${cameraView === view.id ? " is-active" : ""}`}
                    aria-pressed={cameraView === view.id}
                    aria-label={STRINGS.camera.viewAria(view.label)}
                    onClick={() => handleCameraView(view.id)}
                  >
                    {view.label}
                  </button>
                ))}
              </div>
              <button type="button" className="cd-ui-action" onClick={handleOrbitOnce}>
                {STRINGS.camera.orbitOnce}
                <small>{STRINGS.camera.orbitOnceHint}</small>
              </button>
              <div className="cd-ui-switch-row">
                <span className="cd-ui-switch-row__text">
                  <strong>{STRINGS.camera.autoRotate}</strong>
                  <small>{STRINGS.camera.autoRotateHint}</small>
                </span>
                <GlassSwitch
                  checked={Boolean(autoRotate)}
                  label={STRINGS.camera.autoRotate}
                  onChange={handleAutoRotate}
                />
              </div>
            </section>

            <button type="button" className="cd-ui-close-all" onClick={handleCloseAll}>
              <span>{STRINGS.actions.closeAll}</span>
              <small>{STRINGS.actions.closeAllHint}</small>
            </button>
          </div>
        </div>
      </aside>

      <p className="cd-ui-gesture-hint">{STRINGS.gesture}</p>
    </>
  );
}
