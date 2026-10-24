"""Convert the verified local Outpost UnityFS bundles to self-contained animated GLBs.

Requires UnityPy 1.25.4 (also looks in artifacts/tooling/unitypy). No game files are
modified. Input: raw/outpost-research/sdmonster_assets_<id>_*.bundle.
Streamed-curve layout reference:
https://github.com/Perfare/AssetStudio/blob/master/AssetStudio/Classes/AnimationClip.cs
Exports native transform curves sampled at their original rate, including streamed
cubic curves, dense samples and constant channels. Template mBase clips are omitted.
"""
from pathlib import Path
import bisect
import io
import json
import struct
import sys
import zlib

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'artifacts/tooling/unitypy'))
import numpy as np
import UnityPy
from UnityPy.helpers.MeshHelper import MeshHandler

MODELS = {'bma002': 'Lure', 'bmg001': 'Pelican', 'mmg005': 'Crawler'}
WIDTHS = {1: 3, 2: 4, 3: 3}
PATHS = {1: 'translation', 2: 'rotation', 3: 'scale'}


def vector(v):
    return [v[c] for c in ('xyzw' if 'w' in v else 'xyz')]


def convert(values, attribute):
    out = np.array(values, dtype=np.float32).copy()
    if attribute == 1:
        out[..., 0] *= -1
    elif attribute == 2:
        out[..., 1:3] *= -1
        out /= np.linalg.norm(out, axis=-1, keepdims=True)
    return out


class Glb:
    def __init__(self):
        self.data = bytearray()
        self.doc = {'asset': {'version': '2.0', 'generator': 'NIKKE MOBA Outpost converter'},
                    'scene': 0, 'scenes': [{'nodes': []}], 'nodes': [],
                    'bufferViews': [], 'accessors': [], 'animations': []}

    def view(self, data, target=None):
        self.data.extend(b'\0' * (-len(self.data) % 4))
        view = {'buffer': 0, 'byteOffset': len(self.data), 'byteLength': len(data)}
        if target:
            view['target'] = target
        self.data.extend(data)
        self.doc['bufferViews'].append(view)
        return len(self.doc['bufferViews']) - 1

    def accessor(self, values, kind, dtype='<f4', target=None, bounds=False):
        a = np.array(values, dtype=dtype)
        assert np.isfinite(a).all(), 'Nonfinite accessor'
        acc = {'bufferView': self.view(a.tobytes(), target),
               'componentType': {'<f4': 5126, '<u2': 5123}[dtype],
               'count': len(a), 'type': kind}
        if bounds:
            shaped = a.reshape(len(a), -1)
            acc.update(min=shaped.min(axis=0).tolist(), max=shaped.max(axis=0).tolist())
        self.doc['accessors'].append(acc)
        return len(self.doc['accessors']) - 1

    def write(self, path):
        self.doc['buffers'] = [{'byteLength': len(self.data)}]
        header = json.dumps(self.doc, separators=(',', ':'), allow_nan=False).encode()
        header += b' ' * (-len(header) % 4)
        self.data.extend(b'\0' * (-len(self.data) % 4))
        path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(header) + len(self.data))
                         + struct.pack('<I4s', len(header), b'JSON') + header
                         + struct.pack('<I4s', len(self.data), b'BIN\0') + self.data)


def sample_clip(clip):
    muscle = clip['m_MuscleClip']
    data = muscle['m_Clip']['data']
    start, end = muscle['m_StartTime'], muscle['m_StopTime']
    fps = clip['m_SampleRate']
    times = np.linspace(start, end, round((end - start) * fps) + 1)
    stream = data['m_StreamedClip']
    curves = [[] for _ in range(stream['curveCount'])]
    packed = struct.pack(f"<{len(stream['data'])}I", *stream['data'])
    cursor = 0
    while cursor < len(packed):
        time, count = struct.unpack_from('<fi', packed, cursor)
        cursor += 8
        for _ in range(count):
            index, *coeff = struct.unpack_from('<i4f', packed, cursor)
            cursor += 20
            curves[index].append((time, coeff))
    streamed = np.empty((len(times), len(curves)))
    for column, keys in enumerate(curves):
        assert keys
        key_times = [k[0] for k in keys]
        for row, time in enumerate(times):
            key_time, (a, b, c, d) = keys[max(0, bisect.bisect_right(key_times, time) - 1)]
            dt = time - key_time
            streamed[row, column] = ((a * dt + b) * dt + c) * dt + d if key_time > -1e20 else d
    dense = data['m_DenseClip']
    samples = np.array(dense['m_SampleArray']).reshape(dense['m_FrameCount'], dense['m_CurveCount'])
    sample_times = dense['m_BeginTime'] + np.arange(len(samples)) / dense['m_SampleRate']
    dense_values = np.array([np.interp(times, sample_times, column) for column in samples.T]).T
    constants = np.tile(data['m_ConstantClip']['data'], (len(times), 1))
    values = np.concatenate((streamed, dense_values, constants), axis=1)
    bindings = clip['m_ClipBindingConstant']['genericBindings']
    assert all(b['typeID'] == 4 and b['attribute'] in WIDTHS for b in bindings), 'Unsupported binding'
    assert sum(WIDTHS[b['attribute']] for b in bindings) == values.shape[1]
    return times - start, values, bindings


def export_model(model_id, label, outdir):
    files = sorted((ROOT / 'raw/outpost-research').glob(f'sdmonster_assets_{model_id}_*.bundle'))
    assert len(files) == 1, f'Expected one extracted bundle for {model_id}'
    env = UnityPy.load(str(files[0]))
    objects = {o.path_id: o for o in env.objects}
    trees = {pid: o.read_typetree() for pid, o in objects.items()
             if o.type.name in ('Transform', 'GameObject', 'SkinnedMeshRenderer', 'AnimationClip', 'Mesh')}
    transforms = {pid: trees[pid] for pid, o in objects.items() if o.type.name == 'Transform'}
    glb = Glb()
    node_ids = {pid: i for i, pid in enumerate(transforms)}
    hashes = {}

    def name(pid):
        return trees[transforms[pid]['m_GameObject']['m_PathID']]['m_Name']

    def relative_path(pid):
        parent = transforms[pid]['m_Father']['m_PathID']
        if parent not in transforms:
            return ''  # Unity curves are relative to the Animator, not its parent.
        prefix = relative_path(parent)
        return (prefix + '/' if prefix else '') + name(pid)

    for pid, tr in transforms.items():
        node = {'name': name(pid),
                'translation': convert(vector(tr['m_LocalPosition']), 1).tolist(),
                'rotation': convert(vector(tr['m_LocalRotation']), 2).tolist(),
                'scale': vector(tr['m_LocalScale'])}
        children = [node_ids[c['m_PathID']] for c in tr['m_Children']]
        if children:
            node['children'] = children
        glb.doc['nodes'].append(node)
        if tr['m_Father']['m_PathID'] == 0:
            glb.doc['scenes'][0]['nodes'].append(node_ids[pid])
        h = zlib.crc32(relative_path(pid).encode())
        assert h not in hashes, 'Ambiguous bone path'
        hashes[h] = node_ids[pid]

    renderers = [trees[pid] for pid, o in objects.items() if o.type.name == 'SkinnedMeshRenderer']
    assert len(renderers) == 1
    renderer = renderers[0]
    mesh_obj = objects[renderer['m_Mesh']['m_PathID']]
    mesh = mesh_obj.read()
    handler = MeshHandler(mesh)
    handler.process()
    vertices = convert(handler.m_Vertices, 1)
    normals = convert(np.array(handler.m_Normals)[:, :3], 1)
    normals /= np.linalg.norm(normals, axis=1, keepdims=True)
    uv = np.array(handler.m_UV0)[:, :2]
    uv[:, 1] = 1 - uv[:, 1]  # decoded PNG and glTF both use top-left texture origin
    weights = np.array(handler.m_BoneWeights)
    assert np.all(weights.sum(axis=1) > 0)
    weights /= weights.sum(axis=1, keepdims=True)
    joints = np.array(handler.m_BoneIndices)
    assert joints.max() < len(renderer['m_Bones'])
    triangles = np.concatenate(handler.get_triangles())[:, ::-1].reshape(-1)
    attributes = {
        'POSITION': glb.accessor(vertices, 'VEC3', target=34962, bounds=True),
        'NORMAL': glb.accessor(normals, 'VEC3', target=34962),
        'TEXCOORD_0': glb.accessor(uv, 'VEC2', target=34962),
        'JOINTS_0': glb.accessor(joints, 'VEC4', '<u2', target=34962),
        'WEIGHTS_0': glb.accessor(weights, 'VEC4', target=34962),
    }
    glb.doc['meshes'] = [{'name': mesh.m_Name, 'primitives': [{
        'attributes': attributes, 'indices': glb.accessor(triangles, 'SCALAR', '<u2', target=34963), 'material': 0}]}]
    bone_nodes = [node_ids[b['m_PathID']] for b in renderer['m_Bones']]
    flip = np.diag([-1, 1, 1, 1])
    poses = []
    for pose in trees[mesh_obj.path_id]['m_BindPose']:
        mat = np.array([[pose[f'e{r}{c}'] for c in range(4)] for r in range(4)])
        poses.append((flip @ mat @ flip).T.flatten())  # glTF matrices are column-major
    glb.doc['skins'] = [{'name': model_id, 'joints': bone_nodes,
                         'inverseBindMatrices': glb.accessor(poses, 'MAT4')}]
    mesh_node = next(node_ids[pid] for pid, tr in transforms.items()
                     if tr['m_GameObject'] == renderer['m_GameObject'])
    # glTF ignores a skinned mesh node's own transform; source has only ~4e-8 rad rotation.
    for key in ('translation', 'rotation', 'scale'):
        glb.doc['nodes'][mesh_node].pop(key)
    glb.doc['nodes'][mesh_node].update(mesh=0, skin=0)
    # A glTF skinned mesh belongs at scene level; all motion comes from its joints.
    for node in glb.doc['nodes']:
        if mesh_node in node.get('children', []):
            node['children'].remove(mesh_node)
            if not node['children']:
                del node['children']
    glb.doc['scenes'][0]['nodes'].append(mesh_node)

    texture = next(o.read() for o in objects.values()
                   if o.type.name == 'Texture2D' and o.read().m_Name == f'{model_id}_sd')
    png = io.BytesIO()
    texture.image.save(png, format='PNG')
    glb.doc['images'] = [{'name': texture.m_Name, 'bufferView': glb.view(png.getvalue()), 'mimeType': 'image/png'}]
    glb.doc['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    glb.doc['textures'] = [{'source': 0, 'sampler': 0}]
    glb.doc['materials'] = [{'name': f'{model_id}_sd', 'pbrMetallicRoughness': {
        'baseColorTexture': {'index': 0}, 'metallicFactor': 0, 'roughnessFactor': 1}}]
    clips = {}
    for pid, obj in objects.items():
        if obj.type.name != 'AnimationClip' or not trees[pid]['m_Name'].startswith(f'{model_id}_sd_'):
            continue
        clip = trees[pid]
        clip_name = clip['m_Name'].removeprefix(f'{model_id}_sd_')
        times, values, bindings = sample_clip(clip)
        anim = {'name': clip_name, 'channels': [], 'samplers': []}
        time_acc = glb.accessor(times, 'SCALAR', bounds=True)
        constant_time = glb.accessor([0, times[-1]], 'SCALAR', bounds=True)
        offset = 0
        unbound = []
        for binding in bindings:
            attribute = binding['attribute']
            width = WIDTHS[attribute]
            track = convert(values[:, offset:offset + width], attribute)
            offset += width
            node = hashes.get(binding['path'])
            if node is None:
                # Pelican idle retains tracks for a removed child named bmg001.
                # Matching that name to the prefab root incorrectly tips the entire
                # rig by 90 degrees. Unity leaves nonexistent relative paths unbound.
                unbound.append({'pathHash': binding['path'], 'property': PATHS[attribute]})
                continue
            if attribute == 2:
                for i in range(1, len(track)):
                    if np.dot(track[i - 1], track[i]) < 0:
                        track[i] *= -1
            constant = np.allclose(track, track[0], atol=1e-6, rtol=0)
            if constant:
                track = track[[0, -1]]
            sampler = len(anim['samplers'])
            anim['samplers'].append({'input': constant_time if constant else time_acc,
                                     'output': glb.accessor(track, f'VEC{width}'), 'interpolation': 'LINEAR'})
            anim['channels'].append({'sampler': sampler, 'target': {'node': node, 'path': PATHS[attribute]}})
        # Unity restores omitted transform properties to their prefab defaults.
        # Include these constants so switching from walk/shot back to idle does too.
        targeted = {(c['target']['node'], c['target']['path']) for c in anim['channels']}
        for node_id, node in enumerate(glb.doc['nodes']):
            if node_id == mesh_node:
                continue
            for attribute, path_name in PATHS.items():
                if (node_id, path_name) in targeted:
                    continue
                value = node[path_name]
                sampler = len(anim['samplers'])
                anim['samplers'].append({'input': constant_time,
                    'output': glb.accessor([value, value], f'VEC{WIDTHS[attribute]}'), 'interpolation': 'LINEAR'})
                anim['channels'].append({'sampler': sampler, 'target': {'node': node_id, 'path': path_name}})
        glb.doc['animations'].append(anim)
        clips[clip_name] = {'duration': float(times[-1]), 'frames': len(times),
                           'channels': len(anim['channels']), 'sourceChannels': len(bindings),
                           'unboundSourceChannels': unbound}
    assert 'idle' in clips and 'shot' in clips
    glb.doc['asset']['extras'] = {'source': files[0].name, 'character': label,
                                  'copyright': 'SHIFT UP / Proxima Beta'}
    path = outdir / f'{model_id}.glb'
    glb.write(path)
    meta = {'name': label, 'file': path.name, 'bones': len(bone_nodes), 'vertices': len(vertices),
            'triangles': len(triangles) // 3, 'clips': clips, 'bytes': path.stat().st_size}
    print(json.dumps(meta))
    return meta


if __name__ == '__main__':
    destination = ROOT / 'public/raptures'
    destination.mkdir(parents=True, exist_ok=True)
    index = {key: export_model(key, name, destination) for key, name in MODELS.items()}
    (destination / 'index.json').write_text(json.dumps(index, indent=2) + '\n')
