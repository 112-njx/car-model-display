/**
 * WebGLFallback.jsx —— 图形能力不可用时的中文降级页（T8p，规格来源：§11.1 T8p ④）
 *
 * 触发条件由 PerfProvider 判定：**WebGL 与 WebGPU 都不可用**时才渲染本页
 * （只测 WebGL 会误伤"有 WebGPU、没 WebGL"的设备，理由见 graphicsSupport.js 顶部注释）。
 *
 * 设计取向：这是用户能看到的最后一道界面，因此
 *   - 全中文，不含任何英文残留（对齐 T4 的中文化要求）；
 *   - 不依赖任何 3D/WebGL 能力，纯 DOM + CSS，连 tokens.css 的变量都给了兜底值；
 *   - 给**可执行**的处置建议，而不是只说"不支持"。
 */

import React from "react";
import "./perf.css";

export function WebGLFallback({ reason = "" }) {
  return (
    <main className="cd-perf-fallback" aria-labelledby="cd-perf-fallback-title">
      <div className="cd-perf-fallback__card">
        <p className="cd-perf-fallback__kicker">三维车模展示</p>
        <h1 className="cd-perf-fallback__title" id="cd-perf-fallback-title">
          无法启动 3D 展示
        </h1>
        <p className="cd-perf-fallback__lead">
          当前浏览器或设备没有可用的 3D 渲染能力（WebGL 与 WebGPU 均不可用），
          因此车模无法显示。按下面任一条处理后再试即可。
        </p>

        <ul className="cd-perf-fallback__list">
          <li>改用最新版的 Chrome 或 Edge 浏览器打开本页。</li>
          <li>在浏览器设置中开启「使用硬件加速」，然后完全重启浏览器。</li>
          <li>更新显卡驱动后重试。</li>
          <li>关闭浏览器的「省电模式」「流量节省」等限制渲染的模式。</li>
          <li>若是在微信、QQ 等应用的内置浏览器中打开，请改用系统浏览器打开。</li>
        </ul>

        <button
          className="cd-perf-fallback__retry"
          type="button"
          onClick={() => window.location.reload()}
        >
          重新检测
        </button>

        {reason ? (
          <details className="cd-perf-fallback__details">
            <summary>技术细节</summary>
            <p>
              渲染能力探测结果：<code>{reason}</code>
            </p>
          </details>
        ) : null}
      </div>
    </main>
  );
}
