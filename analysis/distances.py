import numpy as np, pandas as pd
from scipy.spatial.distance import pdist, squareform, cdist
from scipy.cluster.hierarchy import linkage, fcluster, cophenet
from collections import Counter
pd.set_option("display.width",250)
anc=pd.read_parquet("analysis/ancients.parquet"); mod=pd.read_parquet("analysis/moderns.parquet")
anc["kind"]="ancient"; mod["kind"]="modern"
df=pd.concat([anc,mod],ignore_index=True)
pcs=[f"pc{i}" for i in range(1,26)]
X=df[pcs].values
print("combined rows:", len(df))
# PCA variance of averages
Xc=X-X.mean(0); ev=np.linalg.eigvalsh(np.cov(Xc.T))[::-1]
print("var explained by each of the 25 coords (raw column var, normalized):", np.round(X.var(0)/X.var(0).sum(),3))
print("cum var top-k of re-PCA:", np.round(np.cumsum(ev)/ev.sum(),3)[[0,1,2,4,9,14,19,24]])

# Nearest neighbours for known moderns
D=squareform(pdist(X))
np.fill_diagonal(D,np.inf)
def nn(pattern,k=6):
    idx=df.index[df.label.str.match(pattern)].tolist()
    for i in idx[:1]:
        order=np.argsort(D[i])[:k]
        print(f"  {df.label[i]}: "+"; ".join(f"{df.label[j]} {100*D[i,j]:.2f}" for j in order))
for p in [r"Polish_\(", r"Finnish_\(", r"Han_\(", r"Yoruba", r"Ashkenazi_Jew_\(", r"Sardinian_\(", r"English_\(", r"Japanese_\(", r"Greek_\(", r"Turkish_\("]:
    nn(p)
# NN distance distributions
nnd=D.min(1)
for kind in ["ancient","modern"]:
    m=(df.kind==kind).values
    print(kind,"NN dist x100 quantiles:", np.round(100*np.quantile(nnd[m],[0.01,0.1,0.5,0.9,0.99]),2))
print("near-duplicate pairs (<0.3 x100):", int((np.triu(D<0.003)).sum()))
i,j=np.where(np.triu(D<0.003)); print([(df.label[a],df.label[b]) for a,b in zip(i,j)][:10])
# moderns' nearest ancient and vice versa
Dam=cdist(anc[pcs].values, mod[pcs].values)
print("ancient->nearest modern x100 quantiles:", np.round(100*np.quantile(Dam.min(1),[0.1,0.5,0.9]),2))
print("modern->nearest ancient x100 quantiles:", np.round(100*np.quantile(Dam.min(0),[0.1,0.5,0.9]),2))

# hierarchical clustering on moderns (excluding outliers) 
sub=mod[~mod.label.str.contains(r"_o\d*_\(")].reset_index(drop=True)
Xs=sub[pcs].values; ds=pdist(Xs)
print("\nmoderns for clustering:", len(sub))
for method in ["single","complete","average","weighted","centroid","ward"]:
    Z=linkage(Xs,method=method) if method in("centroid","ward") else linkage(ds,method=method)
    c,_=cophenet(Z,ds)
    sizes=[]
    for k in [5,10,20,50]:
        lab=fcluster(Z,k,criterion="maxclust"); cnt=np.bincount(lab)[1:]
        sizes.append((k, int(cnt.max()), int((cnt==1).sum())))
    print(f"{method:9s} cophenetic={c:.3f}  (k, largest cluster, singletons): {sizes}")
Z=linkage(Xs,"ward")
for k in [8,15]:
    lab=fcluster(Z,k,criterion="maxclust")
    print(f"\n--- ward k={k}")
    for c in range(1,k+1):
        names=sub.label[lab==c].str.replace(r"_\(n=\d+\)","",regex=True)
        first=Counter(names.str.split("_").str[0]).most_common(8)
        print(f"  c{c} n={len(names)}: {first}")
# weighted by sample size? not for now. Save linkage
np.save("analysis/ward_moderns_Z.npy",Z); sub.to_parquet("analysis/moderns_clean.parquet")
