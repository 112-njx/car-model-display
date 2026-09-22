import { useEffect, useState } from "react";

/**
 * StrictMode 安全的程序化纹理生命周期。
 *
 * 纹理在 effect **内部**创建、在 cleanup 内释放，因此每次 effect 运行都持有自己的
 * 实例，dispose 永远不会作用到仍被材质引用的纹理上。
 *
 * 反例（本项目踩过的坑）：把纹理建在 `useMemo` 里、在 effect cleanup 里 dispose。
 * `main.jsx` 用了 `<StrictMode>`，dev 下 effect 会「执行 → cleanup → 再执行」，
 * 而 **useMemo 不会重算** —— cleanup 释放掉的正是 memo 里那个仍被材质引用的纹理。
 * WebGPU 后端随后抛 `TypeError: Invalid value used as weak map key`
 * （栈：Bindings._init → Textures.updateTexture → WeakMap.set(undefined)）。
 * 该异常抛在渲染调用内部，**会直接打死 R3F 的渲染循环，整个场景冻结**。
 *
 * @param {() => import("three").Texture} create 创建纹理的工厂
 * @param {unknown[]} deps 重建条件（同 useEffect 语义）
 * @returns {import("three").Texture | null} 首帧为 null，effect 运行后可用
 */
export function useCanvasTexture(create, deps) {
  const [texture, setTexture] = useState(null);

  useEffect(() => {
    const created = create();
    setTexture(created);
    return () => {
      setTexture(null);
      created.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return texture;
}
