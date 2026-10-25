"""Copy every SDMonster (Outpost chibi Rapture) bundle out of the local NIKKE install.

Read-only on the game. Input: the decoded catalog raw/outpost-research/core-catalog.sqlite3
(see inspection.json for its NKDB source) and the install's core chunk store. Output:
raw/outpost-research/sdmonster_assets_<id>_<hash>.bundle, which tools/convert-raptures.py reads.
Store index (CIDX v1): 12-byte header, then 16-byte hash + uint64 offset + uint32 size records.
Chunks are Zstandard frames; a bundle is its chunks placed at their catalog file offsets.
Usage: python tools/extract-raptures.py [NIKKE install dir]
"""
from pathlib import Path
import sqlite3
import struct
import sys

import zstandard

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / 'raw/outpost-research'
INSTALL = Path(sys.argv[1] if len(sys.argv) > 1 else r'C:\Program Files (x86)\NIKKE')
STORE = INSTALL / 'Unity/com_proximabeta_NIKKE/com.shiftup.patch/core/chunk'


def store_index():
    data = (STORE / 'store.cdb.idx').read_bytes()
    magic, version, count = struct.unpack_from('<4sII', data)
    assert (magic, version) == (b'CIDX', 1), 'Unknown chunk index format'
    records = (struct.unpack_from('<16sQI', data, 12 + i * 28) for i in range(count))
    return {digest: (offset, size) for digest, offset, size in records}


def main():
    index = store_index()
    catalog = sqlite3.connect(f"file:{RAW / 'core-catalog.sqlite3'}?mode=ro", uri=True)
    rows = catalog.execute("""
        SELECT f.key, c.hash, c.original_size, m.file_offset FROM files_chunktype f
        JOIN chunk_file_map m ON m.file_id = f.file_id JOIN chunks c ON c.chunk_id = m.chunk_id
        WHERE f.key LIKE 'sdmonster\\_assets\\_%' ESCAPE '\\' ORDER BY f.key, m.file_offset""").fetchall()
    bundles = {}
    for key, digest, size, at in rows:
        bundles.setdefault(key, []).append((digest, size, at))
    decompress = zstandard.ZstdDecompressor().decompress
    with open(STORE / 'store.cdb', 'rb') as store:
        for key, chunks in bundles.items():
            data = bytearray(max(at + size for _, size, at in chunks))
            for digest, size, at in chunks:
                assert digest in index, f'{key}: chunk {digest.hex()} is not installed'
                offset, stored = index[digest]
                store.seek(offset)
                data[at:at + size] = decompress(store.read(stored), max_output_size=size)
            assert data.startswith(b'UnityFS'), f'{key}: not a Unity bundle'
            path = RAW / key
            if path.exists():
                assert path.read_bytes() == data, f'{key}: differs from the existing copy'
                print(f'{key}: unchanged')
            else:
                path.write_bytes(data)
                print(f'{key}: {len(data)} bytes')
    print(f'{len(bundles)} SDMonster bundles in {RAW}')


if __name__ == '__main__':
    main()
