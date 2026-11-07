# Architecture, browser lifecycle and verification

- Respect existing module boundaries, dependency direction and configuration mechanisms. Add a new abstraction only when it reduces real complexity.
- Confirm which object owns requestAnimationFrame, resize, visibility, pointer lock, fullscreen and audio gesture handling. Register and unregister listeners symmetrically.
- Keep input sampling, physics/collision and rendering responsibilities distinct where the existing code permits.
- Audio: handle browser autoplay policies, suspended AudioContext, buffer loading errors, spatial attenuation and teardown of nodes/sources.
- Keep debug controls opt-in and prevent debug state from leaking into normal gameplay. Preserve configurable settings and replaceable assets.
- For changes to core lifecycle, test start, pause, resume, restart, menu transitions, resize, tab switching and repeated initialization.
- Prefer small focused automated checks for pure logic (layout invariants, seeded generation where applicable, resource bookkeeping). For visual behavior, provide concrete manual browser acceptance steps.
- Avoid claiming tests passed unless their commands were actually executed. Explicitly report environment limitations.
