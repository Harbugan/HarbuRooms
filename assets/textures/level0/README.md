# Level 0 textures

Placeholder / replacement slots for the Level 0 PBR materials. **Nothing in this folder is final art.**
The game ships with deterministic procedural fallbacks for every slot, so these folders may stay empty.

```
assets/textures/level0/
  manifest.json            which file (if any) replaces which channel
  wallpaper/   MAT_01 Yellowed Wallpaper
  carpet/      MAT_02 Damp Office Carpet
  ceiling/     MAT_03 Acoustic Ceiling
```

## Naming convention

`<material>_<channel>.<ext>` inside the material's folder, for example `wallpaper/wallpaper_basecolor.jpg`.

| channel     | file suffix    | colour space | notes |
|-------------|----------------|--------------|-------|
| baseColor   | `_basecolor`   | sRGB         | See "Base colour and the baked palette" in docs/MATERIALS.md |
| normal      | `_normal`      | linear       | OpenGL / +Y up (glTF convention) |
| roughness   | `_roughness`   | linear       | Value read from the **green** channel, 0 = glossy, 1 = matte |

Allowed extensions (the deploy workflow uploads these): `.png`, `.jpg`, `.jpeg`, `.webp`.
Textures must tile seamlessly. Power-of-two sizes (1024 or 2048) are recommended.

## Replacing a texture

1. Drop the file into the material's folder.
2. Put its path (relative to `manifest.json`) in the matching slot, e.g.
   `"baseColor": "wallpaper/wallpaper_basecolor.jpg"`.
3. Set `params.size` to the real-world size in metres of one repeat.

Each channel is independent, and each material is independent. Anything left `null` keeps its procedural fallback.
See `docs/MATERIALS.md` for all parameters.
