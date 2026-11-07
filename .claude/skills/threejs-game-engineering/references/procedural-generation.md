# Procedural worlds and streaming

- Identify spatial representation (grid, graph, chunks, cells), world coordinate conventions, player collision and render ownership before changing generation.
- Define invariants: reachable active area, valid doorway alignment, no accidental wall overlaps, safe spawn, no gaps into unloaded space, and bounded active geometry.
- Separate layout decisions from mesh instantiation when feasible. Ensure generation and unloading are independent of frame rate.
- Define explicit chunk states and lifecycle: planned, created, active, retiring, disposed. Avoid duplicate generation, stale async completions and dangling references.
- Track ownership and sharing for materials, textures, geometries, audio and collision structures. Never dispose globally shared assets when retiring a chunk.
- For unstable worlds, distinguish active geometry retention, memory of past topology and rules for regeneration. Do not silently assume a fixed seed or identical return path.
- Preserve collision/navigation safety at streaming boundaries. Consider hysteresis to avoid churn when player crosses a threshold repeatedly.
- Test long traversal, rapid turns, backtracking, teleport/debug movement, repeated reloads and world cleanup.
- Record generation time, active chunks, triangles, draw calls and retained resources if debug instrumentation is available.
