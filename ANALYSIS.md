# G25 population averages: analysis and visualisation plan

Status: analysis only, nothing implemented. Scripts used for the numbers below live in `analysis/` (run with `uv run --with pandas --with numpy --with pyarrow --with scipy --with scikit-learn python analysis/<script>.py`). Data facts are in `DATA_NOTES.md`.

## 1. What the data is, in one paragraph

6,020 population averages (3,940 ancient, 2,080 modern) in 25-dimensional scaled Global25 space, each with a sample size n and a hierarchical text label. There are no coordinates on Earth, no dates beyond a period token, and no individual samples. Distance between two averages is plain Euclidean distance on the 25 scaled coordinates, conventionally reported ×100 (Polish→Ukrainian ≈ 1.0, English→Welsh ≈ 0.43, Europe→East Asia ≈ 40+).

## 2. Findings

### 2.1 The space is effectively low-dimensional, but the tail matters locally
- Two coordinates carry 71% of the variance across averages (PC2 = East vs West Eurasia, PC1 = Sub-Saharan Africa vs rest); five carry 91%; ten carry 98%.
- Within a region (e.g. inside Europe) those big axes are nearly constant and the fine structure lives in PCs 3–10. So any global 2-D projection (PCA, UMAP) will look fine at continental scale and lie about local structure. A map with a *query-relative* heatmap avoids this problem entirely, which is a point in favour of the user's design.

### 2.2 Sample sizes are extremely skewed
- 54% of ancient averages and 21% of modern ones are single individuals; the top modern row has n=1,203.
- Consequences: (a) singleton "averages" are noisy points, especially `(low_res)`; (b) clustering must decide on weighting. Recommendation: cluster *unweighted* (each average is one curated entity) but exclude `_o` outliers, `(low_res)` and `(contaminated)` from tree building, then attach them afterwards to their nearest cluster. Report n and the flags in the UI.

### 2.3 Hierarchical clustering: what works
Tested on 1,861 moderns (outliers removed), Euclidean on scaled coordinates:

| linkage | cophenetic corr. | largest cluster at k=20 | singletons at k=50 | verdict |
|---|---|---|---|---|
| single | 0.67 | 1,761 of 1,861 | 24 | chains, useless |
| average (UPGMA) | 0.93 | 946 | 8 | best tree fidelity, unbalanced cuts |
| centroid | 0.91 | 1,018 | 8 | similar to average, inversions possible |
| complete | 0.89 | 555 | 2 | ok |
| weighted (WPGMA) | 0.82 | 954 | 6 | meh |
| Ward | 0.87 | 375 | 0 | most balanced cuts, best for colouring |

- **Agreement with the curator's hand-assigned profiles** (761 ancient rows in 23 frequent profiles): Ward k=23 gives ARI 0.41 / NMI 0.68; complete 0.37 / 0.64; average 0.16 / 0.54. Profiles that Ward reproduces almost perfectly: Anatolian BA, Sarmatian-Mixed, Norse-Finnic, East Med-Anatolian, South Slavic (purity ≥ 0.89). Profiles it fragments: East Asian-Mixed (purity 0.18, mean spread 10.9 vs ~3 for the others), i.e. the ones that are admixture clines rather than clusters. That is the expected failure mode and argues for a *tree* rather than flat clusters: an admixed group sits on a long branch between two clades.
- Ward at k=8 on moderns recovers: Americas / Oceania-Papua / East Asia / West-Central Africa / East+North Africa / South-Central Asia / Europe / Near East-Caucasus. At k=15 it further splits Siberia, Polynesia-ISEA, Pygmy-San, Nile-Horn, Volga-Ural Turkic, India vs Pakistan-Afghanistan, Arabia-Maghreb vs Anatolia-Caucasus. All geographically sensible.
- Ancients Ward k=12 also comes out as sensible macro-regions (Steppe, Northern Europe, Southern Europe, Near East, East Asia, Siberia-Mongolia, Americas, Oceania, East Africa, North Africa, Central Asian Iron Age, WHG/early farmer islands).

Recommendation for the "phylogenetic" tree: **Ward for the tree used to colour the map** (balanced, cuts well at any depth, agrees best with curated profiles), and optionally UPGMA (average linkage) for a standalone dendrogram where branch heights should reflect actual distances (Ward heights are variance increments, not distances; label the axis accordingly). Note that this is a similarity tree of present-day/ancient averages, not a phylogeny: admixture makes the true history a network, so present it as "hierarchical similarity", not ancestry.

Sanity checks to keep in the pipeline: cophenetic correlation; ARI/NMI against the curator profiles; a stability check (bootstrap the 25 coordinates or add Gaussian noise of the size of the typical n=1 error, ≈1–2 ×100, and measure ARI between runs); and eyeballing that outliers/low_res rows land where their base label lands.

### 2.4 Parameters worth exposing
- Which rows to include: moderns only / ancients only / both; drop `_o`, `(low_res)`, `(contaminated)`.
- Number of PCs used (25 vs top 10): scaled coordinates already multiply PC1–2 by ~10–11 and PCs 11–25 by only ~1.2–1.6 (see `DATA_NOTES.md`), so keep all 25 by default; offer 10 as a noise-reduction option and check the tree barely changes.
- Cut strategy for colouring: fixed k per zoom level (e.g. 8 → 15 → 40 → 100), or a distance threshold (e.g. merge everything within 2.0, 4.0, 8.0 ×100), or dynamic tree cut. A distance threshold is easier to explain to users ("groups closer than X").
- Hierarchical colours: assign hue at the top split, then lightness/saturation for children, so that a zoomed-in map stays consistent with the zoomed-out one. A tree-aware palette scheme (e.g. hue interpolation within the parent's hue range) is a solved problem; nested k cuts of the same Ward tree guarantee that child clusters nest inside parents.

### 2.5 Geography is the missing piece
Nothing in the data has coordinates. Two separate geocoding tasks:
- **Ancients** (feasible, mostly mechanical): 171 country/region first tokens plus ~1,000 country+subregion pairs plus site names. Country centroid as fallback, subregion when present, site when it can be resolved (many are well-known archaeological sites). Expect ~90% automatable with a gazetteer plus a hand-built override table; date ranges can be attached from the period token with a lookup table per region.
- **Moderns** (needs a curated table): 623 distinct ethnonyms, 381 seen once. Country appears in the label only when needed for disambiguation. Many groups are non-territorial (Ashkenazi Jews, Roma, African American, Coloured, Afro-Kuwaiti). Plan: an ethnonym → (lat, lon, country, notes) table, seeded by an LLM pass and reviewed by hand, plus per-row overrides where a region/city token exists (e.g. `Turkish_Bayburt`, `French_Occitan_Auvergne-Rhone-Alpes_Puy-de-Dome`). Store it as a versioned CSV in `data/geo/` and document its provenance in `DATA_NOTES.md`.

Design consequence: a "click on a location" map is really "click on the nearest *placed* population(s)". Multiple populations share one place (e.g. 101 ancient rows for Lazio across periods), so the map needs a period filter or slider for ancients and a way to stack co-located moderns.

## 3. Visualisation plan (not implemented yet)

1. **Preprocessing** (`uv` script): parse labels into structured fields (kind, first token, subregion, period, profile, outlier flag, low_res flag, n), attach geo coordinates, compute the Ward tree once, store as one Parquet/JSON bundle. 6,020 × 25 floats is ~1 MB; the full 6,020² distance matrix is 145 MB as float32, so do not ship it. Compute distances client-side from the 25 coordinates (6,020 × 25 multiply-adds per click is trivial).
2. **Map, "similarity heatmap" mode**: click a location → nearest placed population (or a point interpolated from the k nearest, e.g. inverse-distance-weighted G25 coordinates, which makes sense for clines) → colour every placed population by distance to it → optional IDW-interpolated raster over land. Side panel: ranked closest populations with distance ×100, n, and flags.
3. **Map, "cluster colouring" mode**: pick a depth in the Ward tree (slider) → colour populations by cluster with hierarchical colours → legend built from the tree.
4. **Standalone tree**: collapsible dendrogram (UPGMA or Ward), leaves coloured the same way, with search, and with n/low_res/outlier shown. Linked to the map: hovering a branch highlights its members on the map.
5. Ancient/modern toggle and period filter throughout.

Tech: static site (no server needed), data as compressed JSON, MapLibre or Leaflet for the map, D3 for the tree. Everything runs in the browser.

## 4. Open questions for the user
- A **2026 edition** of the collection is already out (Eupedia thread, mirrored by HubG25, reportedly ~8,300 averages). Build on 2025 as planned, or switch now? Switching later means re-doing geocoding for new labels.
- Include the "With Sims" sheets too (flagged), or stay with No Sims? No Sims is cleaner; sims mainly fill Balkan/Mediterranean minorities.
- Geocoding precision target for moderns: country centroid is quick, but ethnic groups within a country (Kurds, Berbers, castes) need finer placement to be meaningful.
- Should the tree be built on moderns only (cleaner, one point in time) with ancients projected onto it afterwards, or on both together? Recommendation: moderns-only tree for the default map, combined tree as an option.
