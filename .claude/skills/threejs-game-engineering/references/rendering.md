# Rendering and visual fidelity

- Inspect renderer settings, tone mapping, output color space, material color spaces, light types and postprocessing chain before adjusting appearance.
- Treat albedo/base color textures as color data and normal/roughness/metalness/AO maps as non-color data; verify actual texture conventions and Three.js version.
- Avoid compensating for incorrect color management by indiscriminately raising light intensity or exposure.
- For fluorescent interiors, distinguish visible emissive fixture geometry, actual illumination and bloom. Emission alone may not light surrounding geometry.
- Measure shadow-map and light counts; use baked, approximated or selectively dynamic lighting where appropriate. Do not promise realistic per-fixture dynamic shadows at unlimited scale.
- Keep bloom selective/subtle when realism matters; inspect threshold, exposure, highlights and compositing order. Test in bright and dark regions.
- Verify texture tiling, orientation, UV scaling, anisotropy and mipmaps. Preserve replaceable asset filenames and conventions.
- Test resize and pixel-ratio changes, including postprocessing render targets and depth textures.
- Prefer a before/after visual comparison plus GPU/frame-time measurements for significant rendering changes.
