import { defineConfig } from "vite";

// T10a（交付准备，由 T8 代做）：把 base 从「GitHub Actions 下写死 /FormDrive/」改为**相对路径 `./`**。
//
// 为什么：本项目要"手机 + 电脑网页直接打开"，交付形态有三种——
//   ① 本地 `dist` 双击打开（file://）——**只有相对路径能工作**，绝对 `/assets/...` 在 file:// 下必然 404；
//   ② 托管在任意子路径（GitHub Pages 的 /<repo>/、Vercel 的根路径、内网静态服务器的任意目录）；
//   ③ 开发服务器。
// `base: './'` 同时覆盖三者，且不再需要判断 `process.env.GITHUB_ACTIONS`——原先那个分支正是
// 为了 Pages 子路径而写的，相对路径让它变成多余（同时也修掉了"本地构建也会带上 /FormDrive/ 前缀"的隐患）。
//
// 资源 URL 的消费方 `carConfig.js` 的 `assetUrl()` 用的是 `import.meta.env.BASE_URL`，
// 因此 `./models/tesla-model-3-2018.glb` 会随之变成相对路径，无需额外改动。
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
