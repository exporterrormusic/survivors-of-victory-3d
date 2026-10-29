import bpy, json
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[1]
out=root/'artifacts/wells'; out.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(root/'public/chibi/c302_00.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.animation_data_clear(); rig.data.pose_position='REST'
body=bpy.data.objects['c302_00_skin.001']
print('MATRIX',list(body.matrix_world)); print('BONES',[(b.name,tuple(b.head_local),tuple(b.tail_local)) for b in rig.data.bones])
adj=[set() for v in body.data.vertices]
for e in body.data.edges:
 a,b=e.vertices; adj[a].add(b); adj[b].add(a)
seen=set(); comps=[]
for v in body.data.vertices:
 if v.index in seen: continue
 stack=[v.index]; seen.add(v.index); ids=[]
 while stack:
  i=stack.pop(); ids.append(i)
  for j in adj[i]-seen: seen.add(j); stack.append(j)
 coords=[body.matrix_world@body.data.vertices[i].co for i in ids]
 comps.append({'id':len(comps),'count':len(ids),'min':[min(v[k] for v in coords) for k in range(3)],'max':[max(v[k] for v in coords) for k in range(3)],'verts':ids})
(out/'components.json').write_text(json.dumps(comps))
print('COMPONENTS', [{k:v for k,v in c.items() if k!='verts'} for c in comps])
for im in bpy.data.images:
 if im.type=='IMAGE': im.filepath_raw=str(out/(im.name+'.png')); im.file_format='PNG'; im.save()
for o in bpy.context.scene.objects:
 if o.type=='MESH' and 'weapon' in o.name: o.hide_render=True
coords=[body.matrix_world@v.co for v in body.data.vertices]; center=sum(coords,Vector())/len(coords)
print('CENTER',center)
scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'; scene.world.color=(.6,.6,.6)
scene.render.resolution_x=900; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'
def camera(name,pos,target):
 bpy.ops.object.camera_add(location=pos); cam=bpy.context.object; cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=3; scene.camera=cam
 scene.render.filepath=str(out/(name+'.png')); bpy.ops.render.render(write_still=True)
for pos in [(2,-4,5),(-3,-2,2),(0,3,4)]:
 bpy.ops.object.light_add(type='AREA', location=pos); bpy.context.object.data.energy=300; bpy.context.object.data.size=4
camera('source-front',(0,-5,1.2),(0,0,1.2))
bpy.ops.wm.save_as_mainfile(filepath=str(out/'source-inspection.blend'))
