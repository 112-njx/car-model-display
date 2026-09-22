import { defineConfig } from "vite";

// T10a：base 固定为相对路径 './' —— dist 产物可被任意静态托管（Vercel / GitHub Pages /
// 本地 file:// 直接打开）按相对路径加载，不依赖部署域名。单页 demo 无前端路由，
// 相对 base 在子路径部署下同样正确。
export default defineConfig({
  base: "./",
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          three: ["three", "@react-three/fiber", "@react-three/drei"],
          state: ["zustand"],
        },
      },
    },
  },
});
