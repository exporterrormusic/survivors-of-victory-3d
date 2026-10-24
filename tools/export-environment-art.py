"""Copy generated originals and encode runtime WebP, preserving resolution/alpha."""
import json
import shutil
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
manifest_path = root / 'assets/environment-source/painted-props-assets.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
for asset in manifest['assets']:
    original = root / asset['original']
    if not original.exists():
        shutil.copy2(asset['source'], original)
    image = Image.open(original)
    runtime = root / asset['runtime']
    image.save(runtime, 'WEBP', quality=94, method=6, exact=True)
    asset['width'], asset['height'] = image.size
    asset['bytes'] = runtime.stat().st_size
    asset['alpha'] = image.getchannel('A').getextrema() if image.mode == 'RGBA' else None
    print(asset['name'], image.size, image.mode, asset['bytes'], asset['alpha'])
manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
