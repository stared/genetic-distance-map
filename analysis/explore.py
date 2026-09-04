import re, sys
import numpy as np, pandas as pd
from collections import Counter

files = {
 "ancients": "data/Moriopoulos Collection 2025 - Ancients (No Sims) Averages.txt",
 "moderns": "data/Moriopoulos Collection 2025 - Moderns (No Sims) Averages.txt",
}
def load(p):
    rows=[]
    bad=[]
    with open(p, encoding="utf-8") as f:
        for i,l in enumerate(f):
            l=l.rstrip("\n\r")
            if not l.strip(): bad.append((i,"empty")); continue
            parts=l.split(",")
            if len(parts)!=26: bad.append((i,len(parts),l[:80])); continue
            try: vals=[float(x) for x in parts[1:]]
            except ValueError: bad.append((i,"nonfloat",l[:80])); continue
            rows.append([parts[0]]+vals)
    df=pd.DataFrame(rows, columns=["label"]+[f"pc{i}" for i in range(1,26)])
    return df,bad

for k,p in files.items():
    df,bad=load(p)
    print(f"\n##### {k}: {len(df)} rows, bad lines: {bad[:5]}")
    m=df.label.str.extract(r"_\(n=(\d+)\)$")
    df["n"]=pd.to_numeric(m[0])
    print("rows without (n=) suffix:", df.n.isna().sum(), df[df.n.isna()].label.head(10).tolist())
    print("n stats:", df.n.describe().to_dict())
    print("sum n:", df.n.sum())
    print("n==1 fraction:", (df.n==1).mean())
    df["base"]=df.label.str.replace(r"_\(n=\d+\)$","",regex=True)
    print("dup labels:", df.label.duplicated().sum(), " dup base:", df.base.duplicated().sum())
    print("low_res:", df.base.str.contains("low_res").sum(), " _o outlier:", df.base.str.contains(r"_o\d*(_|$|\()").sum(), " Profile:", df.base.str.contains("Profile").sum())
    X=df[[f"pc{i}" for i in range(1,26)]].values
    print("coord std per PC (first 8):", np.round(X.std(0)[:8],4))
    print("coord absmax per PC (first 8):", np.round(np.abs(X).max(0)[:8],4))
    print("dup coordinate rows:", pd.DataFrame(X).duplicated().sum())
    # first token
    print("top first tokens:", Counter(df.base.str.split("_").str[0]).most_common(40))
    # token vocab
    toks=Counter(t for b in df.base for t in b.split("_"))
    print("n tokens:", len(toks), toks.most_common(80))
    df.to_parquet(f"analysis/{k}.parquet")
