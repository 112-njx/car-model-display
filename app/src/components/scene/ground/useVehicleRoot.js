import { useEffect, useState } from "react";
import { useThree } from "@react-three/fiber";

// 车模根节点的识别信号，按可靠性排序：
//   信号 1 —— VehicleModel 在 DEV 下写入的 `globalThis.__formdriveModelScene`（模型内部 scene），
//             其 parent 即 `<group ref>` 根节点。生产构建下该全局不存在。
//   信号 2 —— 根 scene 的直接子树中 mesh 数量最多者。车模必然是 mesh 最多的那棵子树，
//             阈值 4 用于排除地面/光带等场景件。
// 两者都拿不到时返回 null —— 调用方必须优雅降级，绝不抛错。
const MIN_VEHICLE_MESHES = 4;

function countMeshes(root) {
  let count = 0;
  root.traverse((object) => {
    if (object.isMesh) count += 1;
  });
  return count;
}

export function findVehicleRoot(scene) {
  if (!scene) return null;

  const audited = globalThis.__formdriveModelScene;
  if (audited && audited.parent) return audited.parent;

  let best = null;
  let bestCount = 0;
  for (const child of scene.children) {
    const count = countMeshes(child);
    if (count > bestCount) {
      bestCount = count;
      best = child;
    }
  }
  return bestCount >= MIN_VEHICLE_MESHES ? best : null;
}

/**
 * 探测车模根节点。GLB 是异步加载的，挂载瞬间通常还拿不到，
 * 因此在若干帧内轮询，命中即停。
 *
 * @param {boolean} enabled 为 false 时不探测（低质量档关闭反射时省掉整段开销）
 * @returns {import("three").Object3D | null}
 */
export function useVehicleRoot(enabled = true) {
  const scene = useThree((state) => state.scene);
  const [root, setRoot] = useState(null);

  useEffect(() => {
    if (!enabled) {
      setRoot(null);
      return undefined;
    }
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    // 上限约 6 秒（60fps 下 360 帧）：21 MiB 的 GLB 在慢网络下可能更久，
    // 超时后静默放弃倒影，不影响场景其余部分。
    const MAX_ATTEMPTS = 360;

    const probe = () => {
      if (cancelled) return;
      const found = findVehicleRoot(scene);
      if (found) {
        setRoot(found);
        return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) frame = requestAnimationFrame(probe);
    };
    probe();

    return () => {
      cancelled = true;
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scene, enabled]);

  return root;
}
