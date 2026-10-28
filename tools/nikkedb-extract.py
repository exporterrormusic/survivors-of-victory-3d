# Extract a NIKKE field model from a nikke-db Unity asset bundle (Addressables, WebGL build) into
# plain JSON + PNG, for tools/nikkedb-chibi.mjs to turn into a game GLB.
#
#   python tools/nikkedb-extract.py <bundle> <out-dir>
#
# Used for models NKAS doesn't serve (e.g. c5028_00 Legendary Commander, c5029_00 Liliweiss).
# Bundles: https://nikke-db-legacy.pages.dev/chibi/StreamingAssets/aa/WebGL/<model>_assets_all.bundle
# (model ids come from the viewer's roster in defaultlocalgroup_assets_all.bundle; c942/c943 are
# only the portrait ids). Then: node tools/nikkedb-chibi.mjs c5028_00 <out-dir> c220_00 --icon c942_00
# Needs UnityPy (pip install UnityPy). Values stay in Unity's left-handed space; the Node side
# converts. Output: <out-dir>/model.json and <out-dir>/<texture>.png

import json
import os
import sys

import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler


def vec(v, n):
    return [float(getattr(v, k)) for k in 'xyzw'[:n]]


def main(bundle, out):
    os.makedirs(out, exist_ok=True)
    env = UnityPy.load(bundle)
    objects = {obj.path_id: obj for obj in env.objects}

    # The model root is the "<id>_var" GameObject (not the separate "ground_var" shadow).
    root_go = next(o.read() for o in env.objects if o.type.name == 'GameObject'
                   and o.read().m_Name.endswith('_var') and o.read().m_Name != 'ground_var')
    root_tf = next(c.read() for c in (objects[p.path_id] for p in (c.component for c in root_go.m_Component)) if c.type.name == 'Transform')

    nodes, path_of = [], {}

    def walk(tf, parent, prefix):
        go = tf.m_GameObject.read()
        path = f'{prefix}/{go.m_Name}' if prefix else go.m_Name
        index = len(nodes)
        path_of[tf.object_reader.path_id] = path
        nodes.append({'name': go.m_Name, 'path': path, 'parent': parent,
                      't': vec(tf.m_LocalPosition, 3), 'r': vec(tf.m_LocalRotation, 4), 's': vec(tf.m_LocalScale, 3)})
        for child in tf.m_Children:
            walk(child.read(), index, path)

    walk(root_tf, -1, '')

    parts = []
    for obj in env.objects:
        if obj.type.name != 'SkinnedMeshRenderer':
            continue
        smr = obj.read()
        mesh = smr.m_Mesh.read()
        handler = MeshHandler(mesh)
        handler.process()
        material = smr.m_Materials[0].read() if smr.m_Materials else None
        texture = None
        if material:
            for _, prop in material.m_SavedProperties.m_TexEnvs:
                if prop.m_Texture and prop.m_Texture.path_id:
                    tex = prop.m_Texture.read()
                    texture = f'{tex.m_Name}.png'
                    tex.image.save(os.path.join(out, texture))
                    break
        bindposes = [[float(getattr(m, f'e{r}{c}')) for c in range(4) for r in range(4)] for m in mesh.m_BindPose]  # column-major
        parts.append({
            'node': smr.m_GameObject.read().m_Name,
            'material': material.m_Name if material else None,
            'texture': texture,
            'bones': [path_of.get(b.path_id) for b in smr.m_Bones],
            'bindposes': bindposes,
            'positions': [list(map(float, v)) for v in handler.m_Vertices],
            'normals': [list(map(float, v)) for v in handler.m_Normals],
            'uv': [list(map(float, v)) for v in handler.m_UV0],
            'joints': [list(map(int, v)) for v in handler.m_BoneIndices],
            'weights': [list(map(float, v)) for v in handler.m_BoneWeights],
            'indices': [int(i) for i in handler.m_IndexBuffer],
        })

    with open(os.path.join(out, 'model.json'), 'w', encoding='utf-8') as f:
        json.dump({'root': root_go.m_Name, 'nodes': nodes, 'parts': parts}, f)
    print(f"{root_go.m_Name}: {len(nodes)} nodes, parts: {[(p['node'], len(p['positions'])) for p in parts]}")


if __name__ == '__main__':
    main(*sys.argv[1:3])
