import re, numpy as np, pandas as pd
from collections import Counter
pd.set_option("display.width",250); pd.set_option("display.max_colwidth",120)
for k in ["ancients","moderns"]:
    df=pd.read_parquet(f"analysis/{k}.parquet")
    print(f"\n########## {k}")
    # parenthesized descriptors
    par=Counter(p for b in df.base for p in re.findall(r"\(([^()]*)\)", b))
    print("distinct paren descriptors:", len(par)); print(par.most_common(60))
    df["core"]=df.base.str.replace(r"\([^()]*\)","",regex=True).str.strip("_").str.replace("__","_")
    df["outlier"]=df.core.str.contains(r"_o\d*$")
    print("outlier rows:", df.outlier.sum())
    first=df.core.str.split("_").str[0]
    print("distinct first tokens:", first.nunique())
    print("first tokens seen once:", (first.value_counts()==1).sum())
    print("sample of first tokens seen once:", first.value_counts()[first.value_counts()==1].index[:60].tolist())
    print("largest n:", df.sort_values("n",ascending=False).head(15)[["label","n"]].to_string())
    # Big n=1 labels sample
    print("sample of n=1 labels:", df[df.n==1].label.sample(15,random_state=0).tolist())
    # depth of hierarchy by number of tokens
    print("token count per label:", df.core.str.count("_").add(1).describe().to_dict())
    # how many share first two tokens
    two=df.core.str.split("_").str[:2].str.join("_")
    print("distinct first-2 tokens:", two.nunique())
    print("random labels:", df.label.sample(25,random_state=1).tolist())
