# THE NULL ROOMS — Environmental details (step 4A)

Status: **implemented, needs in-browser visual check** (the code was compile-checked as GLSL and syntax-checked, but not run in the game).

## Solution
A shader-only layer inside the three shared Level 0 PBR materials (`src/materials/level0.js`, `GLSL_ENV`). No decals, no extra meshes,
materials or draw calls, no per-chunk state. Each effect multiplies the albedo only; baked light, normal map, roughness, UVs and the
texture files are untouched. Water is never glossy (roughness is not modified).

Every decision is a hash of **world cell coordinates**, so a spot is identical after a chunk unloads/reloads, on both sides of a chunk
seam, and after changing settings back. The world has no user seed (all generation uses fixed hash constants), and neither does this layer.
A cell is affected when `hash < frequency`: raising a slider only adds cells.

| Effect | Cell (unit of the frequency) | Look |
|---|---|---|
| Surface wear + wallpaper discoloration | one **2 m wall segment of one wall face** | 50 %: baseboard grime (0.1–0.5 m, ragged top edge); 50 %: soft yellowed / slightly darker patch. Fades out near the segment ends. |
| Carpet dampness | one **4 x 4 m floor cell** | one soft, noise-warped darker patch (r 0.6–1.1 m), never crosses the cell. Mottled, no gloss. |
| Ceiling discoloration | one **0.5 x 1.0 m ceiling panel** | faint yellow-grey wash, strongest in one corner of the panel. Panel edges sit under the existing grid strips. |

Only the legacy (Lambert) comparison material (`?materials=legacy`, F8) has no details.

## F3 debug menu, section ENVIRONMENT
Enable (on) · Surface wear 8 % · Dampness 3 % · Ceiling discoloration 2 % · Detail intensity 25 % · Show detail placement (off, paints affected spots
magenta = wall, blue = floor, green = ceiling). Values are uniforms: they apply live, no room regeneration, player position untouched.
Stored with the other dev values (`devValues`, reset/copy buttons). Console: `NULLROOMS_MATERIALS.setEnvironment({wear:.5, show:true})` (fractions 0..1).

## Limitations
* Dampness is not specially attracted to walls/corners (the shader does not know where walls are); the grime is on the lower wall only.
* Wall cells are per face of a wall, so the two sides of one wall are independent.
* Cost: a few hashes/noise lookups per fragment, only inside the existing material shaders. Not measured in a real GPU/browser yet.
