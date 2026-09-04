# gp25 — Global25 population map

Interactive map of ~6,000 population averages (3,940 ancient, 2,080 modern) from the
[Moriopoulos Collection 2025](https://genarchivist.net/showthread.php?tid=1449) (no sims)
on Eurogenes Global25 coordinates. See `DATA_NOTES.md` for sources and conventions and
`ANALYSIS.md` for the sanity checks behind the design.

## Views

- **Similarity**: click a point, click anywhere on land, or search a population. Every population is
  coloured by its G25 distance to the query (Euclidean on scaled coordinates, ×100 as in Vahaduo)
  and an inverse-distance-weighted heatmap is drawn over land. Clicking on empty land builds a query
  from the nearest placed populations. The list on the left is the ranked nearest populations.
- **Clusters**: Ward hierarchical clustering (moderns / ancients / both) cut into k clusters.
  Land is coloured Voronoi-style by the cluster of the nearest sampled location; colours are
  hierarchical (hue divided along the tree, so nearby hues are nearby branches). The side panel is a
  collapsible tree down to the cut.
- **Drill-down**: start at the root, the tree is split into 2–4 branches; click a branch (region, point
  or tree entry) to zoom into it and split it again. Breadcrumbs go back up.

Rendering: a custom canvas orthographic globe (drag to rotate, wheel to zoom, no map library).
Values live on a 1024×1024 Mercator raster; each cell holds its 6 nearest sampled locations (k-d tree on
the sphere) with inverse-distance weights and a fade beyond 500–1500 km. The raster is reprojected per
screen pixel every frame (half resolution while dragging) and clipped to the vector coastline.

URL hash state: `#sim/Polish`, `#clu/m/16`, `#drill/all/3`.

## Run

```sh
cd app && pnpm install && pnpm dev      # http://localhost:5173
pnpm build                              # static site in app/dist
```

## Rebuild data

```sh
uv run --with pandas --with numpy --with scipy python analysis/build_data.py
```

Reads `data/*.txt` and `data/geo/chunks/*.csv`, writes `app/public/data/pops.json` and `trees.json`,
plus `data/geo/geocoded.csv` (merged gazetteer) and `data/geo/suspicious_far_nn.csv` (populations whose
genetic nearest neighbour is > 4,000 km away, for geocoding review).

## Layout

- `data/` raw sheets and geocoding (`geo/GEOCODING_INSTRUCTIONS.md`, `geo/chunks/*.csv`)
- `analysis/` exploration scripts and the data build script
- `app/` Vite + TypeScript app (d3-geo globe on canvas)
