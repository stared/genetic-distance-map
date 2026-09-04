# Geocoding instructions for population labels

You are given a text file with one population label per line. These are labels of
Global25 population averages (Moriopoulos Collection). Produce a CSV with the best
geographic point for each label, from your own knowledge. Do not use web search;
work from what you know, and mark uncertainty in the `precision` column.

## Output

Write a CSV (UTF-8, header row, comma separated, quote fields that contain commas)
with EXACTLY these columns:

    label,lat,lon,precision,place

- `label`: the input line, verbatim (do not alter, do not skip any line).
- `lat`, `lon`: decimal degrees, 2 decimals are enough. lon in [-180,180].
- `precision`: one of
    - `site`     : a specific archaeological site / town / village named in the label
    - `district` : a province, county, canton, prefecture, valley etc.
    - `region`   : a larger region (Lazio, Shandong, Catalonia, Peloponnese, Kurdistan)
    - `country`  : country centroid or the country's main population centre
    - `ethnic`   : the traditional homeland of an ethnic group when no place is named
    - `guess`    : you are unsure; give your best estimate anyway
- `place`: short human-readable place name you geocoded to (e.g. "Tarquinia, Lazio, Italy").

Every input line must appear exactly once in the output. Never leave lat/lon empty.

## Label conventions

Tokens are joined with underscores. Ancient labels look like
`Country_[Subregion]_Period_[Culture]_[Site]` e.g. `Italy_Lazio_IA_Etruscan-Roman_Republic_Tarquinia`,
`China_Shandong_N_Houli_Boshan`, `Russia_Samara_EBA_Yamnaya`, `Kazakhstan_IA_Sarmatian_Sapibulak`.
Period tokens (UP, Mesolithic, N, EN, MN, LN, Eneolithic, CA, ChL, BA, EBA, MBA, LBA, MLBA, IA, EIA,
LIA, Roman_Empire, Late_Antiquity, Byzantine, Early/High/Late_Medieval, Viking_Age, HP, Dynasty, ...)
and culture names (Bell_Beaker, Corded_Ware, Yamnaya, Avar, Scythian, Longshan, ...) are NOT places,
but a culture name can narrow the region when no site is given (e.g. Yamnaya in Samara).
Prefer the most specific place: site > district > region > country.
"Iberia" is used for Spain+Portugal; use the subregion when present.
Regions of Russia/China/Kazakhstan are often given as the second token (oblast/province).
Country names like "USA", "Peru", "Brazil" followed by a site name: geocode the site.
`Xinjiang`, `Tibet`, `Irkutsk`, `Zabaykalsky`, `Stavropol`, `Altai`, `Omsk`, `Chukotka` etc. appear
as first tokens (Russian/Chinese regions used directly).

Modern labels look like `Ethnonym_[Country]_[Region]_[Subgroup]_[(Descriptor)]`, e.g.
`Turkish_Bayburt`, `Assyrian_Iraq`, `French_Occitan_Auvergne-Rhone-Alpes_Puy-de-Dome`,
`Malayali_Christian_Roman_Catholic`, `Han_Guangdong_Guangzhou`, `Mijikenda_Chonyi`,
`Italian_Apulia_(Apulian)`, `Ashkenazi_Jew_Poland`, `Spanish_Canarias_Gran_Canaria_(Canarian)`.
When only an ethnonym is given, use the group's traditional homeland / main concentration
(`ethnic`). For diaspora groups without a place (Ashkenazi_Jew, Roma, African_American, Coloured,
Afro-Kuwaiti, Anglo-American_Utah) place them at the country/region they are associated with in the
label, or at the historical centre of the community, and mark `guess` if arbitrary.
Descriptors like `(SSA-Mixed)`, `(European-Mixed)`, `(Mestizo)`, religion, caste or clan names are
not places. Indian labels with caste names: use the state associated with the ethnonym/language.

Write the CSV with the Write tool in one go (or a few appends). Do not print the whole CSV to
your final message; just report the file path, the number of rows, and any labels you were very
unsure about (max 20).
