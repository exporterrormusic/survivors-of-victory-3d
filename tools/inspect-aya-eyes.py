import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'artifacts/aya/source-inspection.blend'));o=bpy.data.objects['c282_00_skin.001'];cs=json.loads((R/'artifacts/aya/components.json').read_text());groups={i:c['id'] for c in cs for i in c['verts']}
for cid in [41,43,46,48]:
 print('COMP',cid)
 for p in o.data.polygons:
  if groups[p.vertices[0]]!=cid:continue
  uv=[o.data.uv_layers.active.data[l].uv for l in p.loop_indices]
  if cid in [43,48] or any(v.x<.15 and v.y>.8 for v in uv):print('FACE',p.index,'uv',[(round(v.x*512,1),round((1-v.y)*512,1)) for v in uv], 'weights', [[(o.vertex_groups[g.group].name,round(g.weight,2)) for g in o.data.vertices[i].groups] for i in p.vertices])
