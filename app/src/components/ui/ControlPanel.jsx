import React, { useCallback, useMemo, useState } from "react";
import { GlassSwitch } from "./GlassSwitch";
import { PartButton } from "./PartButton";
import { STRINGS } from "./strings";

// T4 · 中文中控控制面板（纯展示组件，由 props 驱动；不读 store）
//
// props（全部为可选，缺省时按空态渲染）：
//   carName      string   车辆状态标题主名（carConfig.CAR_NAME）
//   carYear      string   年份副标
//   groups       Array    carConfig.PART_GROUPS      → [{ id, label, order }]
//   parts        Array    carConfig.PARTS            → [{ id, group, label }]
//   partStates   Object   store.parts                → { [partId]: boolean }
//   lights       Array    carConfig.LIGHTS           → [{ id, label }]
//   lightStates  Object   store.lights               → { [lightId]: boolean }
//   cameraViews  Array    carConfig.CAMERA_VIEWS     → [{ id, label, order }]
//   cameraView   string   store.cameraView
//   autoRotate   boolean  store.autoRotate
//   onTogglePart (id) => void
//   onOpenGroup  (groupId) => void
//   onCloseGroup (groupId) => void
//   onCloseAll   () => void
//   onToggleLight(id) => void
//   onSetCameraView(viewId) => void
//   onOrbitOnce  () => void
//   onSetAutoRotate(on) => void
//   onInteract   () => void   每次用户交互后调用（接线阶段接 store.bumpInteraction）
//   voiceSlot    ReactNode    语音容器位；不传则渲染中文占位（T6 的 VoiceButton 挂这里）
//   defaultOpen  boolean      可选：强制初始展开/收起；不传时按断点决定
//                             （≥ 40rem 展开、手机收起，与 style.css 的断点一致）
//
// 覆盖的 store 动作：togglePart / openGroup / closeGroup / closeAll /
//                   toggleLight / setCameraView / orbitOnce / setAutoRotate

const PART_KIND_BY_GROUP = { windows: "window", doors: "door", closures: "closure" };

export function ControlPanel({
  carName = "",
  carYear = "",
  groups = [],
  parts = [],
  partStates = {},
  lights = [],
  lightStates = {},
  cameraViews = [],
  cameraView = "",
  autoRotate = false,
  onTogglePart,
  onOpenGroup,
  onCloseGroup,
  onCloseAll,
  onToggleLight,
  onSetCameraView,
  onOrbitOnce,
  onSetAutoRotate,
  onInteract,
  voiceSlot = null,
  defaultOpen,
}) {
  // 初始展开态：宿主未指定时按断点决定（与 style.css 的 40rem 断点一致）
  const [open, setOpen] = useState(() => {
    if (typeof defaultOpen === "boolean") return defaultOpen;
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia("(min-width: 40rem)").matches;
  });

  // 每次交互都通知宿主（待机自转的复位信号，§13.2 bumpInteraction）
  const interact = useCallback(() => onInteract?.(), [onInteract]);

  const orderedGroups = useMemo(
    () => [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [groups],
  );
  const orderedViews = useMemo(
    () => [...cameraViews].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [cameraViews],
  );

  const openPartCount = parts.reduce((sum, part) => sum + (partStates[part.id] ? 1 : 0), 0);
  const anyLightOn = lights.some((light) => lightStates[light.id]);
  const statusText = openPartCount === 0 && !anyLightOn
    ? STRINGS.panel.statusAllClosed
    : STRINGS.panel.statusOpened(openPartCount, parts.length);

  const handleToggleOpen = () => {
    interact();
    setOpen((value) => !value);
  };
  const handleTogglePart = (id) => {
    interact();
    onTogglePart?.(id);
  };
  const handleGroup = (groupId, shouldOpen) => {
    interact();
    if (shouldOpen) onOpenGroup?.(groupId);
    else onCloseGroup?.(groupId);
  };
  const handleToggleLight = (id) => {
    interact();
    onToggleLight?.(id);
  };
  const handleCameraView = (id) => {
    interact();
    onSetCameraView?.(id);
  };
  const handleOrbitOnce = () => {
    interact();
    onOrbitOnce?.();
  };
  const handleAutoRotate = () => {
    interact();
    onSetAutoRotate?.(!autoRotate);
  };
  const handleCloseAll = () => {
    interact();
    onCloseAll?.();
  };

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
            <h1 className="cd-ui-panel__title">{STRINGS.panel.title(carName, carYear)}</h1>
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

            {orderedGroups.map((group) => {
              const groupParts = parts.filter((part) => part.group === group.id);
              if (groupParts.length === 0) return null;
              const openedInGroup = groupParts.reduce(
                (sum, part) => sum + (partStates[part.id] ? 1 : 0),
                0,
              );
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
                        open={Boolean(partStates[part.id])}
                        kind={PART_KIND_BY_GROUP[group.id] ?? "closure"}
                        onToggle={() => handleTogglePart(part.id)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}

            {lights.length > 0 && (
              <section className="cd-ui-section">
                <div className="cd-ui-section__head">
                  <h2 className="cd-ui-section__title">{STRINGS.lights.title}</h2>
                </div>
                <div className="cd-ui-switch-list">
                  {lights.map((light) => (
                    <div className="cd-ui-switch-row" key={light.id}>
                      <span className="cd-ui-switch-row__text">
                        <strong>{light.label}</strong>
                        <small>{STRINGS.lights.hints[light.id] ?? ""}</small>
                      </span>
                      <GlassSwitch
                        checked={Boolean(lightStates[light.id])}
                        label={STRINGS.lights.switchAria(light.label)}
                        onChange={() => handleToggleLight(light.id)}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {orderedViews.length > 0 && (
              <section className="cd-ui-section">
                <div className="cd-ui-section__head">
                  <h2 className="cd-ui-section__title">{STRINGS.camera.title}</h2>
                </div>
                <div className="cd-ui-camera-grid" role="group" aria-label={STRINGS.camera.ariaLabel}>
                  {orderedViews.map((view) => (
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
            )}

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
