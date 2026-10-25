"""Walk clips for Outpost Raptures whose bundles have none, made from models that have one.

tools/convert-raptures.py calls add_walk() for each id in WALKS before writing its GLB. Sources
are already-converted GLBs (Crawler is converted before the Raptures that borrow from it).
  feet   four legs: the source's foot paths, scaled to the target's footprint, are reached by
         two-bone IK on each leg (hip to knee rigid, knee to tip), so feet plant at the target's
         own stance height; the pelvis takes the source's bob.
  copy   leg joints named like the source's (Biped): each replays the source's motion around
         the target's idle pose (rotation delta in the joint's frame, offset in its parent's).
  glide  the walk is the idle, for legs that already move in it.
Other joints hold idle's first frame, as the runtime Pelican walk does (src/model-library.ts).
Bigger legs step slower: time scales with the square root of the leg-size ratio.
"""
from pathlib import Path
import json
import re
import struct

import numpy as np

FPS = 30
FOUR_LEGS = ('left_front', 'left_rear', 'right_front', 'right_rear')
LARGE = {'left_front': 'L', 'left_rear': 'LRear', 'right_front': 'R', 'right_rear': 'RRear'}
# Four-leg rigs: pelvis, and per leg (hip, rigid middle, knee, tip, IK handle at the root).
CRAWLER_RIG = ('pelvis_bone', lambda leg: tuple(f'body_lower_{leg}_leg_bone0{i}' for i in (3, 4, 5, 6, 9)))
LARGE_RIG = ('Pelvis_Bone', lambda leg: tuple(f'{LARGE[leg]}_{part}' for part in (
    'T_leg_Bone', 'M_leg_Bone', 'F_leg_Bone', 'leg_BoneIK', 'leg_IK')))
BIPED_LEGS = re.compile(r'^Bip001 (Pelvis|[LR] (Thigh|Calf|Foot|Toe0))$')
BIPED_RULER = ('Bip001 L Calf', 'Bip001 L Foot')

WALKS = {
    'beg003': ('feet', 'raptures/mmg005', CRAWLER_RIG),  # Capra
    'eeg003': ('feet', 'raptures/mmg005', CRAWLER_RIG),  # Sentry
    'emg003': ('feet', 'raptures/mmg005', CRAWLER_RIG),  # Cube
    'bcg001': ('feet', 'raptures/mmg005', LARGE_RIG),  # Cucumber
    'ecg001': ('feet', 'raptures/mmg005', LARGE_RIG),  # Loud Mouth
    'mcg002': ('feet', 'raptures/mmg005', LARGE_RIG),  # Thermite
    'xeg006': ('copy', 'chibi/c300_00', (BIPED_LEGS, BIPED_RULER)),  # Solaris: Soldier EG's legs
    'xmg001': ('glide', None, None),  # Phalanx: its idle works all ten legs
}
SOURCES = {'raptures/mmg005': 'Crawler', 'chibi/c300_00': 'Soldier EG (Nikke)'}
METHODS = {'feet': 'foot paths + leg IK', 'copy': 'leg joints'}


# Quaternions are glTF-ordered (x, y, z, w) and broadcast over leading axes.
def qmul(a, b):
    ax, ay, az, aw = np.moveaxis(np.asarray(a), -1, 0)
    bx, by, bz, bw = np.moveaxis(np.asarray(b), -1, 0)
    return np.stack([aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
                     aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz], -1)


def qinv(q):
    return np.asarray(q) * [-1, -1, -1, 1]


def qrot(q, v):
    u, w = q[..., :3], q[..., 3:]
    t = 2 * np.cross(u, v)
    return v + w * t + np.cross(u, t)


def unit(v):
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def axis_angle(axis, angle):
    angle = np.asarray(angle)[..., None]
    return np.concatenate([np.broadcast_to(axis, angle.shape[:-1] + (3,)) * np.sin(angle / 2), np.cos(angle / 2)], -1)


def between(u, v):
    """Shortest rotation taking direction u to direction v (never near-opposite here)."""
    u, v = unit(u), unit(v)
    return unit(np.concatenate([np.cross(u, v), 1 + np.sum(u * v, -1, keepdims=True)], -1))


def qmean(q):
    q = q * np.where(np.sum(q * q[0], -1, keepdims=True) < 0, -1, 1)
    return unit(q.mean(0))


def angle(u, v):
    return np.arccos(np.clip(np.sum(unit(u) * unit(v), -1), -1, 1))


class Rig:
    """Nodes, rest pose and clips of a GLB, with forward kinematics over sampled clips."""

    def __init__(self, doc, binary):
        self.doc, self.binary, self.nodes = doc, binary, doc['nodes']
        names = [n.get('name', '') for n in self.nodes]
        # Joints are found by name; a name used twice (some Nikke helpers) is never matched.
        self.index = {name: i for i, name in enumerate(names) if names.count(name) == 1}
        self.parent = {c: i for i, n in enumerate(self.nodes) for c in n.get('children', [])}
        self.order = sorted(range(len(self.nodes)), key=self.depth)

    @classmethod
    def load(cls, path):
        data = Path(path).read_bytes()
        length = struct.unpack_from('<I', data, 12)[0]
        return cls(json.loads(data[20:20 + length]), data[28 + length:])

    def find(self, name):
        """Node by name; Crawler-family rigs spell one hip 'body_lower_right_front_leg_bone03' twice."""
        if name in self.index:
            return self.index[name]
        (match,) = [i for n, i in self.index.items() if n.startswith(name)]
        return match

    def depth(self, i):
        return 0 if i not in self.parent else 1 + self.depth(self.parent[i])

    def accessor(self, i):
        a = self.doc['accessors'][i]
        view = self.doc['bufferViews'][a['bufferView']]
        width = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
        values = np.frombuffer(self.binary, '<f4', a['count'] * width, view.get('byteOffset', 0) + a.get('byteOffset', 0))
        return values.reshape(a['count'], width).astype(np.float64)

    def clip(self, name):
        anim = next(a for a in self.doc['animations'] if a['name'] == name)
        return {(c['target']['node'], c['target']['path']): (self.accessor(anim['samplers'][c['sampler']]['input'])[:, 0],
                                                            self.accessor(anim['samplers'][c['sampler']]['output']))
                for c in anim['channels']}

    def rest(self, path):
        default = {'translation': [0, 0, 0], 'rotation': [0, 0, 0, 1], 'scale': [1, 1, 1]}[path]
        return np.array([n.get(path, default) for n in self.nodes], dtype=np.float64)

    def pose(self, clip, grid):
        """Local translation/rotation/scale of every node at each grid time: {path: (T, N, k)}."""
        pose = {path: np.repeat(self.rest(path)[None], len(grid), 0) for path in ('translation', 'rotation', 'scale')}
        for (node, path), (times, values) in clip.items():
            pose[path][:, node] = resample(times, values, grid, path == 'rotation')
        return pose

    def world(self, pose):
        """World positions (T, N, 3) and rotations (T, N, 4) from a pose; scales are near-uniform here."""
        count = pose['translation'].shape[0]
        position = np.zeros((count, len(self.nodes), 3))
        rotation = np.zeros((count, len(self.nodes), 4))
        scale = np.ones((count, len(self.nodes), 3))
        for i in self.order:
            t, r, s = pose['translation'][:, i], pose['rotation'][:, i], pose['scale'][:, i]
            if i in self.parent:
                p = self.parent[i]
                position[:, i] = position[:, p] + qrot(rotation[:, p], scale[:, p] * t)
                rotation[:, i] = qmul(rotation[:, p], r)
                scale[:, i] = scale[:, p] * s
            else:
                position[:, i], rotation[:, i], scale[:, i] = t, r, s
        return position, rotation

    def first(self, clip, node, path):
        return clip[(node, path)][1][0] if (node, path) in clip else self.rest(path)[node]


def resample(times, values, grid, rotation):
    if rotation:  # q and -q are one orientation; keep neighbours on one side before blending
        values = values.copy()
        for k in range(1, len(values)):
            if np.dot(values[k - 1], values[k]) < 0:
                values[k] *= -1
    out = np.stack([np.interp(grid, times, values[:, c]) for c in range(values.shape[1])], -1)
    return unit(out) if rotation else out


def leg_ratio(target, source, ruler):
    size = lambda rig: sum(np.linalg.norm(rig.rest('translation')[rig.index[name]]) for name in ruler)
    return size(target) / size(source)


def copy_walk(target, source, layout):
    joints, ruler = layout
    walk, idle = source.clip('walk'), target.clip('idle')
    duration = max(times[-1] for times, _ in walk.values())
    grid = np.linspace(0, duration, round(duration * FPS) + 1)
    ratio = leg_ratio(target, source, ruler)
    tracks = {}
    for (node, path), (times, values) in walk.items():
        name = source.nodes[node]['name']
        if path == 'scale' or not joints.match(name) or name not in target.index:
            continue
        motion = resample(times, values, grid, path == 'rotation')
        node_t = target.index[name]
        start = target.first(idle, node_t, path)
        # Motion around the source walk's own average pose, so constant offsets (a Nikke's
        # per-clip facing, Crawler's walking crouch) stay out of the target's stance.
        if path == 'rotation':
            tracks[(node_t, path)] = qmul(start, qmul(qinv(qmean(motion)), motion))
        else:
            tracks[(node_t, path)] = start + ratio * (motion - motion.mean(0))
    return grid * np.sqrt(ratio), tracks, ratio


def feet_walk(target, source, layout, source_layout=CRAWLER_RIG):
    walk, idle = source.clip('walk'), target.clip('idle')
    duration = max(times[-1] for times, _ in walk.values())
    grid = np.linspace(0, duration, round(duration * FPS) + 1)
    src_position, _ = source.world(source.pose(walk, grid))
    feet = {leg: src_position[:, source.find(source_layout[1](leg)[3])] for leg in FOUR_LEGS}
    position, rotation = (a[0] for a in target.world(target.pose(idle, [0.0])))
    legs = {leg: [target.find(name) for name in layout[1](leg)] for leg in FOUR_LEGS}
    reach = lambda p: np.linalg.norm(p[[0, 2]])
    ratio = (np.mean([reach(position[legs[leg][3]]) for leg in FOUR_LEGS])
             / np.mean([reach(feet[leg].mean(0)) for leg in FOUR_LEGS]))
    tracks = {}
    pelvis = target.find(layout[0])
    src_pelvis = src_position[:, source.find(source_layout[0])]
    bob = ratio * (src_pelvis - src_pelvis.mean(0))  # world-space body sway, applied to the pelvis
    parent_rotation = rotation[target.parent[pelvis]]
    tracks[(pelvis, 'translation')] = target.first(idle, pelvis, 'translation') + qrot(qinv(parent_rotation), bob)
    for leg in FOUR_LEGS:
        thigh, mid, foot, tip_node, handle = legs[leg]
        hip, knee, tip = position[thigh], position[foot], position[tip_node]
        # Foot path relative to its stance: horizontal about the mean, lift above the lowest point.
        path = feet[leg] - [feet[leg][:, 0].mean(), feet[leg][:, 1].min(), feet[leg][:, 2].mean()]
        goal = tip + ratio * path
        upper, lower = knee - hip, tip - knee
        a, b = np.linalg.norm(upper), np.linalg.norm(lower)
        reach_to = goal - (hip + bob)
        c = np.clip(np.linalg.norm(reach_to, axis=-1), abs(a - b) + 1e-4, a + b - 1e-4)
        bend = angle(-upper, lower) - np.arccos(np.clip((a * a + b * b - c * c) / (2 * a * b), -1, 1))
        knee_turn = axis_angle(unit(np.cross(upper, lower)), bend)
        hip_turn = between(upper + qrot(knee_turn, np.broadcast_to(lower, knee_turn.shape[:-1] + (3,))), reach_to)
        tracks[(thigh, 'rotation')] = qmul(qinv(rotation[target.parent[thigh]]), qmul(hip_turn, rotation[thigh]))
        tracks[(foot, 'rotation')] = qmul(qinv(rotation[mid]), qmul(knee_turn, rotation[foot]))
        # The leg's IK goal sits at the foot; Loud Mouth skins its foot pads to it.
        tracks[(handle, 'translation')] = target.first(idle, handle, 'translation') + qrot(
            qinv(rotation[target.parent[handle]]), goal - tip)
    return grid * np.sqrt(ratio), tracks, ratio


def write_clip(glb, rig, name, times, tracks, mesh_node):
    """Append a clip with a channel for every node idle animates; others hold idle's first frame."""
    idle = next(a for a in glb.doc['animations'] if a['name'] == 'idle')
    anim = {'name': name, 'channels': [], 'samplers': []}
    time_acc = glb.accessor(times, 'SCALAR', bounds=True)
    constant_time = glb.accessor([0, times[-1]], 'SCALAR', bounds=True)
    idle_clip = rig.clip('idle')
    for channel in idle['channels']:
        key = (channel['target']['node'], channel['target']['path'])
        assert key[0] != mesh_node
        width = 4 if key[1] == 'rotation' else 3
        track = tracks.get(key)
        if track is None:
            track = np.repeat(rig.first(idle_clip, *key)[None], len(times), 0)
        constant = np.allclose(track, track[0], atol=1e-6, rtol=0)
        anim['samplers'].append({'input': constant_time if constant else time_acc, 'interpolation': 'LINEAR',
                                 'output': glb.accessor(track[[0, -1]] if constant else track, f'VEC{width}')})
        anim['channels'].append({'sampler': len(anim['samplers']) - 1, 'target': channel['target']})
    glb.doc['animations'].append(anim)
    return len(anim['channels'])


def add_walk(glb, model_id, mesh_node, public):
    """Add a 'walk' clip to a converted model listed in WALKS; returns its index.json entry."""
    method, source_path, layout = WALKS[model_id]
    rig = Rig(glb.doc, bytes(glb.data))
    assert not any(a['name'] == 'walk' for a in glb.doc['animations']), f'{model_id} already walks'
    if method == 'glide':
        idle = next(a for a in glb.doc['animations'] if a['name'] == 'idle')
        glb.doc['animations'].append({'name': 'walk', 'channels': idle['channels'], 'samplers': idle['samplers']})
        duration = max(times[-1] for times, _ in rig.clip('idle').values())
        return {'duration': float(duration), 'channels': len(idle['channels']), 'source': 'its idle (glides)'}
    source = Rig.load(public / f'{source_path}.glb')
    times, tracks, ratio = (copy_walk if method == 'copy' else feet_walk)(rig, source, layout)
    channels = write_clip(glb, rig, 'walk', times, tracks, mesh_node)
    return {'duration': float(times[-1]), 'frames': len(times), 'channels': channels,
            'source': f'{SOURCES[source_path]} walk ({METHODS[method]}, legs x{ratio:.2f})'}
