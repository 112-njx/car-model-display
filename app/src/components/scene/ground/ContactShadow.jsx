import React from "react";
import { CanvasTexture, ClampToEdgeWrapping, LinearFilter } from "three";
import { ENV_COLORS } from "./envTheme";
import { useCanvasTexture } from "./useCanvasTexture";

// 车底接触阴影（AO blob）。
//
// 为什么不用阴影贴图就够：地面是半透明的，阴影贴图的暗部会随 alpha 一起被混合削弱，
// 车「贴地」的感觉出不来。这里补一层独立于光照的软暗斑，让车身稳稳压在地面上。
// 纯贴图 + MeshBasicMaterial，对 WebGPU 完全安全。
//
// 车模经 VehicleModel 居中处理，水平位置恒为原点，因此暗斑固定放在 (0, 0)。
const TEXTURE_SIZE = 256;

function createBlobTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(
    TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, 0,
    TEXTURE_SIZE / 2, TEXTURE_SIZE / 2, TEXTURE_SIZE / 2,
  );
  gradient.addColorStop(0, "rgba(0,0,0,0.92)");
  gradient.addColorStop(0.42, "rgba(0,0,0,0.62)");
  gradient.addColorStop(0.72, "rgba(0,0,0,0.22)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.minFilter = LinearFilter;
  texture.magFilter = LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * @param {[number, number]} [props.size=[7.6, 3.5]] 暗斑的 [长, 宽]，略大于车身
 * @param {number} [props.opacity=0.72]
 */
export function ContactShadow({ size = [7.6, 3.5], opacity = 0.72 }) {
  const texture = useCanvasTexture(createBlobTexture, []);

  return (
    <mesh name="cd-env-contact-shadow" rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]} renderOrder={2}>
      <planeGeometry args={size} />
      <meshBasicMaterial
        map={texture}
        color={ENV_COLORS.contactShadow}
        transparent
        opacity={opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
