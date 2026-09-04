import re, numpy as np, pandas as pd
from scipy.cluster.hierarchy import linkage, fcluster
from sklearn.metrics import adjusted_rand_score, normalized_mutual_info_score
anc=pd.read_parquet("analysis/ancients.parquet"); pcs=[f"pc{i}" for i in range(1,26)]
prof=anc.base.str.extract(r"\(([^()]*_Profile)\)")[0]
sub=anc[prof.notna()].copy(); sub["profile"]=prof[prof.notna()]
top=sub.profile.value_counts(); keep=top[top>=15].index; sub=sub[sub.profile.isin(keep)]
print("rows with a frequent profile:", len(sub), "profiles:", len(keep))
X=sub[pcs].values
for method in ["average","complete","ward"]:
    Z=linkage(X,method)
    for k in [len(keep)//2, len(keep), 2*len(keep)]:
        lab=fcluster(Z,k,"maxclust")
        print(f"{method:8s} k={k:3d} ARI={adjusted_rand_score(sub.profile,lab):.3f} NMI={normalized_mutual_info_score(sub.profile,lab):.3f}")
# Where does the tree disagree? purity per profile at ward k=len(keep)
Z=linkage(X,"ward"); lab=fcluster(Z,len(keep),"maxclust")
ct=pd.crosstab(sub.profile,lab)
print("purity per profile (max cluster share):"); print((ct.max(1)/ct.sum(1)).sort_values().round(2).to_string())
# spread of each profile: mean distance to profile centroid vs NN dist
for p in keep[:10]:
    Y=sub[sub.profile==p][pcs].values; c=Y.mean(0); print(f"{p:40s} n={len(Y):3d} mean dist to centroid x100 = {100*np.linalg.norm(Y-c,axis=1).mean():.2f}")
