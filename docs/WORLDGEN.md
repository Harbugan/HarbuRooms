# THE NULL ROOMS — Level 0 world generation

Status: **P2 step 0 + 1** (tools + global room structure), awaiting in-game visual review. Numbers below come from the Node
tools in `tools/` (code analysis of the generator output) and from headless software-rendered test frames. They are not a
substitute for walking through it in a real browser.

## Scope of this step

Changed: how rooms, walls and doors are laid out (the `GEN` block in `index.html`) and how wall runs are joined at chunk seams.
Not changed: materials, textures, colours, lighting model, ceiling panels and fixtures, menu, controls, audio, VHS, collision
rules, chunk loading, special chunk types (halls, forest, atrium, closets, lights-out, red room), corridor placement, pillar placement.

## Before: a wall every 16 m

`layout()` split every 16 x 16 m chunk on its own and forced a wall on all four chunk borders (1-2 openings each). Result:
a rectangular lattice of 16 m cells. In the legacy generator the wall density on chunk-border lines is 58 % against 9 % on the
other lines of the 4 m grid (ratio 6.5).

## Now: rooms per region, not per chunk

* **Region = 48 x 48 m (3 x 3 chunks)**, `RS` in the code. Region columns are shifted per region row (brick bond, in whole
  chunks), so region borders do not line up. A region border is only about half wall (3-10 m stretches of wall and opening).
* **BSP per region.** Leaf size follows the zone of the chunks the rect covers (the smallest-room zone wins, so maze/closets
  keep their character). Splits prefer the 4 m structural grid (the ceiling-panel grid); 22 % land 1-3 m off it. Big rects are
  split near their middle, so there are no 48 m slivers.
* **Open chunks and corridor strips are stamped on top** (label 0). Rooms = connected parts of one label; slivers
  (< 8 m2 or < 2 m wide) are merged into their longest neighbour.
* **Doors.** A random spanning tree over the room-adjacency graph (every room reachable) plus extra doors (loops). Doors are at
  least 2 cells wide: a 1-cell gap between two 0.3 m wall ends is 0.7 m clear, less than the player's 0.74 m. Rooms that only
  touch along 1-cell stretches are joined by opening that whole border if the tree needs it.
* **Chunk borders** no longer add walls, except between two open chunks (as before). Elsewhere they only gain openings
  (corridor mouths, gaps towards halls). Walls that cross a chunk border are built as two runs that abut exactly (no overlap).
* Everything is a pure function of the region coordinates: deterministic, independent of generation order, neighbours agree.
* `?gen=legacy` restores the previous per-chunk generator (baked at chunk build: reload to switch), like `?lighting=legacy`.
* `?debug=map` shows a top-down map of the 7 x 7 chunks around the player (walls, windows, pillars, ceiling panels, chunk borders).

## Measured (radius 9 chunks = 361 chunks, node tools/gen-check.mjs --compare --radius 9)

| Metric | legacy | now |
| --- | --- | --- |
| Wall density on chunk lines / other 4 m lines | 57.8 % / 8.9 % (ratio **6.5**) | 32.9 % / 21.9 % (ratio **1.5**) |
| Unreachable pockets inside the test area (0.25 m grid, game collision rule) | 0 | 0 |
| Determinism, forward vs reverse generation order | ok | ok |
| Boundary agreement between neighbouring chunks | ok | ok |
| Doors per chunk | 5.4 | 5.5 |
| Dead-end rooms | 14.8 % | 18.6 % |
| Free wall ends per chunk (excluding door jambs) | 6.1 | 6.8 |
| Generation time per chunk | 0.14 ms | 0.25 ms |

Reading the numbers honestly:
* The chunk lattice is reduced, **not gone.** Chunk lines still carry more wall than other 4 m lines (1.5x). The remainder is
  mostly the borders of open chunks (halls, forest, atrium), which are still whole chunks. Making those irregular belongs to
  step 2 (room shapes and sizes).
* Dead ends and free wall ends are about the same as before; reducing them is step 3 (doors and connections) and step 4.
* The "unreachable pockets" that remain in the report lie on the edge of the test window (the window cuts them off); their
  position moves when the radius changes.
* The legacy generator is bit-identical to before this change (digest of 441 chunks compared).

## Tools

```
node tools/gen-check.mjs --compare --radius 9     # determinism, boundary agreement, playability, statistics (legacy vs current)
node tools/gen-map.mjs out.svg --radius 4         # top-down SVG map; --legacy, --cx/--cz, --scale, --no-grid, --mark x,z
node tools/gen-check.mjs --epochs --radius 9 --runs 4 --baseline old-index.html   # region epochs, see below
```
Both load the generator straight from `index.html` (the block between `GEN START` and `GEN END`). `tools/gen-lib.mjs`
`chunkBoxes()` repeats the collision-box logic of `addChunk()`/`wallRun()`: if that changes, change it there too.

## Not verified

* No real-GPU, real-browser play-through. Look for: wall seams at chunk borders (should be none), z-fighting, odd corners where
  a corridor meets a room, rooms that feel too big/small, and performance when crossing region borders.
* Light interaction: lamp positions are untouched, but "whole room dark" (7 %) now follows the new rooms.

## Region epochs (continuous-world step 0 + 1)

Foundation for a world that can forget and rebuild areas the player has left. **Nothing changes an epoch yet**, so the game is
unchanged; retiring regions is a later step.

* Every region has an **epoch** (default 0). `regionEpoch(rx, rz)` / `setRegionEpoch(rx, rz, e)` in the `GEN` block.
* The epoch salts the region's seeds: BSP, doors, windows, partitions, the region's N/W border openings (`edge()`) and the lamp
  states of its chunks (dead/dim panels, dark rooms). `es(seed, 0) === seed`, so **epoch 0 is bit-identical** to the world before.
* Epoch-independent on purpose (first version = room structure only): zones and specials (`info`), palettes, ceiling heights,
  long corridors, chunk-border openings (`edgeOpen`), hall pillars and free-standing hall walls. The fixed start area therefore
  only needs its regions pinned to epoch 0.
* **Locality:** a chunk's layout depends only on its own region's epoch; its geometry, baked light and AO only on the epochs of
  its 3 x 3 chunk neighbourhood (`addChunk` reads neighbour layouts at most one chunk away). So an epoch may change only while
  that region and a one-chunk ring around it hold no built or queued chunk; then no visible chunk ever sees a changed input.
* Caches self-invalidate: `region()` and `layout()` rebuild when the cached epoch differs from the current one.

`gen-check --epochs` checks: epoch 0 against a baseline `index.html`; set + reset of epochs on a live generator; then for
`--runs` random epoch tables (`--max-epoch`, `--seed`): locality of layouts and of collision boxes, determinism, boundary agreement,
playability and openings on region borders (`regionBorders`: border segments without an opening of at least 2 cells).

Measured (radius 9, 400 chunks, 51 regions; 4 runs seed 1-4 max epoch 3, and 12 runs seed 100-111 max epoch 9):

| Check | Result |
| --- | --- |
| Epoch 0 vs `main` | 400 / 400 chunks bit-identical; `--compare` output identical except the new `regionBorders` field |
| Cache set/reset on a live generator | ok |
| Locality (layouts / collision boxes) | ok in all 16 runs |
| Determinism, boundary agreement | ok in all 16 runs |
| Region border segments without a passable opening | 0 of 50 in every run (narrowest best opening: 3 cells) |
| Unreachable pockets away from the window edge | 0 in 15 runs; 1 run: one 2 m2 pocket (maze zone) |

**Known, pre-existing:** the unreachable pocket is not caused by epochs. The unchanged `main` generator has them too once the test
window is larger: radius 16 finds two 2 m2 pockets, radius 24 also a 6 m2 and a 73 m2 one, all in `maze` zones (radius 9, the
area measured earlier, happens to contain none). Likely a room or door that is only one cell (0.7 m clear) wide somewhere after
corridor stamping / sliver merging, not yet diagnosed. A sealed pocket cannot trap the player today, but a region that is not
internally connected could, once neighbouring regions are rebuilt; this must be fixed before epochs are changed in game.
Fixing it changes the epoch-0 world, so it is a separate, approved step.

