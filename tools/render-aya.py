import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
PREVIEW=ROOT/'artifacts/aya'
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/characters/aya/aya.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rest={o.name:o.matrix_basis.copy() for o in bpy.context.scene.objects}
s=(ROOT/'tools/build-aya.py').read_text()
exec(s[s.index('for o in bpy.context.scene.objects:\n if o.animation_data:'):])
