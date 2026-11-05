# THE NULL ROOMS — Level 0 material system (v0.3)

Status: **initial integration of the approved Level 0 textures, for in-game evaluation.** The procedural set remains as fallback and as the `?materials=legacy` baseline.

## v0.3: approved Level 0 textures

| Slot | File (unmodified originals) | Scale (metres per repeat) |
|---|---|---|
| wall | `wallpaper/wall_texture1024x1024_lvl0.jpg` | `[1, 1]` |
| floor | `carpet/carpet_texture1024x1024_lvl0.jpg` | `[1, 1]` |
| ceiling | `ceiling/ceiling_texture2048x1024_lvl0.jpg` (really 1024 x 2048 px, portrait) | `null` = exactly one 0.5 x 1.0 m ceiling panel |

* **Original colours.** An external base colour is shown as painted: the baked palette hue is dropped (only the baked *light level*
  is kept, via a per-vertex `aLight` attribute) and the macro colour drift is off. Controlled by `externalPaletteInfluence` (default 0)
  and `externalMacroColor` (default 0). If the file fails to load, the procedural fallback gets the palette again. The scene's own
  warm hemisphere light and VHS grade still tint everything, as for all game surfaces.
* **Ceiling panels are 0.5 x 1.0 m** (x by z; `CEIL_W` / `CEIL_L` in `index.html`). The whole portrait texture (1024 x 2048 px,
  despite the `2048x1024` filename) maps once onto each panel, so aspect ratio is kept (repeat = 4 x 2 per 2 m cell). Panel seams get thin
  (2.4 cm wide, 4 mm deep) grid strips at world multiples of 0.5 m (x) and 1.0 m (z); chunk origins are multiples of 16 m, so the
  grid and texture line up across chunks. The old `?ceilTile=` override was removed. Ceiling height and the 1 x 0.5 m fixtures are unchanged.
* **Relief.** With no external normal / roughness file, they are derived from the new base-colour image (`deriveMaps`, default on),
  so relief matches the painted detail rather than the old procedural canvas. Status shows `derived`.
* **Scale is configurable** three ways: `params.size` in `manifest.json`; the URL, e.g. `?wallSize=1.2&floorSize=1x1&ceilSize=0.5`
  (wins over the manifest); or live, `NULLROOMS_MATERIALS.setParams('floor', { size: [1.5, 1.5] })`. If you change the ceiling size
  away from the panel size, panel edges no longer line up with the grid.
* Known: the carpet file is 1000 x 1000 (name says 1024) and the carpet / ceiling images are not strictly seamless at the repeat
  edge (the grid hides it on the ceiling; watch the carpet). Originals were not touched.

## What changed, what did not

| Unchanged | Added |
|---|---|
| Chunk generation, geometry, UVs, collision, `Builder`, baked vertex-colour lighting, lights, fog, VHS pass, settings | `src/materials/level0.js` (material system) |
| The original Lambert materials and procedural canvas textures (the "legacy" look) | `assets/textures/level0/` (slots, manifest, READMEs) |
| Draw calls: still 5 merged meshes per chunk, materials shared by all chunks | ~12 lines in `index.html` to create and use the system |

Only wall, floor and ceiling surfaces use `MeshStandardMaterial`. The T-bar grid (`MeshLambertMaterial`) and light panels
(`MeshBasicMaterial`) are unchanged: PBR gives them nothing visible.

## Comparing against the original

* `?materials=legacy` starts on the original Lambert look, `?materials=pbr` (default) on the new one.
* **F8** toggles live. Chunks are re-pointed to the other material set, nothing is rebuilt.
* Console: `NULLROOMS_MATERIALS.mode`, `.status()` (which channels are procedural / external / failed), `.setMode()`.
* `?materialManifest=<url>` loads a different manifest (try replacement textures without touching the repo).

## Materials

| Id | Slot | Folder | Character |
|---|---|---|---|
| MAT_01 | `wall`  | `wallpaper/` | Faded yellow, subtle vertical bands, paper tooth, very low contrast, matte |
| MAT_02 | `floor` | `carpet/`    | Beige-brown short dense fibre, colour drift, damp patches (slightly lower roughness), matte |
| MAT_03 | `ceil`  | `ceiling/`   | Off-white mineral-fibre tile, porous, slight yellowing, very subtle normal map, matte |

## Procedural fallback (deterministic)

* Base colour: the existing canvas textures, reused unchanged (same GPU texture as the legacy material).
* Normal and roughness maps: derived at startup from that base canvas (high-pass luminance -> height -> normal; roughness
  from detail and low-frequency patches). Pure functions of the existing seeded textures: identical on every load.
* Large-scale variation: see "Repetition" below.

## Parameters

Defaults live in `LEVEL0_DEFAULTS` (`src/materials/level0.js`). Override per material in `manifest.json` under `params`,
or live with `NULLROOMS_MATERIALS.setParams('floor', { normalScale: 0.8 })`.

| Param | Default (wall / floor / ceil) | Meaning |
|---|---|---|
| `size` | `null` / `[2, 2]` / `null` (manifest: `[1, 1]` / `[1, 1]` / panel) | Metres covered by one repeat of an **external** texture. Wall `null` = `[2, wall height]`, ceiling `null` = one 0.5 x 1.0 m panel. |
| `externalPaletteInfluence` | 0 | `paletteInfluence` used once an external base colour is loaded |
| `externalMacroColor` | 0 | `macroColor` used once an external base colour is loaded |
| `deriveMaps` | true | Derive normal / roughness from an external base colour when none is supplied |
| `normalScale` | 0.28 / 0.6 / 0.4 | Normal-map strength |
| `roughness` | 1 | Multiplier on the roughness map (map holds absolute values) |
| `paletteInfluence` | 1 | Procedural maps. 1 = baked palette tints the map like legacy; 0 = only the baked light level is applied |
| `gain` | 0.985 | Diffuse multiplier (matches legacy brightness, see below) |
| `specular` | 1 | Multiplier on specular highlights |
| `macroColor` | 0.045 / 0.07 / 0.05 | Amplitude of large-scale colour drift |
| `macroRoughness` | 0.03 / 0.07 / 0.02 | Amplitude of large-scale roughness drift |

## Replacing a material (each is independent)

See `assets/textures/level0/README.md`. In short: put `wallpaper_basecolor.jpg` (and/or `_normal`, `_roughness`) in the
folder, set the path in `manifest.json`, set `params.size`. A missing, unreadable or invalid file only logs one console
warning and that channel keeps its procedural fallback. The game never waits for textures: it starts on the procedural
set and swaps external textures in when they arrive. A manifest that lists nothing (the default) makes no extra requests.

## Vertex colours and PBR (the assessment)

The baked lighting is `palette colour x light pool` written to the vertex colour. `MeshStandardMaterial` multiplies it into
the diffuse colour exactly as Lambert does, and with no environment map and `metalness 0` the lighting maths reduces to
the same Lambert diffuse. Measured on identical frames (same camera, same flicker state), Standard was +1.0 to +1.5 % brighter
than the legacy Lambert material, and removing specular entirely changed it by only about 0.3 %. `gain 0.985` compensates.

What PBR does buy, under the existing hemisphere light and camera torch:

* the **normal map** reacts to the torch (carpet fibre, ceiling pores, paper relief), which Lambert + a flat map cannot do;
* per-pixel **roughness** is available for the later lighting milestone (wet patches, glossier fixtures).

What it does not buy yet: visible reflections. With no environment and a matte range this is intentional; it is for the lighting milestone.

### Base colour and the baked palette

The palette colour (e.g. wallpaper yellow `0xe2d05a`) is baked into vertex colours and **multiplies** the base-colour map.
The procedural maps are near-white for this reason. An external base-colour texture authored with real yellow would be tinted
twice. Either author external base colours **near-neutral / light** (the palette supplies the hue), or lower
`paletteInfluence` so the vertex colour only carries the light level (it then also loses the per-room hue variation).
Final art direction on this is a decision for review.

## Repetition

UVs are world-space (one repeat per 2 m), which is what keeps textures seamless across merged boxes and chunk boundaries.
Rather than change UVs, a cheap world-space "macro" term (two octaves of value noise, 5 to 15 m wavelengths, hash-based and
therefore deterministic) modulates colour and roughness. It is a pure function of world position, so it is continuous across
chunk seams. It hides the 2 m repeat on long corridors; it does not remove the repeat of high-contrast features. Assumption:
chunk meshes use an identity matrix (they do), so `position` is the world position.

## Known limitations / for review

* The legacy wallpaper has a painted baseboard in the texture. An external wallpaper has none unless it is in the art.
* Procedural normal maps are a stand-in. Real scans will look different and `normalScale` needs retuning.
* The shader patch is one extra 2-octave noise per fragment on three surfaces. Not measurable on desktop in testing; worth a check on low-end mobile.
* The material module is loaded as an ES module (`./src/materials/level0.js`), so opening `index.html` from `file://` falls back to legacy materials
  (the game itself still works). Serve over http(s) as in production.
