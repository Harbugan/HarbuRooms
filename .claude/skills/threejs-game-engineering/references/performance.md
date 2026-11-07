# Browser 3D performance

- Start with a baseline: frame time (not FPS alone), 1% low or spikes, renderer.info counts, memory estimates, viewport resolution and test hardware/browser.
- Identify bottleneck before optimizing: CPU generation/update, draw submission, fragment fill/overdraw, shader work, shadow maps, postprocessing or allocations/GC.
- Use instancing or geometry batching when it fits material and update constraints; avoid merging everything if streaming or per-object interaction requires independent lifetime.
- Apply distance culling, active-world budgets and sensible pixel ratio limits based on visual impact. Do not indiscriminately lower quality.
- Limit texture size and render-target count; verify mipmaps, compression support and GPU memory tradeoffs.
- Use performance.now()/browser profiling or existing instrumentation; avoid noisy logging in hot paths.
- Treat Apple Silicon as a meaningful test target but never assume performance on one Mac predicts all browsers/devices.
- Verify performance over sustained traversal and after repeated scene teardown/restart, not only at startup.
- Report before/after measurements when available; label unmeasured optimizations as expectations.
