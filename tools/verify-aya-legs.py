"""Verify full source legs survive fitting and each sandal is bound to its foot."""
import bpy,json
from pathlib import Path
from mathutils.kdtree import KDTree
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/aya/source-inspection.blend'))
body=bpy.data.objects['c282_00_skin.001'];cs=json.loads((R/'artifacts/aya/components.json').read_text());expected=[]
for c in cs:
 if c['id'] not in [30,33]:continue
 for i in c['verts']:
  p=body.matrix_world@body.data.vertices[i].co;fit=min(1,max(0,(p.z-.18)/.18));p.x*=1-.18*fit;p.y*=1-.18*fit;expected.append(p)
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/characters/aya/aya.blend'))
body=bpy.data.objects['c282_00_skin.001'];kd=KDTree(len(body.data.vertices))
for v in body.data.vertices:kd.insert(body.matrix_world@v.co,v.index)
kd.balance();errors=[kd.find(p)[2] for p in expected]
assert max(errors)<1e-5, 'Missing original leg vertices'
attachments={}
for side in ['L','R']:
 for prefix in ['Aya bare foot ','Aya sandal sole ','Aya sandal strap ','Aya sandal toe post ']:
  o=bpy.data.objects[prefix+side];bone='Bip001 '+side+' Foot'
  assert all(len(v.groups)==1 and o.vertex_groups[v.groups[0].group].name==bone and abs(v.groups[0].weight-1)<1e-6 for v in o.data.vertices),o.name
  attachments[o.name]=bone
report={'fullLegVerticesPreserved':len(expected),'maxPositionError':max(errors),'attachments':attachments}
(R/'artifacts/aya/legs-validation.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
