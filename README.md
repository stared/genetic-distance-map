# gp25 — Global25 population map

Interactive map of ~6,000 population averages (3,940 ancient, 2,080 modern) from the
[Moriopoulos Collection 2025](https://genarchivist.net/showthread.php?tid=1449) (no sims)
on Eurogenes Global25 coordinates. See `DATA_NOTES.md` for sources and conventions and
`ANALYSIS.md` for the sanity checks behind the design.

## Views

The map always shows present-day populations (outliers, low-resolution and contaminated entries are
never drawn). Ancient samples are available only as similarity queries through the search box.

- **Similarity**: click a dot or search a population (present-day or ancient). Every present-day
  population is coloured by its G25 distance to the query (Euclidean on scaled coordinates, ×100 as
  in Vahaduo) and an inverse-distance-weighted heatmap is drawn over land. The colour scale runs from
  the nearest population to the 25th-percentile distance by default and the upper bound is editable.
  The list is the ranked nearest populations grouped by ethnonym. While searching, the results take over
  the panel: curated top picks (Mycenaean Greece, Imperial Rome, Vikings, Yamnaya…), the most-sampled
  present-day groups (represented by their medoid entry), and the largest samples of each era. Era words
  (prehistoric, ancient, medieval, early modern) are searchable, and words combine ("medieval poland").
- **Clusters**: Ward hierarchical clustering of present-day populations cut into k clusters. Land is
  coloured Voronoi-style by the cluster of the nearest sampled location; colours are hierarchical
  (hue divided along the tree, so nearby hues are nearby branches). The panel is a collapsible tree
  down to the cut.
- **Split**: start at the world, the tree is split into three branches; click a branch (region, dot
  or list entry) to zoom into it and split it again. Breadcrumbs and Reset go back up.

Rendering: a flat Web-Mercator map on a 2D canvas with d3-geo (drag to pan with horizontal wrap,
wheel to zoom, no map library). Values live on a 1024×1024 Mercator raster; each cell holds its 6
nearest shown locations (k-d tree on the sphere) with inverse-distance weights and a fade between
1500 and 2500 km from the nearest sample. Coastlines are stroked into the raster land mask so
islands smaller than a cell are still painted. The raster is drawn with the map transform and
clipped to the vector coastline. The app opens on a default query.

Shareable URLs: the address bar always reflects the current state, e.g.
`?q=Polish&scale=close&map=15.00,48.00,1400`, `?q=Russia_Samara_EBA_Yamnaya`, `?view=clusters&k=16`,
`?view=split&path=3682` (`map` is centre longitude, latitude and Mercator scale; `scale` is close, regional
or global; `path` is the list of tree nodes descended into).

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
- `app/` Vite + TypeScript app (d3-geo Mercator map on canvas)
