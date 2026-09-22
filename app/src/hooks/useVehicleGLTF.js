import { useLoader } from "@react-three/fiber";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { carStore } from "../state/useCarStore.js";

let dracoLoader;

function configureLoader(loader) {
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.5/");
  }
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
}

// T8 集成期：字节级传输进度改写入 §13.2 的 `loading` 片（CHANGELOG 0013），
// 不再经兼容 shim。T4 的 LoadingScreen 直接订阅该片显示「X.X / Y.Y MB」。
function reportInitialTransfer(event) {
  if (!event.total) return;
  carStore.getState().setLoadingProgress({
    loadedBytes: event.loaded,
    totalBytes: event.total,
    progress: Math.min(100, (event.loaded / event.total) * 100),
  });
}

export function useVehicleGLTF(url, trackInitialTransfer = false) {
  return useLoader(
    GLTFLoader,
    url,
    configureLoader,
    trackInitialTransfer ? reportInitialTransfer : undefined,
  );
}
