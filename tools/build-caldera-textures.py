"""Package original generated PNG surfaces as high-quality WebP runtime textures."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
for name in ['basalt','ash','lava']:
    source=root/'assets/environment-source/caldera-v1'/f'{name}.png'
    output=root/'public/environment/caldera-v1'/f'{name}.webp'
    Image.open(source).save(output,quality=92,method=6)
    print(f'{name}: {output.stat().st_size:,} bytes')
