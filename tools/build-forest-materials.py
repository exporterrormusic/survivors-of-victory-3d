"""Deterministic, seamless forest prop surfaces. Run with Python + Pillow + NumPy."""
from pathlib import Path
import numpy as np
from PIL import Image

OUT = Path(__file__).resolve().parents[1] / 'public/environment/forest-kit-v2'
OUT.mkdir(parents=True, exist_ok=True)
N = 512
rng = np.random.default_rng(416)
y, x = np.mgrid[:N, :N] / N

def noise(cells):
    a = rng.random((cells, cells)).astype('float32')
    # Wrap the grid before interpolation so both the color and normals tile.
    a = np.tile(a, (3, 3))
    return np.asarray(Image.fromarray(a).resize((N*3, N*3), Image.Resampling.BICUBIC))[N:N*2, N:N*2] - .5

coarse, mid, fine = noise(8), noise(32), noise(128)
grain = rng.random((N, N)) - .5

def save(name, color, height, strength=2):
    Image.fromarray(np.uint8(np.clip(color, 0, 255))).save(OUT / f'{name}.webp', quality=92)
    dx = (np.roll(height, -1, 1)-np.roll(height, 1, 1))*strength
    dy = (np.roll(height, -1, 0)-np.roll(height, 1, 0))*strength
    normal = np.stack((-dx, -dy, np.ones_like(dx)), -1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    Image.fromarray(np.uint8((normal*.5+.5)*255)).save(OUT / f'{name}-normal.png')

stone = coarse*32+mid*24+fine*16+grain*8
pits = np.maximum(0, -fine-.22)*100
save('stone', np.array([137, 139, 132])+stone[..., None]-pits[..., None], stone/90, 2)
warp = np.sin(y*np.pi*4)*.009 + np.sin(y*np.pi*10)*.003
fibers = np.sin((x+warp)*np.pi*120)*.5 + np.sin((x+warp)*np.pi*270)*.2
wood = fibers*6+coarse*21+mid*9+grain*5
cracks = np.maximum(0, np.sin((x+warp)*np.pi*42)-.96)*150
# Elongated knots and faded grain on grey-brown outdoor timber.
for kx, ky in [(.23,.35),(.72,.81)]:
    dx=np.minimum(abs(x-kx),1-abs(x-kx));dy=np.minimum(abs(y-ky),1-abs(y-ky))
    distance=np.sqrt((dx*3.5)**2+dy**2)
    wood += np.sin(distance*220)*np.exp(-distance*34)*12-np.exp(-distance*90)*24
save('wood', np.array([111, 101, 86])+wood[..., None]-cracks[..., None], (wood-cracks)/100, 1.4)
slate = coarse*21+mid*15+fine*12+grain*6
save('shingle', np.array([85, 96, 105])+slate[..., None], slate/100, 2)
rust = np.clip(coarse*3+.2, 0, 1)
iron = np.array([58, 65, 67])+rust[..., None]*np.array([49, 10, -18])+fine[..., None]*19
save('iron', iron, (fine+mid)*.25, 1.3)
moss = coarse*31+mid*29+fine*35+grain*15
save('moss', np.array([62, 72, 45])+moss[..., None], moss/110, 2)
rope = np.sin((x*18+y*70)*np.pi*2)*13+fine*10
save('rope', np.array([139, 120, 84])+rope[..., None], rope/80, 1.5)
ripple = np.sin(x*np.pi*12+np.sin(y*np.pi*6))* .06 + fine*.025
save('water', np.array([26, 36, 43])+ripple[..., None]*12, ripple, 2)
skin = coarse*12+mid*11+fine*12+grain*5
freckles = np.maximum(0, fine-.23)*65
save('pumpkin', np.array([194, 83, 19])+skin[..., None]*np.array([1,.65,.24])-freckles[..., None], skin/100, 1.6)
print(f'Wrote eight color/normal pairs to {OUT}')
