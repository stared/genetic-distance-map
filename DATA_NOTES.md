# Data notes

Running log of data sources, formats, conventions, and known quirks. Keep this updated whenever data is added or reprocessed.

## Sources

### Moriopoulos Collection 2025 (primary dataset)

- **Author:** Michalis Moriopoulos (as he signs on GenArchivist and in Eurogenes comments), hobbyist curator. Not affiliated with any company; explicitly non-commercial, "for educational purposes".
- **Announcement:** https://genarchivist.net/showthread.php?tid=1449 (posted 2025-02-14). Yearly release; 2024 edition had ~5,000 averages from ~30,000 individuals; 2026 edition is planned (target 50,000 individuals).
- **What it is:** population *averages* of Global25 (G25) coordinates, curated from public and privately contributed individual coordinates. Individual coordinates are **not** published (many are private samples). The curator's main added value is sorting heterogeneous cohorts (Imperial Rome, Vikings, Avars, etc.) into named "profiles" instead of leaving them as anonymous outliers.
- **Six spreadsheets** are distributed: All / Ancients / Moderns, each in a "With Sims" and a "No Sims" variant. "Sims" are simulated coordinates used as stopgaps for underrepresented groups.
- **Full 2025 collection (with sims):** 40,285 individuals (13,533 ancient + 26,752 modern) grouped into 6,432 averages.
- **Hosting:** six Google Drive files (xlsx/csv) linked from the thread, e.g. https://drive.google.com/file/d/1LEXkP4ldd4Ssoxn6G60VVuUkHwfzIHmC/view (All averages, with sims).
- **Newer edition exists:** a 2026 edition was announced at https://www.eupedia.com/forum/threads/the-moriopoulos-g25-collection-2026-edition.46470/ (third-party mention of 3,227 modern + 5,071 ancient averages; not verified). Mirrored by HubG25 (see below). Decide whether to move to 2026 before building anything; labels/profiles may have changed.
- **Used downstream by:** https://genetic-distance.com/ (per the user; the site is behind a Vercel bot wall and could not be fetched, so its dataset version, metric and map features are unverified). Also used by MyGeneticMaps (2025 for maps, 2026 for the sample browser) and HubG25 (2026 ancients/moderns).
- **Attribution norms:** no formal license. Author states it is unpaid, "for educational purposes", and cannot release individual coordinates (privacy). Norm is informal credit to "the Moriopoulos Collection" plus Davidski/Eurogenes. Cite the thread when publishing anything built on it and tell the author about errors (he asks for that).

### Local files (`data/`)

Only the two **No Sims** sheets are present locally (no simulated coordinates, no combined sheet):

| File | Rows (averages) | Sum of n (individuals) |
|---|---|---|
| `Moriopoulos Collection 2025 - Ancients (No Sims) Averages.txt` | 3,940 | 13,479 |
| `Moriopoulos Collection 2025 - Moderns (No Sims) Averages.txt` | 2,080 | 23,107 |

The sums are slightly below the announced totals, consistent with sims having been removed (13,533 → 13,479 ancients, 26,752 → 23,107 moderns, so most sims were in the modern sheet).

Obtained 2025-09-04 from the Drive files linked in the thread (saved as plain text). Both sheets are committed in `data/`.

### Global25 (upstream coordinate system)

- Built by David Wesolowski ("Davidski", Eurogenes): a 25-dimensional PCA on ~300k SNPs; individuals are projected into it. Canonical post: https://eurogenes.blogspot.com/2019/07/getting-most-out-of-global25_12.html. Status 2025: https://eurogenes.blogspot.com/2025/02/g25-available-again.html. Coordinates for new raw data are now produced by teepean47 with Davidski via https://g25requests.app/. Illustrative DNA used G25 in the past but has moved off it.
- Eight official sheets (modern/ancient × individuals/averages × scaled/raw), download links enumerated at https://vahaduo.github.io/g25download/. The official *averages* are a smaller, less curated alternative to the Moriopoulos sheets; the official *individual* sheets are what to use if we ever need within-group spread.
- **Scaled vs raw.** Scaled = raw × a constant per PC, no centering. Multipliers measured by the research agent from the official raw vs scaled modern averages (1,085 shared populations, stable to the 4th digit):

  | PC | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|---|
  | k | 11.382 | 10.155 | 3.771 | 3.230 | 3.077 | 2.789 | 2.350 | 2.308 | 2.045 | 1.822 | 1.624 | 1.499 | 1.487 |

  | PC | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 |
  |---|---|---|---|---|---|---|---|---|---|---|---|---|
  | k | 1.376 | 1.357 | 1.326 | 1.304 | 1.267 | 1.257 | 1.251 | 1.248 | 1.237 | 1.232 | 1.205 | 1.197 |

  Whether k is the eigenvalue or its square root is disputed in the community (Huijbregts, author of nMonte, says sqrt: https://genarchivist.net/archive/index.php?thread-348.html=; the decay to ≈1.2 fits raw eigenvalues better). Davidski never published the formula. Treat the multipliers as ground truth and the interpretation as uncertain. Practical consequence: scaled coordinates strongly down-weight PCs above ~10, which is why using all 25 scaled coordinates is fine.
- **Convention:** distances and admixture models are computed on *scaled* coordinates. Never mix scaled and raw. The Moriopoulos sheets are scaled (verified by value ranges and spot-check distances).
- **Metric:** plain 25-D Euclidean distance. Vahaduo prints it as `100*d` with a "%" sign and as raw `d`, e.g. "Distance 1.2623% / 0.01262311" (from the Vahaduo source). We report ×100 throughout.
- Vahaduo tools (https://vahaduo.github.io/): Admixture JS (nnls/nMonte-style modelling + distances, the de-facto standard), Custom PCA, Global25 Views (16 regional 2-D projections), 3D PCA Viewer, G25 Download.

### Geographic coordinates (LLM-assigned, 2025-09-04)

All 6,020 rows have a point. Method: unique "core" labels (label minus n, outlier, low_res, contaminated and profile
tokens; 2,691 ancient + 1,762 modern) were split into 11 chunks and geocoded from model knowledge by Claude
subagents following `data/geo/GEOCODING_INSTRUCTIONS.md`; no web lookups. Output in `data/geo/chunks/*.csv`,
merged into `data/geo/geocoded.csv` (columns: label, lat, lon, precision, place).

| precision | rows | meaning |
|---|---|---|
| site | 2,577 | named archaeological site / town |
| region | 884 | Lazio, Shandong, Catalonia… |
| district | 733 | province / county |
| ethnic | 633 | traditional homeland of a modern group |
| country | 618 | country-level only |
| guess | 575 | uncertain, best estimate (mostly minor sites in Tibet, Kazakhstan, Irkutsk, Xinjiang, Mingrelian villages, Manchu clans) |

Sanity check: the geographic distance to each row's *genetic* nearest neighbour has median 405 km, 90th
percentile 1,646 km. 131 rows are > 4,000 km from their genetic neighbour (`data/geo/suspicious_far_nn.csv`);
inspection shows these are sparse-sampling cases (Americas, colonial-era European profiles in the Americas,
diaspora groups), not geocoding errors. Known deliberate choices: Kendrick's Cave is placed in Wales although
the label says England; Posusje is placed in Bosnia (eponymous site) although the label says Croatia.
Co-located rows are jittered by up to ~0.1–0.3° for display only (`dlat`/`dlon` in `pops.json`).

### Other geographic building blocks (not used yet)

No maintained "G25 label → lat/lon" table exists publicly. Building blocks:
- **AADR `.anno` file** (Reich Lab, Allen Ancient DNA Resource): per-sample lat/lon, locality, political entity, date, coverage. https://dataverse.harvard.edu/dataverse/reich_lab, paper https://www.nature.com/articles/s41597-024-03031-7. G25 ancient labels are AADR-derived but are not AADR IDs, so joining needs fuzzy label parsing (country + period + site).
- **Ajeje Brazorf's G25 Ancients sheets** (dated/undated, with date and coverage per individual), linked from https://sites.google.com/view/gm3302/treesmapsdata/data-global-25. Recommended by Moriopoulos himself.
- **HubG25** (https://hubg25.github.io/HubG25/): aggregator with one-click datasets (official G25, Moriopoulos 2026, Akbari et al. 2026) and AADR v66 / Akbari 2026 explorers whose schemas include lat/lon. Its mapper requires manual pin placement, so it ships no label→coordinate table.
- **MyGeneticMaps** (https://mygeneticmaps.com/): renders Moriopoulos-based distances as heatmaps over ~3,800 admin subdivisions (polygons, not points). Closest existing thing to the planned map; worth looking at for UX, not for data.

## Format

- Plain CSV, no header, UTF-8, one row per population average.
- Column 0: label. Columns 1–25: G25 coordinates (floats). All 6,020 rows parse cleanly, no missing or malformed rows, no duplicate labels, no duplicate coordinate vectors, no near-duplicate pairs (nothing closer than 0.003 Euclidean).
- Labels may contain commas? No: every row splits into exactly 26 fields, so labels are comma-free. Labels can contain quotes, slashes, apostrophes, pipes (`Hai||om`, `Ju/'hoansi`, `France_MN_Gurgy_"les_Noisats"`). Do not use the label as a filesystem path without sanitising.
- Coordinates are the **scaled** G25 variant (see Conventions below). Evidence: Abkhazian sits at PC1≈0.109, PC2≈0.118, and Polish→Ukrainian distance is ≈0.010, both matching community-published scaled values.

## Label conventions

Labels are underscore-joined tokens following AADR/Eurogenes usage, extended by the curator. Conventions observed in the data and confirmed by the research:

- `_(n=K)` — always the last token: number of individuals in the average. Present on every row.
- `_o`, `_o1`, `_o2`, … — outlier(s) split off from the main group. Ancients: 334 rows; moderns: 219 rows. Usually n=1 or 2.
- `_(low_res)` — low-coverage samples (ancients: 445 rows, moderns: 23). Coordinates are noisier; consider down-weighting or excluding.
- `_(contaminated)` — 15 ancient rows flagged by the curator. Exclude for analysis.
- `_(X_Profile)` — curator-assigned ancestry profile for heterogeneous cohorts, e.g. `(Balto-Slavic_Profile)`, `(East_Med_Profile)`, `(East_Asian-Mixed_Profile)`, `(SSA-Mixed_Profile)`, `(Mestizo_Profile)`. 1,304 ancient rows and 157 modern rows carry a profile. 259 distinct parenthesised descriptors in ancients, 105 in moderns. Profiles are a curated *ancestry* grouping, orthogonal to geography and period. Very useful as a sanity check for any clustering.
- Other parenthesised descriptors on moderns are regional/ethnic sub-labels: `(Catalan)`, `(Canarian)`, `(Bavarian)`, `(Italian_Jew)`, etc.
- **Ancient labels** (median 4 tokens, max 10): `Country_[Subregion]_Period_[Culture]_[Site]_[(Profile)]_[o]_[(low_res)]_(n=K)`. First token is a country or macro-region (171 distinct: `Hungary`, `Italy`, `China`, `Germany`, `England`, `Iberia`, `Russia`, …). Second token is often a subregion for large countries (`Italy_Lazio`, `China_Shandong`, `Russia_Samara`, `Iberia_Catalonia`). About 87% of ancient labels contain a recognisable period token; the rest use culture names (`Bell_Beaker`, `Pitted_Ware`, `Hellenistic`), or absolute dates (`Peru_La_Galgada_4100BP`).
- Period abbreviations seen (AADR usage): `UP` (Upper Palaeolithic), `Mesolithic`, `HG`, `N/EN/MN/LN` (Neolithic early/middle/late), `Eneolithic`, `CA/ChL/ECA/MCA/LCA` (Chalcolithic), `BA/EBA/MBA/LBA/MLBA/LNBA/EMBA`, `IA/EIA/MIA/LIA`, `Roman_Empire`, `Late_Antiquity`, `Byzantine`, `Early/High/Late_Medieval`, `Viking_Age`, `Early_Modern`, `HP` (Historical Period, China), `IAI` (Iron Age I, Levant), `Dynasty` names, `Ceramic/Archaic/Formative/Classic` (Americas), `LSA` (Later Stone Age, Africa), `Pastoral` (East Africa).
- **Modern labels** (median 2 tokens, max 7): `Ethnonym_[Country]_[Region]_[Subgroup/Religion/Caste]_[(Descriptor)]_[o]_(n=K)`. First token is a demonym/ethnonym, **not** a place (623 distinct, 381 of them appear only once). 365 labels are a bare ethnonym. Country appears as a second token only when disambiguating (`Assyrian_Iraq`, `Azeri_Georgia`). Religion/caste appear for South Asia and the Middle East (`Malayali_Christian_Roman_Catholic`, `Odia_Khandayat`, `Lebanese_Arab_Christian_Maronite_Zgharta`).

## Sample-size distribution

| | Ancients | Moderns |
|---|---|---|
| median n | 1 | 5 |
| share with n=1 | 54% | 21% |
| max n | 129 (Austria Avar-period, South Slavic profile) | 1,203 (`Ashkenazi_Jew`) |

Half of the ancient "averages" are single individuals. Any weighting scheme has to decide whether `Ashkenazi_Jew_(n=1203)` counts 1,203× more than a singleton.

## Geometry sanity checks (scaled coordinates, distances reported ×100 as in Vahaduo)

- Column variance is concentrated: PC2 44%, PC1 24%, then PC8 5.6%, PC3 5%, PC4 5%. Re-PCA of the averages: 2 components explain 71%, 5 explain 91%, 10 explain 98%. PC1 separates Sub-Saharan Africa (≈ −0.6) from Eurasia; PC2 separates East Asia (≈ −0.43) from West Eurasia.
- Nearest-neighbour distances: moderns median 1.58, ancients median 2.41 (×100). Ancient → nearest modern median 3.5; modern → nearest ancient median 2.7.
- Spot checks: Polish → Ukrainian_Sumy 1.01; English → Welsh 0.43; Finnish → Finnish_Central 0.98; Yoruba → Esan 0.88; Ashkenazi_Jew → Ashkenazi_Jew_Poland 0.43; Japanese → Korea_Three_Kingdoms 1.44 (nearest *modern* is further, showing thin modern East-Asian coverage outside China). All plausible.

## Known gaps / caveats

- No latitude/longitude anywhere in the data. Geocoding must be built separately: ancients by country/subregion/site (feasible, 171 first tokens plus ~1,000 country+subregion pairs), moderns by ethnonym (harder; needs a hand-curated or LLM-assisted gazetteer of ~620 ethnonyms, many of which are diaspora or non-territorial groups such as `Ashkenazi_Jew`, `Roma`, `African_American`, `Coloured`).
- No dates for ancient rows beyond the period token. Ajeje's ancient-sample sheet and the AADR annotation file have dates and coverage for individuals but not for these curated averages; a join would go through the label text.
- Individual coordinates are unavailable, so within-group variance cannot be recovered; only n is known.
- Coverage is very uneven: Europe and the Near East dominate; the Americas, Oceania, and inner Africa are thin, especially for moderns.
- Labels are a curator's judgement, not a taxonomy; profiles and outlier tags may change between yearly editions.

## Era of ancient samples

Ancient labels carry period codes but no dates, so `analysis/era.py` assigns each ancient average one
of four eras from its label tokens (matched after the country; when several match, the latest wins,
so `LBA-EIA` is ancient). Explicit dates (`…BP`, `…CE`) override. Unmatched labels default to ancient.

| era | rule | rows |
|---|---|---|
| prehistoric | Palaeolithic to Bronze Age codes (UP, Mesolithic, N/EN/MN/LN, CA, BA/EBA/MBA/LBA, cultures such as LBK, Corded Ware, Yamnaya), or dated before 800 BCE | 1,611 |
| ancient | Iron Age to late antiquity (IA, Hallstatt, La Tene, Scythian, Roman, Antiquity, Han, Maya…), or 800 BCE to 500 CE | 1,044 |
| medieval | Medieval, Viking, Avar, Byzantine, Tang…, Precolonial Americas, or 500 to 1500 CE | 1,109 |
| early modern | Modern, Colonial, Ming/Qing, or after 1500 CE | 176 |

The map never shows ancient samples; the era only labels them in search results and in the query header.
