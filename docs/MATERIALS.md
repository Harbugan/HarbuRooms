# THE NULL ROOMS — Level 0 material system (v0.2)

Status: **for creative review. Not merged.** Procedural placeholders only, no production art.

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
| `size` | `[2, 2.9]` / `[2, 2]` / `[2, 2]` | Metres covered by one repeat of an **external** texture. Wall V runs over the wall height (2.9 m). |
| `normalScale` | 0.28 / 0.6 / 0.4 | Normal-map strength |
| `roughness` | 1 | Multiplier on the roughness map (map holds absolute values) |
| `paletteInfluence` | 1 | 1 = baked vertex colour tints the map exactly like legacy; 0 = vertex colour only dims it |
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
