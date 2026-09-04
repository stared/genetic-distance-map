import re, pandas as pd, math
def core(base):
    s=re.sub(r"_\(n=\d+\)$","",base)
    s=re.sub(r"_?\((low_res|contaminated)\)","",s)
    s=re.sub(r"_?\([^()]*Profile\)","",s)
    s=re.sub(r"_o\d*$","",s)
    return s.strip("_")
out={}
for k in ["ancients","moderns"]:
    df=pd.read_parquet(f"analysis/{k}.parquet")
    df["core"]=df.label.map(core)
    u=sorted(df.core.unique())
    print(k, len(df), "unique cores:", len(u))
    out[k]=u
    df[["label","core"]].to_csv(f"data/geo/{k}_label_core.csv",index=False)
# chunk
for k,u in out.items():
    size=430 if k=="moderns" else 480
    n=math.ceil(len(u)/size)
    for i in range(n):
        open(f"data/geo/todo/{k}_{i+1:02d}.txt","w").write("\n".join(u[i*size:(i+1)*size])+"\n")
    print(k, n, "chunks")
