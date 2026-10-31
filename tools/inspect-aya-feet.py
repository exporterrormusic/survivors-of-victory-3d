import bpy,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/aya/source-inspection.blend'))
b=bpy.data.objects['c282_00_skin.001'];rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
cs=json.loads((R/'artifacts/aya/components.json').read_text())
for c in cs:
 if c['id'] not in [30,31,32,33,34,35]:continue
 print('PART',c['id'])
 for i in c['verts']:
  v=b.data.vertices[i];co=b.matrix_world@v.co
  if co.z<.25:print(i,tuple(round(x,4) for x in co),[(b.vertex_groups[g.group].name,round(g.weight,3)) for g in v.groups])
for bone in rig.data.bones:
 if 'Foot' in bone.name or 'Toe' in bone.name:print('BONE',bone.name,tuple(rig.matrix_world@bone.head_local))
