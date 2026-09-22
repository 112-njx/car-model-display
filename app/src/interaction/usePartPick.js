/**
 * T5 3D 点击拾取 —— 手势判别 / 悬停高亮 / 中文 tooltip / 命中点反查 partKey。
 *
 * 与 OrbitControls 的关系：本 hook 只读取指针事件，不 stopPropagation / preventDefault，
 * 因此拖拽旋转照常工作；"旋转中不触发点击"由两条独立判据共同保证：
 *   ① pointerdown → pointerup 的位移与时长阈值（carConfig.INTERACTION）；
 *   ② 手势期间 OrbitControls 是否真的移动了相机（订阅 controls 的 change 事件）。
 * 触摸与鼠标走同一套 PointerEvent 路径，无需分支。
 *
 * 命中点反查一律用 §13.1 的 id（carConfig.PARTS 的键），不出现任何 GLB 节点名。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useThree } from "@react-three/fiber";
import { Color, Raycaster, Vector3 } from "three";
import { isTapGesture, pickPartId, raycasterFromScreen } from "./partMapping";

/** 悬停高亮色（中控青蓝），与 T4 主题一致 */
export const HOVER_COLOR = "#38bdf8";
const HOVER_EMISSIVE_INTENSITY = 0.9;
/** OrbitControls 判定"真的转动了"的相机位移阈值（世界单位，车长约 5.65） */
// T8 集成期注记：本阈值**不再参与点按判定**（原因见下方 endGesture 的长注释），
// 仅作为 DEV 诊断信号保留。故维持 T5 的原值不动，避免无谓的模块改动。
const CAMERA_DRAG_EPSILON = 0.01;
/** 指针在 canvas 内、且非拖拽时才更新悬停 */
const TOOLTIP_OFFSET = [14, 16];

function collectMaterials(descriptor) {
  const materials = new Set();
  descriptor?.meshes.forEach((mesh) => {
    (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => {
      if (material) materials.add(material);
    });
  });
  return materials;
}

export function usePartPick({
  hitAreas,
  interaction,
  onPick,
  onPointerActivity,
  enabled = true,
  tooltip = true,
  cursor = true,
  highlight = true,
} = {}) {
  const gl = useThree((state) => state.gl);
  const camera = useThree((state) => state.camera);
  const controls = useThree((state) => state.controls);

  const raycaster = useMemo(() => new Raycaster(), []);
  const gesture = useRef(null);
  const cameraMoved = useRef(false);
  const cameraAnchor = useRef({ position: new Vector3(), target: new Vector3() });
  const hoveredRef = useRef(null);
  const hoverFrame = useRef(0);
  const highlightRestore = useRef(new Map());
  const tooltipEl = useRef(null);
  const [hoveredId, setHoveredId] = useState(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onPointerActivityRef = useRef(onPointerActivity);
  onPointerActivityRef.current = onPointerActivity;

  const releaseHighlight = useCallback(() => {
    highlightRestore.current.forEach((snapshot, material) => {
      if (snapshot.emissive && material.emissive) material.emissive.copy(snapshot.emissive);
      material.emissiveIntensity = snapshot.emissiveIntensity;
    });
    highlightRestore.current.clear();
  }, []);

  const applyHighlight = useCallback((descriptor) => {
    const restore = highlightRestore.current;
    collectMaterials(descriptor).forEach((material) => {
      if (!restore.has(material)) {
        restore.set(material, {
          emissive: material.emissive ? material.emissive.clone() : null,
          emissiveIntensity: material.emissiveIntensity,
        });
      }
      if (!material.emissive) material.emissive = new Color();
      material.emissive.set(HOVER_COLOR);
      material.emissiveIntensity = HOVER_EMISSIVE_INTENSITY;
    });
  }, []);

  /** canvas 的 CSS 尺寸与视口偏移；hitTargets 的 screen 也用同一套坐标系 */
  const viewportOf = useCallback(() => {
    const rect = gl.domElement.getBoundingClientRect();
    return { width: rect.width || 1, height: rect.height || 1, left: rect.left, top: rect.top };
  }, [gl]);

  /** 视口坐标（clientX/clientY）→ 部件 id；自测与 T9 脚本也可直接调用 */
  const pickAt = useCallback((clientX, clientY) => {
    if (!hitAreas) return null;
    raycasterFromScreen({ x: clientX, y: clientY }, camera, viewportOf(), raycaster);
    return pickPartId({ raycaster, hitAreas });
  }, [camera, hitAreas, raycaster, viewportOf]);

  const clearHover = useCallback(() => {
    if (hoveredRef.current) {
      releaseHighlight();
      hoveredRef.current = null;
      setHoveredId(null);
    }
    if (tooltipEl.current) tooltipEl.current.style.display = "none";
    if (cursor) gl.domElement.style.cursor = "";
  }, [cursor, gl, releaseHighlight]);

  const showHover = useCallback((descriptor, clientX, clientY) => {
    if (hoveredRef.current !== descriptor.id) {
      releaseHighlight();
      if (highlight) applyHighlight(descriptor);
      hoveredRef.current = descriptor.id;
      setHoveredId(descriptor.id);
    }
    if (tooltip && tooltipEl.current) {
      const el = tooltipEl.current;
      el.textContent = descriptor.label;
      el.style.display = "block";
      el.style.left = `${clientX + TOOLTIP_OFFSET[0]}px`;
      el.style.top = `${clientY + TOOLTIP_OFFSET[1]}px`;
    }
    if (cursor) gl.domElement.style.cursor = "pointer";
  }, [applyHighlight, cursor, gl, highlight, releaseHighlight, tooltip]);

  // 中文部件名 tooltip：独立 DOM 节点 + 内联样式，不依赖任何全局 css 文件
  useEffect(() => {
    if (!tooltip) return undefined;
    const el = document.createElement("div");
    el.className = "cd-hit-tooltip";
    el.setAttribute("role", "tooltip");
    el.style.cssText = [
      "position:fixed", "left:0", "top:0", "display:none", "pointer-events:none", "z-index:60",
      "padding:6px 11px", "border-radius:8px", "white-space:nowrap",
      "background:rgba(7,18,28,0.88)", "color:#e6f6ff",
      "border:1px solid rgba(56,189,248,0.55)",
      "box-shadow:0 6px 22px rgba(0,0,0,0.45)",
      "backdrop-filter:blur(6px)", "-webkit-backdrop-filter:blur(6px)",
      "font:500 13px/1.4 system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif",
      "letter-spacing:0.02em", "transition:opacity 90ms linear",
    ].join(";");
    document.body.appendChild(el);
    tooltipEl.current = el;
    return () => {
      el.remove();
      tooltipEl.current = null;
    };
  }, [tooltip]);

  // 手势期间 OrbitControls 是否真的转动了相机
  useEffect(() => {
    if (!controls) return undefined;
    const anchor = cameraAnchor.current;
    const onChange = () => {
      if (!gesture.current) return;
      const moved = camera.position.distanceToSquared(anchor.position) > CAMERA_DRAG_EPSILON ** 2
        || (controls.target ? controls.target.distanceToSquared(anchor.target) > CAMERA_DRAG_EPSILON ** 2 : false);
      if (moved) cameraMoved.current = true;
    };
    controls.addEventListener("change", onChange);
    return () => controls.removeEventListener("change", onChange);
  }, [camera, controls]);

  useEffect(() => {
    if (!enabled || !hitAreas) return undefined;
    const dom = gl.domElement;

    const onPointerDown = (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      if (!event.isPrimary || gesture.current) {
        // 第二根手指落下 → 这是缩放/双指手势，作废当前点击候选
        if (gesture.current) gesture.current.invalid = true;
        return;
      }
      cameraAnchor.current.position.copy(camera.position);
      if (controls?.target) cameraAnchor.current.target.copy(controls.target);
      cameraMoved.current = false;
      // §13.2：所有用户输入（含指针）都必须 bumpInteraction()，是 T7 待机自转的复位信号
      onPointerActivityRef.current?.();
      gesture.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        time: performance.now(),
        invalid: false,
      };
    };

    const onPointerMove = (event) => {
      const active = gesture.current;
      if (active && event.pointerId === active.pointerId) {
        const moved = Math.hypot(event.clientX - active.x, event.clientY - active.y);
        if (moved > (interaction?.tapMaxMovePx ?? 6)) active.invalid = true;
      }
      if (active) {
        // 拖拽中不显示悬停反馈，避免旋转时高亮闪烁
        clearHover();
        return;
      }
      if (hoverFrame.current) return;
      const { clientX, clientY } = event;
      hoverFrame.current = window.requestAnimationFrame(() => {
        hoverFrame.current = 0;
        const hit = pickAt(clientX, clientY);
        if (!hit) {
          clearHover();
          return;
        }
        const descriptor = hitAreas.byId.get(hit.id);
        if (descriptor) showHover(descriptor, clientX, clientY);
      });
    };

    const endGesture = (event, commit) => {
      const active = gesture.current;
      if (!active || event.pointerId !== active.pointerId) return;
      gesture.current = null;
      if (!commit) return;
      const end = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
      // 点按判据 = 契约 §13.1 的 `INTERACTION.tapMaxMovePx` / `tapMaxDurationMs`（经 isTapGesture），
      // 外加"第二根手指落下"标记 active.invalid（双指缩放作废点击候选）。
      //
      // T8 集成期移除「相机被带动」硬否决（原为 `|| cameraMoved.current`）——它是**与契约冲突的第二判据**：
      // OrbitControls 开了 `enableDamping`，rotate 输入逐帧渐进，**手指停下后相机仍在继续转**。
      // 实测（390×844，`Input.dispatchTouchEvent`，页内埋点）：
      //   同样 2px 位移，127ms 时相机位移 0.109（通过）、186ms 时 0.1495、265ms 时 0.19（均被否决）；
      //   0px 位移则任何时长都不否决。
      // 即该否决实际退化成"**约 150ms 以上一律不算点按**"——比契约的 300ms 更严，
      // 真机上正常点按（手指自然按 200~400ms）会被全部吞掉，「点击车模控车」在手机上不可用。
      // 真实拖拽仍由位移阈值拦住：一次有意拖拽位移必然 > 6px → active.invalid。
      // `cameraMoved` 的采集代码保留，仅作 DEV 诊断信号，不再参与点按判定。
      if (active.invalid) return;
      if (!isTapGesture(active, end, interaction)) return;
      const hit = pickAt(active.x, active.y);
      if (hit) onPickRef.current?.(hit.id, hit);
    };

    const onPointerUp = (event) => endGesture(event, true);
    const onPointerCancel = (event) => endGesture(event, false);
    const onPointerLeave = () => {
      gesture.current = null;
      clearHover();
    };

    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("pointermove", onPointerMove);
    dom.addEventListener("pointerup", onPointerUp);
    dom.addEventListener("pointercancel", onPointerCancel);
    dom.addEventListener("pointerleave", onPointerLeave);
    return () => {
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("pointermove", onPointerMove);
      dom.removeEventListener("pointerup", onPointerUp);
      dom.removeEventListener("pointercancel", onPointerCancel);
      dom.removeEventListener("pointerleave", onPointerLeave);
      if (hoverFrame.current) window.cancelAnimationFrame(hoverFrame.current);
      hoverFrame.current = 0;
      clearHover();
    };
  }, [camera, clearHover, controls, enabled, gl, hitAreas, interaction, pickAt, showHover]);

  useEffect(() => () => releaseHighlight(), [releaseHighlight]);

  return { hoveredId, hoveredRef, pickAt, clearHover };
}
