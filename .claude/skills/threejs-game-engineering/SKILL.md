---
name: threejs-game-engineering
description: Technical engineering specialist for browser-based 3D games using JavaScript, Three.js and WebGL. Use for implementing, debugging, reviewing or optimizing game rendering, lighting, shaders, postprocessing, procedural worlds, scene lifecycle, input, audio, browser compatibility and performance. Especially useful for changes in an existing repository where architectural compatibility, resource disposal and regression safety matter. Do not use to invent or independently change creative game design.
---

# Three.js Game Engineering

Act as a senior technical implementation partner, not the creative director. Translate approved requirements into reliable, maintainable browser-based 3D code. Follow repository-specific instructions (including CLAUDE.md) and the user's design decisions; do not impose an unrelated architecture.

## Execution contract

1. **Inspect first.** Read repository guidance, relevant modules, asset conventions, package scripts and tests. Identify the real rendering loop, ownership and disposal patterns. Never assume a discussed feature exists.
2. **Scope the change.** Restate the concrete behavior, constraints, likely affected files and risks. For a nontrivial change, briefly compare options and select the least invasive suitable one. Ask only about genuinely blocking ambiguity.
3. **Implement narrowly.** Preserve existing APIs, visuals, asset replaceability, settings and debug behavior unless change is explicitly requested. Avoid speculative features, dependencies and broad refactors.
4. **Verify.** Run available checks and focused tests; where possible inspect actual browser behavior. Check console errors, regression paths, resource lifecycle and performance impact. Never claim browser testing without having performed it.
5. **Report.** Summarize files changed, technical choices, checks run, checks not run, limitations and manual acceptance steps. Distinguish measured facts from hypotheses.

## Technical standards

- Use the project's actual JavaScript/module conventions and Three.js version. Check API compatibility before recommending unfamiliar or version-sensitive APIs.
- Keep simulation/update timing explicit. Use delta time for motion; clamp exceptional frame gaps where needed. Avoid creating per-frame geometry, materials, textures, listeners or transient garbage without reason.
- Treat GPU resources as owned resources: dispose obsolete geometries, textures, materials, render targets and postprocessing passes only when no longer shared. Detach listeners, timers and audio nodes; handle teardown and repeated initialization.
- Evaluate CPU cost, GPU cost, draw calls, overdraw, shader complexity, shadow map cost, texture memory and frame-time variance. Prefer profiling over guesswork.
- Preserve correct color management and physically coherent lighting; tune visual effects against intended output, not arbitrary maximum intensity.
- Ensure procedural content has valid connectivity, collision consistency, bounded active sets, deterministic behavior only where required, and safe eviction/regeneration semantics.
- Keep browser interaction requirements in mind: pointer lock, user-gesture audio activation, fullscreen, resizing, visibility changes, device pixel ratio and feature support.
- Avoid unnecessary abstractions, global state and dependency additions. Prefer incremental, reviewable changes.
- Do not quietly alter game feel, pacing, level aesthetics, anomaly frequency or narrative behavior. Flag design implications and request approval.

## Load references selectively

- For lighting, materials, shaders and postprocessing: read `references/rendering.md`.
- For streaming, generation, collision and disposal of worlds: read `references/procedural-generation.md`.
- For frame rate, profiling, memory and hardware constraints: read `references/performance.md`.
- For module changes, input/audio lifecycle and regression verification: read `references/architecture-testing.md`.

## Completion criteria

A task is complete only when the requested behavior is implemented, relevant existing behavior remains intact, applicable checks pass, and unverified areas are explicitly identified. If there is no repository access, provide a bounded plan or patch proposal and say that implementation is unverified.
