import bpy
from pathlib import Path
from mathutils import Vector
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'assets/characters/aya/aya.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
for o in bpy.context.scene.objects:
 if o.type=='MESH' and 'weapon' in o.name:o.hide_render=True
 if o.animation_data:
  o.animation_data.action=None
  for track in o.animation_data.nla_tracks:track.mute=True
rig.data.pose_position='REST'
s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.world.color=(.45,.45,.45);s.render.film_transparent=True;s.render.resolution_x=1000;s.render.resolution_y=1000;s.view_settings.view_transform='Standard'
for pos in [(2,4,5),(-3,2,3),(0,-3,4)]:
 bpy.ops.object.light_add(type='AREA',location=pos);bpy.context.object.data.energy=220;bpy.context.object.data.size=4
for name,pos,target,scale in [('feet-front',(0,3,.55),(0,0,.12),.55),('feet-side',(2,1,.55),(0,0,.12),.65),('full-legs',(0,3,1.0),(0,0,.43),1.1)]:
 if name=='full-legs':
  for o in bpy.context.scene.objects:
   if o.type=='MESH' and ('skirt' in o.name or 'floral' in o.name):o.hide_render=True
 bpy.ops.object.camera_add(location=pos);cam=bpy.context.object;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=scale;s.camera=cam
 s.render.filepath=str(R/'artifacts/aya'/(name+'.png'));bpy.ops.render.render(write_still=True)
