import bpy,bmesh,json
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/characters/aya/aya.blend'))
o=bpy.data.objects['Aya tapered ponytail'];bm=bmesh.new();bm.from_mesh(o.data)
boundary=sum(not e.is_manifold for e in bm.edges);bm.free();assert boundary==0,boundary
axes=[]
for start in range(0,len(o.data.vertices),24):
 ring=[v.co for v in o.data.vertices[start:start+24]];center=sum(ring,Vector())/24;axes.append((ring[0]-center).normalized())
dots=[a.dot(b) for a,b in zip(axes,axes[1:])];assert min(dots)>.9,min(dots)
(R/'artifacts/aya/ponytail-validation.json').write_text(json.dumps({'nonManifoldEdges':boundary,'minimumConsecutiveRingDot':min(dots),'rings':len(axes)},indent=2))
for obj in bpy.context.scene.objects:
 if obj.animation_data:
  obj.animation_data.action=None
  for t in obj.animation_data.nla_tracks:t.mute=True
 if obj.type=='ARMATURE':obj.data.pose_position='REST'
 if obj.type=='MESH' and 'weapon' in obj.name:obj.hide_render=True
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.world.color=(.45,.45,.45);s.render.film_transparent=True;s.render.resolution_x=1000;s.render.resolution_y=1000;s.view_settings.view_transform='Standard'
for pos in [(2,4,5),(-3,2,3),(0,-3,4)]:
 bpy.ops.object.light_add(type='AREA',location=pos);bpy.context.object.data.energy=220;bpy.context.object.data.size=4
for name,pos,target,scale in [('head-profile',(4,0,2),(0,-.1,1.9),1.15),('ponytail-close',(4,-1,2.6),(0,-.3,2.05),.65),('head-front',(0,4,1.8),(0,0,1.8),1.45)]:
 bpy.ops.object.camera_add(location=pos);cam=bpy.context.object;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale;s.camera=cam
 s.render.filepath=str(R/'artifacts/aya'/(name+'.png'));bpy.ops.render.render(write_still=True)
print('PONYTAIL_VERIFIED',min(dots))
