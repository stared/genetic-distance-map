import re, numpy as np, pandas as pd
from scipy.cluster.hierarchy import linkage, fcluster
from collections import Counter
anc=pd.read_parquet("analysis/ancients.parquet"); mod=pd.read_parquet("analysis/moderns.parquet")
pcs=[f"pc{i}" for i in range(1,26)]
ERA=r"(Paleolithic|UP|Mesolithic|Meso|HG|Neolithic|EN|MN|LN|N|Eneolithic|ChL|CA|Chalcolithic|Copper_Age|BA|EBA|MBA|LBA|MLBA|LNBA|EMBA|LBA-EIA|IA|EIA|MIA|LIA|Roman|Antiquity|Byzantine|Medieval|Modern|Viking|Historical|HP|Dynasty|Period|Ceramic|Archaic|Formative|Classic|LSA|Pastoral)"
has=anc.base.str.contains(r"(?:^|_)"+ERA+r"(?:_|$|-)",regex=True)
print("ancient labels with a recognizable era token:", has.mean().round(3), " missing examples:", anc.base[~has].sample(20,random_state=0).tolist())
# subregion second token for top countries
for c in ["Italy","China","Russia","Iberia","Hungary","England","Kazakhstan"]:
    s=anc.base[anc.base.str.startswith(c+"_")].str.split("_").str[1]
    print(c, Counter(s).most_common(10))
print("Korean moderns:", mod.label[mod.label.str.startswith("Korean")].tolist())
print("Han moderns sample:", mod.label[mod.label.str.startswith("Han")].head(8).tolist())
print("moderns with country as 2nd token sample:", mod.base[mod.base.str.contains(r"^[A-Za-z-]+_(Turkey|Iran|Iraq|Syria|Russia|Georgia|Kenya|Gambia|India|Pakistan|Spain|Italy|France|Germany)")].head(10).tolist(), (mod.base.str.count("_")==0).sum(), "single-token modern labels")
sub=anc[~anc.label.str.contains(r"_o\d*_\(") & ~anc.base.str.contains("low_res") & ~anc.base.str.contains("contaminated")].reset_index(drop=True)
print("ancients for clustering:", len(sub))
Z=linkage(sub[pcs].values,"ward"); lab=fcluster(Z,12,criterion="maxclust")
for c in range(1,13):
    names=sub.base[lab==c]; print(f"  c{c} n={len(names)}: {Counter(names.str.split('_').str[0]).most_common(6)}")
# effect of n-weighting: how different are n-weighted vs unweighted centroids of Ward k=12?
