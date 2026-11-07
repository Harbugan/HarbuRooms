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
| Unreachable pockets away from the window edge | 0 in all 16 runs (after the walkability repair below) |

Further mixed-epoch runs: radius 16, 6 runs, max epoch 5: all checks ok, 0 pockets.

## Walkability repair (step 1b)

**Problem (pre-existing on `main`, not caused by epochs).** With a large enough test window the generator produced sealed
pockets: radius 16 two of 2 m2, radius 24 also 6 m2 and 73 m2, all in `maze` zones. Cause: a room is a set of connected cells,
but it can have a **1-cell neck** (1 m between two wall ends = 0.7 m clear, narrower than the player's 0.74 m). The door tree
treats the room as one node, so the rooms behind the neck were "connected" on paper and sealed in practice. (The 1-cell
"narrow join" case was suspected first; instrumenting showed it never happens in these areas.)

**Fix (end of `region()`).** The region is flooded the way the player walks: an open edge counts only if its open stretch on that
line, between wall ends (walls along the line or touching it from either side), is at least 2 cells. Every part that is cut off
and contains a 2 x 2 block of cells (anything smaller is a nook the player cannot stand in) is joined to another part with a
2-cell door (random among candidates, 65 % get a lintel like other doors). It only removes walls, so it cannot break anything
else, and regions without a defect are bit-identical. The region's S/E border lines belong to the neighbours and are assumed to
be wall (conservative).

Measured:

| | `main` | now |
| --- | --- | --- |
| Pockets away from the window edge, radius 9 / 16 / 24 / 32 | 0 / 2 / 4 / 6 (73, 6, 3, 2, 2, 2 m2) | 0 / 0 / 0 / 0 |
| Regions repaired, radius 40 (784 regions), epoch 0 / two mixed-epoch tables | - | 1.7 % / 1.3 % / 1.1 %, one door each, never gives up |
| Chunks whose layout differs from `main`, radius 32 (4225 chunks) | - | 9 (0.21 %); nearest 12 chunks (192 m) from spawn |
| Epoch-0 digest vs `main`, radius 9 (start area) | - | 400 / 400 bit-identical |
| Determinism, boundary agreement, region-border openings (radius 9-32) | ok | ok; no border segment without a passable opening |
| Layout generation, radius 40 (Node, single run, noisy) | ~0.12 ms/chunk | ~0.165 ms/chunk |

Not covered by the repair: openings **across** region borders. `region()` cannot see the neighbour's walls, so a border opening
can be split into 1-cell pieces (`onePieceGaps` in `gen-check`). It is measured, not guaranteed: every border segment so far has at
least one passable opening (narrowest best 2 cells at radius 32). Also not covered: pillars and free-standing walls in open
chunks (halls, forest, atrium), which are added per chunk; no pocket was found there.

## Start area (continuous-world step 2)

* **Pinned.** Every region that holds a chunk within `START_PIN` = 2 chunks of the spawn chunk (0,0) keeps epoch 0 forever
  (currently 5 regions). `setRegionEpoch()` refuses them and returns `false`. The start area is procedural, not hand-made, and
  identical to before (it is bit-identical to `main` within radius 9).
* **Start-room decal.** A fixed landmark so the start can be recognised on return: the supplied painting
  `assets/decals/start_window.webp` ("ONLY EXIT IS THROUGH THE WINDOW...", 1441 x 1881, RGBA, used unmodified).
  * Placement: `startMark()` in the `GEN` block (pure, deterministic). The spawn room is the region room under cell (8, 8).
    Candidates are 2-cell stretches of full-height wall (no window) facing into that room, with no wall touching the middle vertex
    from the room side, visible from the spawn cell. Best = facing the spawn, about 4 m away.
  * Result in the current world: the north face of a free-standing partition at z = 12, centred on x = 11, facing -z, about
    4.2 m from the spawn cell and about 2.4 m behind-right of where the intro leaves the player (who faces -z). It is not in the
    first frame; it is seen as soon as the player turns around, and from most of the room.
  * Rendering: one 4 x 4-vertex quad in the chunk that holds it, one shared Lambert material (like the legacy walls), vertex colours
    = the baked light level at each vertex (`bakeLevel()`, the same formula `Builder.box()` uses, now shared), fogged, alpha-blended,
    6 mm off the wall face plus polygon offset. No collision, no new lights. It is disposed with its chunk.
  * F3 "START ROOM": decal on/off, height (default 120 cm), centre height (145 cm), opacity (100 %), brightness (100 %). Live; only
    the decal quad is rebuilt. Defaults change nothing else.
  * `?gen=legacy`: no region rooms there, so no decal.
* `gen-check --epochs` also checks: pinned regions refuse an epoch; the start chunks and the decal position are unchanged in
  every random epoch table; the decal sits on a full wall.

## Region retirement (continuous-world step 3: dry run)

The game now decides which regions **could** be rebuilt with a new epoch, and only logs it. No epoch changes, so the world is
unchanged. Applying it is step 4.

* `regenTracker()` (GEN block, pure) tracks every non-pinned region that had a built chunk. A region becomes **retirable** when
  1. neither the region nor a one-chunk ring around it holds a built or queued chunk (a built chunk depends on its 3 x 3
     neighbourhood only, so no built chunk can see the change),
  2. its nearest chunk is at least `regenDist` chunks from the player (default 8 = 128 m, hysteresis), and
  3. both have held for `regenDelay` seconds (default 20 s). Coming back resets the timer.
* `regionChunks(rx, rz)`: the 3 x 3 chunks of a region, without building it.
* In game (`regenTick`, once a second from `updateChunks`): F3 "WORLD REGEN (DRY RUN)" has the distance, the delay, a console-log
  switch (`[regen dry run] region rx,rz would be rebuilt ...`) and a live readout (tracked / waiting / retirable / events). Off with
  `?gen=legacy`. Tracker entries are capped (512).
* `tools/regen-sim.mjs` walks a virtual player with the game's loading rule and the game's own tracker. With `--apply` it really
  bumps epochs (what step 4 will do) and checks, every 5 simulated seconds, that no built chunk or any of its 3 x 3 neighbour
  layouts changed while built, and that the start chunks never change. `--no-ring` is a negative control.

Measured (`regen-sim`, 1 h simulated walks, legs of 20-300 s at 1.4-4.6 m/s, every 4th leg back towards the spawn):

| Run | Result |
| --- | --- |
| Dry run, 30 min, seed 1 | 517 would-be rebuilds; safety ok; start unchanged |
| `--apply`, seeds 1/2/3 | 941 / 978 / 905 rebuilds; 183 / 171 / 258 revisits found a rebuilt region; epochs up to 4; safety ok; start unchanged |
| `--apply --dist 6 --delay 0` (F3 minimum) | 264 rebuilds in 15 min; safety ok |
| Negative control `--no-ring --dist 4` | FAIL, 2187 violations (the check does catch unsafe retirement) |
| Headless Chromium, camera moved 576 m east | 34 dry-run log lines, no page errors |

Not modelled by the simulator: walls (the virtual player walks through them) and the per-frame build queue (chunks appear at once;
the game also counts queued chunks as busy).
