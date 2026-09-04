"""Build app/public/data/*.json from the raw sheets + geocoding chunks.
Run from repo root: uv run --with pandas --with numpy --with scipy python analysis/build_data.py
"""
import re, json, glob, math, os
import numpy as np, pandas as pd
from scipy.cluster.hierarchy import linkage
from scipy.spatial import cKDTree
from scipy.spatial.distance import cdist
from era import era

FILES={"a":"data/Moriopoulos Collection 2025 - Ancients (No Sims) Averages.txt",
       "m":"data/Moriopoulos Collection 2025 - Moderns (No Sims) Averages.txt"}
PCS=[f"pc{i}" for i in range(1,26)]

def core(base):
    s=re.sub(r"_\(n=\d+\)$","",base)
    s=re.sub(r"_?\((low_res|contaminated)\)","",s)
    s=re.sub(r"_?\([^()]*Profile\)","",s)
    s=re.sub(r"_o\d*$","",s)
    return s.strip("_")

rows=[]
for kind,p in FILES.items():
    for line in open(p,encoding="utf-8"):
        parts=line.rstrip("\r\n").split(",")
        if len(parts)!=26: continue
        label=parts[0]; base=re.sub(r"_\(n=\d+\)$","",label)
        n=int(re.search(r"\(n=(\d+)\)",label).group(1))
        prof=re.search(r"\(([^()]*Profile)\)",base)
        rows.append(dict(label=label,kind=kind,n=n,core=core(label),
            o=bool(re.search(r"_o\d*(_\(|$)",base)), low="(low_res)" in base, cont="(contaminated)" in base,
            profile=prof.group(1).replace("_"," ") if prof else "",
            first=core(label).split("_")[0], era=era(core(label)) if kind=="a" else "",
            **{c:float(v) for c,v in zip(PCS,parts[1:])}))
df=pd.DataFrame(rows); df["id"]=np.arange(len(df))
print("pops:",len(df))

# ---- geo
geo=pd.concat([pd.read_csv(f) for f in sorted(glob.glob("data/geo/chunks/*.csv"))],ignore_index=True)
geo=geo.drop_duplicates("label")
geo["lat"]=pd.to_numeric(geo.lat,errors="coerce"); geo["lon"]=pd.to_numeric(geo.lon,errors="coerce")
bad=geo[geo.lat.isna()|geo.lon.isna()|(geo.lat.abs()>90)|(geo.lon.abs()>180)]
if len(bad): print("BAD geo rows:",len(bad)); print(bad.head(20).to_string())
geo=geo[~geo.index.isin(bad.index)]
df=df.merge(geo.rename(columns={"label":"core"})[["core","lat","lon","precision","place"]],on="core",how="left")
miss=df[df.lat.isna()]
print("pops without geo:",len(miss)); print(miss.core.unique()[:40])
geo.sort_values("label").to_csv("data/geo/geocoded.csv",index=False)
print("precision counts:",df.precision.value_counts().to_dict())

# sanity: how far away (km) is each pop's genetic nearest neighbour?
X=df[PCS].values; ok=df.lat.notna().values
D=cdist(X[ok],X[ok]); np.fill_diagonal(D,np.inf); nn=D.argmin(1)
sub=df[ok].reset_index(drop=True)
def hav(a,b,c,d):
    a,b,c,d=map(np.radians,(a,b,c,d)); h=np.sin((c-a)/2)**2+np.cos(a)*np.cos(c)*np.sin((d-b)/2)**2
    return 6371*2*np.arcsin(np.sqrt(h))
km=hav(sub.lat.values,sub.lon.values,sub.lat.values[nn],sub.lon.values[nn])
sub["nn_km"]=km.round(0); sub["nn"]=sub.label.values[nn]; sub["nn_place"]=sub.place.values[nn]
print("genetic-NN geographic distance km quantiles (50/90/99%):",np.quantile(km,[.5,.9,.99]).round(0))
sub[km>4000][["label","place","nn","nn_place","nn_km"]].sort_values("nn_km",ascending=False).to_csv("data/geo/suspicious_far_nn.csv",index=False)
print("pops whose genetic NN is >4000 km away:",int((km>4000).sum()),"(data/geo/suspicious_far_nn.csv)")

# jitter co-located points deterministically (small spiral), display only
df["dlat"]=df.lat; df["dlon"]=df.lon
key=df.lat.round(2).astype(str)+","+df.lon.round(2).astype(str)
for k,g in df[df.lat.notna()].groupby(key):
    if len(g)<2: continue
    for j,(i,r) in enumerate(g.iterrows()):
        if j==0: continue
        rad=0.08*math.sqrt(j); ang=j*2.399963
        df.at[i,"dlat"]=r.lat+rad*math.sin(ang); df.at[i,"dlon"]=r.lon+rad*math.cos(ang)/max(0.2,math.cos(math.radians(r.lat)))

# ---- trees (Ward on clean rows; outliers/low_res/contaminated attached to nearest clean row)
def build_tree(mask):
    clean=df[mask]; cl=clean[~(clean.o|clean.low|clean.cont)]
    Z=linkage(cl[PCS].values,"ward")
    tree=cKDTree(cl[PCS].values); _,j=tree.query(clean[PCS].values)
    attach={int(a):int(cl.id.values[b]) for a,b in zip(clean.id.values,j)}
    return dict(leaves=cl.id.tolist(), merges=[[int(a),int(b),round(float(h),6),int(c)] for a,b,h,c in Z], attach=attach)
trees={"m":build_tree(df.kind=="m"),"a":build_tree(df.kind=="a"),"all":build_tree(df.kind.isin(["m","a"]))}
for k,t in trees.items(): print("tree",k,"leaves",len(t["leaves"]),"root height",t["merges"][-1][2])

os.makedirs("app/public/data",exist_ok=True)
def nz(v,f=lambda x:x): return None if pd.isna(v) else f(v)
pops=[dict(id=int(r.id),label=r.label,core=r.core,kind=r.kind,n=int(r.n),o=bool(r.o),low=bool(r.low),cont=bool(r.cont),
        profile=r.profile,first=r.first,era=r.era,
        lat=nz(r.lat,lambda v:round(float(v),3)),lon=nz(r.lon,lambda v:round(float(v),3)),
        dlat=nz(r.dlat,lambda v:round(float(v),3)),dlon=nz(r.dlon,lambda v:round(float(v),3)),
        prec=nz(r.precision),place=nz(r.place),
        c=[round(float(getattr(r,c)),5) for c in PCS]) for r in df.itertuples()]
json.dump(pops,open("app/public/data/pops.json","w"),separators=(",",":"))
json.dump(trees,open("app/public/data/trees.json","w"),separators=(",",":"))
print("wrote pops.json",os.path.getsize("app/public/data/pops.json")//1024,"KB; trees.json",os.path.getsize("app/public/data/trees.json")//1024,"KB")
