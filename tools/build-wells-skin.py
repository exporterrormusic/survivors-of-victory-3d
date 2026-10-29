"""Build Wells' chibi research uniform from the unmodified Product 08 GLB.
Run with Blender 3.6+: blender --background --python tools/build-wells-skin.py
"""
import bpy, bmesh, math, json
import numpy as np
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters/wells'; OUT.mkdir(parents=True,exist_ok=True)
PREVIEW=ROOT/'artifacts/wells'; PREVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/chibi/c302_00.glb'))
# Persist embedded buffers before exporting/repacking (Blender 3.6 importer).
for im in bpy.data.images:
 if im.type=='IMAGE':
  im.filepath_raw=str(OUT/(im.name+'.png')); im.file_format='PNG'; im.save()
  im.reload()
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rig.data.pose_position='REST'
body=bpy.data.objects['c302_00_skin.001']
# Stable disconnected components of the source mesh, before any modification.
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
 comps.append(ids)
remove={0,11,12,13,18,25,26,37,38,39,44,51,62,63}
# Covered shoulder/forearm armor is masked in this derivative to prevent it
# piercing the fitted sleeves during deep elbow flexion. Base arms/hands stay.
remove.update({7,14,15,16,17,19,20,21,33,40,41,42,43,45,46,47,60,61})
remove.update({22,23,24,48,49,50,54,58})
bm=bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
removed={i for c in remove for i in comps[c]}
original_torso=[bm.verts[i] for c in [53,57] for i in comps[c]]
original_lower={tuple(round(float(c),6) for c in v.co) for v in original_torso if (body.matrix_world@v.co).z<.999}
bmesh.ops.delete(bm,geom=[bm.verts[i] for i in removed],context='VERTS')
# Keep Product 08's original abdomen, pelvis and their continuous triangles.
# Bisect the upper chest exactly instead of deleting entire crossing faces,
# which previously removed part of the waist and left a see-through gap.
torso_faces={f for v in original_torso for f in v.link_faces}
torso_edges={e for v in original_torso for e in v.link_edges}
plane=body.matrix_world.inverted()@Vector((0,0,1.0))
normal=body.matrix_world.to_3x3().transposed()@Vector((0,0,1))
bmesh.ops.bisect_plane(bm,geom=list(torso_faces|torso_edges|set(original_torso)),dist=.000001,plane_co=plane,plane_no=normal,clear_outer=True,clear_inner=False)
retained={tuple(round(float(c),6) for c in v.co) for v in bm.verts}
assert original_lower<=retained, 'Original abdomen/hip vertices were altered'
(PREVIEW/'original-torso-comparison.json').write_text(json.dumps({'source':'c302_00.glb','originalLowerTorsoVertices':len(original_lower),'preservedExactly':len(original_lower&retained),'cutHeight':1.0,'method':'Exact plane cut; original lower torso vertices and crossing-face intersections retained.'},indent=2))
bm.to_mesh(body.data); bm.free()
def mat(name,color,metal=0,rough=.6):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*color,1); p.inputs['Metallic'].default_value=metal; p.inputs['Roughness'].default_value=rough
 return m
white=mat('Wells • pearl lab fabric',(.82,.85,.87)); inner=mat('Wells • folded fabric shadow',(.57,.63,.68))
hair=mat('Wells • silver lavender hair',(.60,.57,.75)); hairlight=mat('Wells • hair highlights',(.79,.77,.9))
hairgroove=mat('Wells • fine hair divisions',(.46,.44,.59))
dark=mat('Wells • graphite visor frame',(.025,.034,.045),.25)
cyan=mat('Wells • cyan optical glass',(.06,.64,.88),.35,.22)
silver=mat('Wells • emblem embroidery',(.7,.81,.88),.2)
head='Bip001 Head'; spine='Bip001 Spine1'
created=[]
def mesh(name,vs,fs,material,weights=None):
 me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update()
 o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); me.materials.append(material)
 for p in me.polygons: p.use_smooth=True
 if weights:
  names=set(n for w in weights for n in w)
  for n in names:
   g=o.vertex_groups.new(name=n)
   for i,w in enumerate(weights):
    if w.get(n,0)>0: g.add([i],w[n],'REPLACE')
  mod=o.modifiers.new('Wells skin deformation','ARMATURE'); mod.object=rig
  o.parent=rig; o.matrix_parent_inverse=rig.matrix_world.inverted()
 created.append(o); return o
def shell(o,thickness=.008):
 m=o.modifiers.new('Tailored thickness','SOLIDIFY'); m.thickness=thickness
def tube(name,points,widths,material,bone=head):
 vs=[]; fs=[]; sides=8
 for i,p in enumerate(points):
  tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
  tangent.normalize(); axis=tangent.cross(Vector((0,1,0))).normalized(); axis2=tangent.cross(axis).normalized()
  for j in range(sides): vs.append(Vector(p)+widths[i]*(axis*cos(j*2*pi/sides)+axis2*sin(j*2*pi/sides)))
 for i in range(len(points)-1):
  for j in range(sides): a=i*sides+j; b=i*sides+(j+1)%sides; fs.append((a,b,b+sides,a+sides))
 fs.extend([tuple(reversed(range(sides))),tuple(range((len(points)-1)*sides,len(points)*sides))])
 return mesh(name,vs,fs,material,[{bone:1} for v in vs])
# Bob cap: crown to a scalloped nape, with an open face below the forehead.
def bob_point(t,a,offset=0):
 front=max(0,cos(a)); opening=min(1,front*1.65)**2
 endz=1.325+.415*opening
 if t<=.55:
  th=.025+(pi/2-.025)*t/.55; radius=sin(th); z=1.755+.36*cos(th)
 else:
  u=(t-.55)/.45; radius=1-.10*u; z=1.755+(endz-1.755)*u
  z-=.028*u**6*(.5+.5*cos(a*13))*(1-opening)
 return ((.365*radius+offset)*sin(a),-.02+(.385*radius+offset)*cos(a),z)
vs=[]; fs=[]; N=64; R=24
for r in range(R+1):
 t=r/R
 for j in range(N):
  a=2*pi*j/N
  vs.append(bob_point(t,a))
for r in range(R):
 for j in range(N): a=r*N+j; b=r*N+(j+1)%N; fs.append((a,a+N,b+N,b))
o=mesh('Wells_Hair_Bob',vs,fs,hair,[{head:1} for v in vs]); shell(o,.012)
# Close the back of the head exposed when the original scalp/hair was removed.
skin=mat('Wells • nape skin',(.72,.40,.31))
vs=[]; fs=[]
for r in range(13):
 th=.02+(pi-.04)*r/12
 for j in range(25):
  a=pi/2+pi*j/24
  vs.append((.28*sin(th)*sin(a),-.015+.285*sin(th)*cos(a),1.605+.27*cos(th)))
for r in range(12):
 for j in range(24): a=r*25+j; fs.append((a,a+25,a+26,a+1))
mesh('Wells_Head_Backfill',vs,fs,skin,[{head:1} for v in vs])
# Fine crown partings keep the bob readable as hair at close range.
for j in range(15):
 a=2*pi*j/15
 points=[]
 for k in range(25):
  points.append(bob_point(.04+.94*k/24,a,.001))
 tube('Wells_Hair_Parting_'+str(j),points,[.0009]*len(points),hairgroove)
# A thin continuous under-fringe closes the gap above the original face.
vs=[]; fs=[]
for j in range(25):
 x=-.26+.52*j/24; y=-.02+.375*math.sqrt(max(0,1-(x/.365)**2))-.02
 vs.extend([(x,y,1.82),(x,y,1.73)])
for j in range(24): a=j*2; fs.append((a,a+1,a+3,a+2))
mesh('Wells_Fringe_Underlay',vs,fs,hair,[{head:1} for v in vs])
# Tapered sculpted ribbon locks; side locks are weighted over three bones each.
bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
inv=rig.matrix_world.inverted()
for s,side in [(-1,'L'),(1,'R')]:
 for k in range(3):
  b=rig.data.edit_bones.new('Wells_Bang_'+side+'_'+str(k+1))
  b.head=inv@Vector((s*(.305+.015*k),.18,1.83-.16*k)); b.tail=inv@Vector((s*(.32+.015*k),.20,1.67-.16*k))
  b.parent=rig.data.edit_bones[head if k==0 else 'Wells_Bang_'+side+'_'+str(k)]
bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
def lock(name,points,widths,side=None):
 # Subdivide each lock along a smooth Catmull-Rom curve.
 original=points; original_widths=widths; points=[]; widths=[]
 for k in range(len(original)-1):
  p0=Vector(original[max(0,k-1)]); p1=Vector(original[k]); p2=Vector(original[k+1]); p3=Vector(original[min(len(original)-1,k+2)])
  for step in range(5):
   t=step/5
   points.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t))
   widths.append(original_widths[k]*(1-t)+original_widths[k+1]*t)
 points.append(original[-1]); widths.append(original_widths[-1])
 vs=[]; fs=[]; weights=[]
 for i,(x,y,z) in enumerate(points):
  t=i/(len(points)-1)
  for j in range(5):
   q=j/4*2-1; vx=x+q*widths[i]*.68; vy=y+.005*(1-q*q)
   # Keep every root vertex beneath the curved visor, including the wide
   # outer fringe corners; checking centerlines alone leaves intersections.
   if z>1.775 and vy>0:
    visor_inner=-.02+.389*math.sqrt(max(0,1-(vx/.375)**2))-.018
    vy=min(vy,visor_inner)
   vs.append((vx,vy,z))
   if side:
    f=min(2,t*2.99); k=int(f); blend=f-k
    w={'Wells_Bang_'+side+'_'+str(k+1):1-blend}
    if k<2: w['Wells_Bang_'+side+'_'+str(k+2)]=blend
    else: w={'Wells_Bang_'+side+'_3':1}
   else: w={head:1}
   weights.append(w)
 for i in range(len(points)-1):
  for j in range(4): a=i*5+j; fs.append((a,a+1,a+6,a+5))
 o=mesh(name,vs,fs,hair,weights); shell(o,.003)
for s,side in [(-1,'L'),(1,'R')]:
 lock('Wells_SideBang_'+side,[(s*.29,.22,1.86),(s*.33,.23,1.73),(s*.35,.22,1.57),(s*.35,.18,1.43),(s*.29,.19,1.36)],[.055,.045,.038,.027,.002],side)
 for k in range(3):
  x=s*(.06+k*.087)
  lock('Wells_Fringe_'+side+str(k),[(x*.7,.24,1.99),(x,.32,1.84),(x*.85,.342,1.72),(x*.7,.33,1.64+k*.025)],[.064,.065,.044,.001])
 # Fine separated nape locks frame the jaw.
 for k in range(3):
  x=s*(.24+.04*k); y=.02-.08*k
  lock('Wells_Nape_'+side+str(k),[(x,y,1.78),(x*1.07,y,1.58),(x*.96,y,1.39+.025*k)],[.065,.062,.001])
tube('Wells_Ahoge',[(0,-.015,2.1),(-.01,-.02,2.19),(.055,-.01,2.22),(.09,.02,2.19),(.07,.03,2.15)],[.017,.014,.011,.007,.001],hair)
# Curved cyan forehead visor and continuous dark headband.
def band(name,zlo,zhi,amin,amax,rx,ry,material):
 vs=[]; fs=[]; n=48
 for i in range(n+1):
  a=amin+(amax-amin)*i/n
  for z in [zlo,zhi]: vs.append((rx*sin(a),-.02+ry*cos(a),z-.025*(abs(sin(a)))))
 for i in range(n): fs.append((2*i,2*i+1,2*i+3,2*i+2))
 o=mesh(name,vs,fs,material,[{head:1} for v in vs]); shell(o,.013); return o
band('Wells_Visor_Headband',1.815,1.90,-pi,pi,.377,.393,dark)
band('Wells_Visor_Frame',1.79,1.975,-1.23,1.23,.391,.407,dark)
band('Wells_Visor_Lens',1.808,1.958,-1.18,1.18,.397,.416,cyan)
exec(compile((ROOT/'tools/wells-tailoring.py').read_text(encoding='utf-8'), 'wells-tailoring.py', 'exec'), globals())
# Emblem follows the chest surface and is baked into the existing body atlas below.
# Its geometric source is retained in the editable file in a hidden collection.
emblems=[]
def emblem_line(name,xzs,r=.0025):
 pts=[(x,.207,z) for x,z in xzs]
 o=tube(name,pts,[r]*len(pts),silver,spine); emblems.append(o)
emblem_line('Wells_Emblem_Diamond',[(0,1.17),(.067,1.115),(0,1.045),(-.067,1.115),(0,1.17)])
for s in [-1,1]:
 emblem_line('Wells_Emblem_Orbit',[(s*.014+s*.06*cos(t*2*pi/32),1.075+.023*sin(t*2*pi/32)) for t in range(33)],.002)
emblem_line('Wells_Emblem_Stem',[(0,1.22),(0,1.16)],.002)
emblem_line('Wells_Emblem_Ring',[(.019*cos(t*2*pi/24),1.225+.014*sin(t*2*pi/24)) for t in range(25)],.002)
o=mesh('Wells_Emblem_Cyan_Core',[(-.027,.211,1.126),(.027,.211,1.126),(0,.211,1.09)],[(0,1,2)],cyan,[{spine:1}]*3); emblems.append(o)
# Bake the planar emblem analytically through the body's UV triangles. This
# preserves the source UVs and creates a portable, single-image chest material.
im=next(n.image for n in body.data.materials[0].node_tree.nodes if n.type=='TEX_IMAGE')
im.scale(1024,1024); W,H=im.size; pixels=np.array(im.pixels[:],dtype=np.float32).reshape(H,W,4)
# Blue iris pigment, restricted to the original atlas's eye island. Keep its
# painted pupil, specular dots and luminance shading intact.
yy,xx=np.mgrid[0:H,0:W]
eye=(xx<W*.17)&(yy>H*.70)&(yy<H*.82)&(pixels[...,0]>pixels[...,1]*1.6)&(pixels[...,2]>pixels[...,1]*1.3)
old=pixels.copy(); pixels[eye,0]=old[eye,1]*.55; pixels[eye,1]=old[eye,0]*.77; pixels[eye,2]=np.minimum(1,old[eye,0]*1.12)
paths=[[(0,1.17),(.067,1.115),(0,1.045),(-.067,1.115),(0,1.17)],[(0,1.22),(0,1.16)],[(.019*cos(t*2*pi/32),1.225+.014*sin(t*2*pi/32)) for t in range(33)]]
for s in [-1,1]: paths.append([(s*.014+s*.06*cos(t*2*pi/40),1.075+.023*sin(t*2*pi/40)) for t in range(41)])
body.data.calc_loop_triangles(); uv=body.data.uv_layers.active.data
for tri in body.data.loop_triangles:
 xyz=np.array([tuple(body.matrix_world@body.data.vertices[i].co) for i in tri.vertices])
 if xyz[:,1].mean()<.055 or xyz[:,2].max()<1.02 or xyz[:,2].min()>1.25: continue
 tex=np.array([tuple(uv[i].uv) for i in tri.loops])*[W-1,H-1]
 lo=np.maximum(np.floor(tex.min(0)).astype(int),0); hi=np.minimum(np.ceil(tex.max(0)).astype(int),[W-1,H-1])
 if np.any(hi<lo): continue
 yy,xx=np.mgrid[lo[1]:hi[1]+1,lo[0]:hi[0]+1]; q=np.stack([xx,yy],-1)
 a,b,c=tex; den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1])
 if abs(den)<1e-7: continue
 u=((b[1]-c[1])*(q[...,0]-c[0])+(c[0]-b[0])*(q[...,1]-c[1]))/den
 v=((c[1]-a[1])*(q[...,0]-c[0])+(a[0]-c[0])*(q[...,1]-c[1]))/den; w=1-u-v
 pos=u[...,None]*xyz[0]+v[...,None]*xyz[1]+w[...,None]*xyz[2]
 mask=(u>=-.015)&(v>=-.015)&(w>=-.015)&(abs(pos[...,0])<.09)&(pos[...,2]>1.035)&(pos[...,2]<1.245)&(pos[...,1]>.055)
 sample=pos[...,[0,2]]; dist=np.full(xx.shape,100.)
 for path in paths:
  for p1,p2 in zip(path,path[1:]):
   p1=np.array(p1); d=np.array(p2)-p1; f=np.clip(np.sum((sample-p1)*d,axis=-1)/np.dot(d,d),0,1)
   dist=np.minimum(dist,np.linalg.norm(sample-p1-f[...,None]*d,axis=-1))
 patch=pixels[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
 shade=np.clip((pos[...,2]-1.04)*.12,0,.03)
 base=np.stack([.19+shade,.25+shade,.35+shade],-1)
 patch[mask,:3]=base[mask]
 line=mask&(dist<.0027); patch[line,:3]=(.76,.84,.9)
 core=mask&(pos[...,2]>=1.09)&(pos[...,2]<=1.126)&(abs(pos[...,0])<.027*(pos[...,2]-1.09)/.036)
 patch[core,:3]=(.10,.72,.98)
im.pixels[:]=pixels.ravel(); im.filepath_raw=str(OUT/'wells-body.png'); im.file_format='PNG'; im.save()
# Remove the bake source geometry from runtime; the emblem is in wells-body.png.
for o in emblems:
 created.remove(o); bpy.data.objects.remove(o,do_unlink=True)
# Authored secondary motion on six bang bones, sampled into every source clip.
for action in bpy.data.actions:
 if not any(fc.data_path.startswith('pose.bones[') for fc in action.fcurves): continue
 start,end=action.frame_range; duration=max(1,end-start)
 lively=any(t in action.name.lower() for t in ['run','walk','shot','stun'])
 for side in ['L','R']:
  for k in range(1,4):
   name='Wells_Bang_'+side+'_'+str(k); rig.pose.bones[name].rotation_mode='XYZ'
   path='pose.bones["'+name+'"].rotation_euler'
   fc=action.fcurves.new(path,index=1,action_group=name)
   for step in range(25):
    t=step/24; amp=(.045 if lively else .018)*k
    value=amp*sin(2*pi*t*(2 if lively else 1)+(k-1)*.45+(0 if side=='L' else pi/2))
    key=fc.keyframe_points.insert(start+t*duration,value); key.interpolation='LINEAR'
# Save editable master and export before preview staging.
for o in created:
 bpy.context.view_layer.objects.active=o; o.select_set(True)
 for mod in list(o.modifiers):
  if mod.type in {'SOLIDIFY','SUBSURF'}: bpy.ops.object.modifier_apply(modifier=mod.name)
 o.select_set(False)
rig.data.pose_position='POSE'
for im in bpy.data.images:
 if im.type=='IMAGE': im.pack()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'wells-research.blend'))
rest_transforms={o.name:o.matrix_basis.copy() for o in bpy.context.scene.objects}
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/chibi/wells_research.glb'),export_format='GLB',export_animations=True,export_nla_strips=True,export_force_sampling=True,export_def_bones=False)
# Unarmed rest-pose turnarounds for review.
for o in bpy.context.scene.objects:
 if o.animation_data:
  o.animation_data.action=None
  for track in o.animation_data.nla_tracks: track.mute=True
 o.matrix_basis=rest_transforms[o.name]
rig.data.pose_position='REST'
for o in bpy.context.scene.objects:
 if o.type=='MESH' and 'weapon' in o.name: o.hide_render=True
scene=bpy.context.scene; scene.render.engine='BLENDER_EEVEE'; scene.world.color=(.4,.4,.4)
scene.render.resolution_x=1000; scene.render.resolution_y=1100; scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'; scene.view_settings.look='Medium High Contrast'
scene.render.film_transparent=True
for pos,power in [((2,4,5),250),((-3,2,3),180),((0,-3,4),220)]:
 bpy.ops.object.light_add(type='AREA',location=pos); bpy.context.object.data.energy=power; bpy.context.object.data.size=4
for name,pos in [('front',(0,5,1.13)),('three-quarter',(3,5,1.7)),('back',(0,-5,1.13))]:
 bpy.ops.object.camera_add(location=pos); cam=bpy.context.object; cam.rotation_euler=(Vector((0,0,1.13))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.type='ORTHO'; cam.data.ortho_scale=2.55; scene.camera=cam
 scene.render.filepath=str(PREVIEW/('wells-'+name+'.png')); bpy.ops.render.render(write_still=True)
# Dedicated portrait rendered from the model for the skin picker.
cam.location=(0,5,1.73); cam.rotation_euler=(Vector((0,0,1.73))-cam.location).to_track_quat('-Z','Y').to_euler(); cam.data.ortho_scale=1.05
scene.render.resolution_x=256; scene.render.resolution_y=256
scene.render.filepath=str(ROOT/'public/chibi/wells_research_icon.png'); bpy.ops.render.render(write_still=True)
print('WELLS_BUILD_COMPLETE')
