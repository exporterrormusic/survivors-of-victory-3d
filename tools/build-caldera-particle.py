"""Deterministic noise-based particle opacity mask; no runtime canvas work."""
from pathlib import Path
import numpy as np
from PIL import Image
rng=np.random.default_rng(407);size=256
y,x=np.mgrid[-1:1:complex(size),-1:1:complex(size)]
noise=np.zeros((size,size))
for cells,weight in [(5,.5),(12,.28),(27,.15),(64,.07)]:
    sample=Image.fromarray(rng.random((cells,cells)).astype('float32'))
    noise+=np.array(sample.resize((size,size),Image.Resampling.BICUBIC))*weight
radius=np.sqrt((x+.08*np.sin(y*9))**2+(y+.06*np.sin(x*11))**2)
alpha=np.clip((1-radius)*2.2,0,1)*np.clip((noise-.25)*2,0,1)
rgba=np.zeros((size,size,4),dtype='uint8');rgba[:,:,:3]=np.uint8(np.clip((.65+noise*.35)*255,0,255))[:,:,None];rgba[:,:,3]=np.uint8(alpha*210)
out=Path(__file__).resolve().parents[1]/'public/environment/caldera-v1/smoke.png'
Image.fromarray(rgba).save(out);print(out)
