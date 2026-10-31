"""Build Ayamari Yushutsu from Sakura; run with Blender 3.6 in background."""
import bpy, bmesh, json, math
from pathlib import Path
from mathutils import Vector
from math import sin, cos, pi
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'assets/characters/aya'; OUT.mkdir(parents=True,exist_ok=True)
PREVIEW=ROOT/'artifacts/aya'; PREVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/chibi/c282_00.glb'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE'); rig.data.pose_position='REST'
body=bpy.data.objects['c282_00_skin.001']
for im in bpy.data.images:
 if im.type=='IMAGE':
  im.filepath_raw=str(OUT/(im.name+'.png')); im.file_format='PNG'; im.save(); im.reload()
cs=json.loads((PREVIEW/'components.json').read_text())
def mat(name,c,metal=0):
 m=bpy.data.materials.new(name); m.diffuse_color=(*c,1); m.use_nodes=True
 p=m.node_tree.nodes.get('Principled BSDF'); p.inputs['Base Color'].default_value=(*c,1); p.inputs['Roughness'].default_value=.7; p.inputs['Metallic'].default_value=metal
 return m
skin=mat('Aya warm skin',(.82,.48,.40)); hair=mat('Aya charcoal hair and ear fur',(.025,.026,.029)); pink=mat('Aya ear velvet',(.39,.18,.29)); white=mat('Aya ear tufts',(.85,.85,.87)); red=mat('Aya crimson hairband',(.36,.025,.045)); obi=mat('Aya dark burgundy obi',(.085,.035,.035)); gold=mat('Aya antique gold',(.55,.34,.10),.35); cloth=mat('Aya indigo silk',(.035,.032,.065)); sole=mat('Aya sandal soles',(.065,.035,.028))
# The source face is unlit. Use the same response for new exposed skin.
nt=skin.node_tree;nt.nodes.clear();out=nt.nodes.new('ShaderNodeOutputMaterial');em=nt.nodes.new('ShaderNodeEmission');em.inputs['Color'].default_value=(.88,.55,.46,1);nt.links.new(em.outputs[0],out.inputs['Surface'])
for m in [skin,hair,cloth,sole]: body.data.materials.append(m)
idx={m.name:i for i,m in enumerate(body.data.materials)}
groups={i:c['id'] for c in cs for i in c['verts']}
body.data.calc_loop_triangles();eye_triangles={41:[],46:[]};replace_eye_faces=set()
for tri in body.data.loop_triangles:
 c=groups[tri.vertices[0]]
 if c in eye_triangles:
  uv=[body.data.uv_layers.active.data[i].uv.copy() for i in tri.loops]
  px=[(v.x*512,(1-v.y)*512) for v in uv]
  if max(v[0] for v in px)>=8 and min(v[0] for v in px)<=59 and max(v[1] for v in px)>=48 and min(v[1] for v in px)<=89:
   replace_eye_faces.add(tri.polygon_index)
   eye_triangles[c].append((uv,[body.matrix_world@body.data.vertices[i].co for i in tri.vertices],[{body.vertex_groups[g.group].name:g.weight for g in body.data.vertices[i].groups} for i in tri.vertices]))
from mathutils.kdtree import KDTree
samples=[v for v in body.data.vertices if groups[v.index] in [36,37,54]]
skirtkd=KDTree(len(samples));skirtweights=[]
for i,v in enumerate(samples):
 skirtkd.insert(body.matrix_world@v.co,i);skirtweights.append({body.vertex_groups[g.group].name:g.weight for g in v.groups})
skirtkd.balance()
def garment_weights(o):
 o.vertex_groups.clear()
 for v in o.data.vertices:
  weights={}
  if v.co.z>.79:weights={'Bip001 Pelvis':1}
  else:
   near=skirtkd.find_n(v.co,4);total=sum(1/max(d,.005)**2 for _,_,d in near)
   for _,i,d in near:
    factor=1/max(d,.005)**2/total
    for name,w in skirtweights[i].items():weights[name]=weights.get(name,0)+w*factor
  for name,w in weights.items():
   vg=o.vertex_groups.get(name) or o.vertex_groups.new(name=name);vg.add([v.index],w,'REPLACE')
source=body.data.materials[0]
def tinted(name,color):
 m=source.copy();m.name=name;nt=m.node_tree
 tex=next(n for n in nt.nodes if n.type=='TEX_IMAGE');old=tex.outputs['Color'];targets=[l.to_socket for l in old.links]
 mix=nt.nodes.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(*color,1);nt.links.new(old,mix.inputs[1])
 for socket in targets:nt.links.new(mix.outputs[0],socket)
 body.data.materials.append(m);return len(body.data.materials)-1
hairidx=idx[hair.name]
fabricidx=tinted('Aya indigo patterned sleeves',(.68,.65,.85))
for p in body.data.polygons:
 c=groups[p.vertices[0]]; z=sum((body.matrix_world@body.data.vertices[i].co).z for i in p.vertices)/len(p.vertices)
 if c in [30,33]: p.material_index=idx[skin.name]
 if c in [31,32,34,35]: p.material_index=idx[sole.name]
 if c in [9,10,11,28,29]:p.material_index=hairidx
 if c in [5,7,52,53]:p.material_index=fabricidx
 # Keep Sakura's painted bangs and kimono motifs; new pieces use coordinated colors.
for v in body.data.vertices:
 if groups[v.index] in [30,33]:
  co=body.matrix_world@v.co
  # Retain the entire source leg, fitting its volume beneath the closed kimono.
  fit=min(1,max(0,(co.z-.18)/.18));co.x*=1-.18*fit;co.y*=1-.18*fit
  v.co=body.matrix_world.inverted()@co
  if co.z<.15:
   side='L' if co.x<0 else 'R';blend=min(1,max(0,(co.z-.09)/.06))
   for g in body.vertex_groups:g.remove([v.index])
   body.vertex_groups['Bip001 '+side+' Foot'].add([v.index],1-.871*blend,'REPLACE')
   body.vertex_groups['Bip001 '+side+' Calf'].add([v.index],.871*blend,'REPLACE')
 if groups[v.index] in [5,7]:
  co=body.matrix_world@v.co
  if co.z>1.17:co.z=1.17;v.co=body.matrix_world.inverted()@co
remove={0,1,2,3,4,6,8,12,13,14,15,16,17,18,19,20,25,26,27,31,32,34,35,36,37,38,39,44,49,54,55,56}
bm=bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table()
old_eye_faces=[bm.faces[i] for i in replace_eye_faces]
bmesh.ops.delete(bm,geom=old_eye_faces,context='FACES_ONLY')
bmesh.ops.delete(bm,geom=[bm.verts[i] for c in cs if c['id'] in remove for i in c['verts']],context='VERTS')
# The high shirt is part of the torso, not a removable accessory.
faces=[]
geom=set(faces)|{e for f in faces for e in f.edges}|{v for f in faces for v in f.verts}
if geom:bmesh.ops.bisect_plane(bm,geom=list(geom),dist=1e-6,plane_co=body.matrix_world.inverted()@Vector((0,0,1.12)),plane_no=body.matrix_world.to_3x3().transposed()@Vector((0,0,1)),clear_outer=True)
bm.to_mesh(body.data); bm.free()
head='Bip001 Head'; spine='Bip001 Spine1'
def mesh(name,vs,fs,m,bone=head):
 me=bpy.data.meshes.new(name); me.from_pydata(vs,[],fs); me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); me.materials.append(m)
 for p in me.polygons:p.use_smooth=True
 g=o.vertex_groups.new(name=bone); g.add(list(range(len(vs))),1,'REPLACE'); mod=o.modifiers.new('Sakura skeleton','ARMATURE');mod.object=rig
 o.parent=rig;o.matrix_parent_inverse=rig.matrix_world.inverted();return o
def tube(name,pts,radii,m,bone=head):
 vs=[];fs=[];N=24
 previous_t=None;previous_a=None
 for i,p in enumerate(pts):
  t=(Vector(pts[min(i+1,len(pts)-1)])-Vector(pts[max(0,i-1)])).normalized()
  # Parallel-transport the ring frame through bends. Crossing a fixed Y axis
  # used to flip the rings 180 degrees at the ponytail crown, tearing the sweep.
  if previous_t is None:
   reference=Vector((1,0,0)) if abs(t.x)<.9 else Vector((0,1,0));a=(reference-t*reference.dot(t)).normalized()
  else:
   a=previous_t.rotation_difference(t)@previous_a;a=(a-t*a.dot(t)).normalized()
  b=t.cross(a)
  previous_t=t;previous_a=a
  for j in range(N):vs.append(Vector(p)+radii[i]*(cos(j*2*pi/N)*a+sin(j*2*pi/N)*b))
 for i in range(len(pts)-1):
  for j in range(N):a=i*N+j;b=i*N+(j+1)%N;fs.append((a,b,b+N,a+N))
 fs.extend([tuple(reversed(range(N))),tuple(range(len(vs)-N,len(vs)))])
 return mesh(name,vs,fs,m,bone)

# Replace the original eye-bearing triangles, rather than placing a blue disk
# above a red face. Color is authored on the mesh, sampled from the source atlas;
# no competing red eye surface survives during talk/blink deformation.
import colorsys
atlas=next(n.image for n in source.node_tree.nodes if n.type=='TEX_IMAGE')
W,H=atlas.size;pixels=list(atlas.pixels)
def sample_face(uv):
 fx=min(W-1,max(0,uv.x*W-.5));fy=min(H-1,max(0,uv.y*H-.5));x=int(fx);y=int(fy);tx=fx-x;ty=fy-y
 rgb=[0,0,0]
 for ox,oy,f in [(0,0,(1-tx)*(1-ty)),(1,0,tx*(1-ty)),(0,1,(1-tx)*ty),(1,1,tx*ty)]:
  i=(min(H-1,y+oy)*W+min(W-1,x+ox))*4
  for ch in range(3):rgb[ch]+=pixels[i+ch]*f
 px=uv.x*512;py=(1-uv.y)*512
 # Recolor only iris pigment, retaining the original lashes, pupil and glints.
 if ((px-35.5)/15.5)**2+((py-73)/14.5)**2<1 and py>59:
  h,s,v=colorsys.rgb_to_hsv(*rgb)
  if (h<.10 or h>.94) and s>.18:rgb=colorsys.hsv_to_rgb(.565,s*.83,v)
 else:
  h,s,v=colorsys.rgb_to_hsv(*rgb)
  if 8<px<59 and 48<py<72 and (h<.10 or h>.94) and s>.52:rgb=(v*.12,v*.13,v*.15)
 # Blender's image buffer is encoded sRGB; glTF vertex colors are linear.
 return tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb)+(1,)
eye=bpy.data.materials.new('Aya blue iris');eye.use_nodes=True;nt=eye.node_tree;nt.nodes.clear()
out=nt.nodes.new('ShaderNodeOutputMaterial');em=nt.nodes.new('ShaderNodeEmission');vc=nt.nodes.new('ShaderNodeVertexColor');vc.layer_name='Iris';nt.links.new(vc.outputs['Color'],em.inputs['Color']);nt.links.new(em.outputs[0],out.inputs['Surface'])
for c in [41,46]:
 vs=[];fs=[];cols=[];weights=[]
 for uv,co,ws in eye_triangles[c]:
  longest=max((uv[j]-uv[(j+1)%3]).length*512 for j in range(3));N=max(8,min(64,math.ceil(longest/.7)));ids={}
  for row in range(N+1):
   for col in range(N+1-row):
    f=[1-(row+col)/N,row/N,col/N];ids[row,col]=len(vs)
    vs.append(sum((co[j]*f[j] for j in range(3)),Vector()))
    q=sum((uv[j]*f[j] for j in range(3)),Vector((0,0)));cols.append(sample_face(q));w={}
    for j in range(3):
     for name,value in ws[j].items():w[name]=w.get(name,0)+value*f[j]
    weights.append(w)
  for row in range(N):
   for col in range(N-row):
    fs.append((ids[row,col],ids[row+1,col],ids[row,col+1]))
    if row+col<N-1:fs.append((ids[row+1,col],ids[row+1,col+1],ids[row,col+1]))
 o=mesh('Aya blue iris '+str(c),vs,fs,eye);o.vertex_groups.clear()
 for i,w in enumerate(weights):
  for name,val in w.items():
   if val>1e-7:g=o.vertex_groups.get(name) or o.vertex_groups.new(name=name);g.add([i],val,'REPLACE')
 attr=o.data.color_attributes.new(name='Iris',type='FLOAT_COLOR',domain='POINT')
 for i,col in enumerate(cols):attr.data[i].color=col
(PREVIEW/'eye-replacement.json').write_text(json.dumps({'removedSourceTriangles':len(replace_eye_faces),'method':'Replace eye-bearing face triangles, preserve original pupil/highlights and recolor iris pigment in mesh vertex colors.'},indent=2))

def band(name,levels,m,bone=spine):
 vs=[];fs=[];N=64
 for z,rx,ry in levels:
  for j in range(N):a=2*pi*j/N;vs.append((rx*sin(a),ry*cos(a),z))
 for k in range(len(levels)-1):
  for j in range(N):a=k*N+j;b=k*N+(j+1)%N;fs.append((a,b,b+N,a+N))
 return mesh(name,vs,fs,m,bone)
# Skin starts exactly on the garment edge; no hidden shoulder surface can
# protrude through the robe when the torso twists independently of the sleeves.
N=64;skinvs=[];skinfs=[]
for k in range(5):
 for j in range(N):
  a=2*pi*j/N;t=k/4;edge=1.19-.12*max(0,cos(a))**7
  rx=[.240,.22,.175,.105,.075][k];ry=[.175,.153,.117,.085,.07][k]
  z=edge if k==0 else [0,1.235,1.265,1.295,1.36][k]
  skinvs.append((rx*sin(a),ry*cos(a),z))
for k in range(4):
 for j in range(N):a=k*N+j;b=k*N+(j+1)%N;skinfs.append((a,b,b+N,a+N))
mesh('Aya exposed neckline',skinvs,skinfs,skin,spine)
# Off-shoulder wrap with a shallow crossed neckline.
vs=[];fs=[];N=64
for k in range(5):
 for j in range(N):
  a=2*pi*j/N;t=k/4;top=1.19-.12*max(0,cos(a))**7
  vs.append(((.185+.055*t)*sin(a),(.16+.015*t)*cos(a),.98+(top-.98)*t))
for k in range(4):
 for j in range(N):a=k*N+j;b=k*N+(j+1)%N;fs.append((a,b,b+N,a+N))
bodice=mesh('Aya off shoulder kimono',vs,fs,cloth,spine)
# Anchor the lower wrap to the same pelvis as the obi. A spine-only bodice
# pulled away from the belt when the inherited clips tilted/twisted the chest.
bodice.vertex_groups.clear()
pelvis_group=bodice.vertex_groups.new(name='Bip001 Pelvis');chest_group=bodice.vertex_groups.new(name=spine)
for vertex in bodice.data.vertices:
 t=min(1,max(0,(vertex.co.z-1.015)/.07));t=t*t*(3-2*t)
 pelvis_group.add([vertex.index],1-t,'REPLACE');chest_group.add([vertex.index],t,'REPLACE')
points=vs[-N:]+[vs[-N]];tube('Aya neckline gold edging',points,[.006]*len(points),gold,spine)
band('Aya wide obi',[(.855,.194,.169),(.88,.195,.17),(.99,.202,.178),(1.015,.205,.18)],obi,'Bip001 Pelvis')
# An inward return under the wrap seals the upper belt edge in overhead views.
band('Aya obi inner return',[(1.015,.205,.18),(.99,.17,.145),(.96,.17,.145)],obi,'Bip001 Pelvis')
skirt=band('Aya continuous kimono skirt',[(.12,.205,.18),(.3,.225,.19),(.55,.24,.19),(.78,.215,.18),(.87,.185,.16)],cloth,'Bip001 Pelvis')
# Transfer nearest source leg weights to let the closed skirt follow Sakura's gait.
garment_weights(skirt)
petals=[mat('Aya plum flowers',(.44,.16,.24)),mat('Aya pink flowers',(.59,.30,.44)),mat('Aya gold flowers',(.61,.39,.15))]
for fi,(a,z,r) in enumerate([(-.5,.34,.065),(-.18,.43,.06),(-.5,.53,.045),(.45,.19,.055),(2.6,.36,.065),(3,.5,.055)]):
 center=Vector((.233*sin(a),.198*cos(a),z)); tangent=Vector((cos(a),-sin(a),0));vs=[center];fs=[]
 for j in range(60):
  t=2*pi*j/60;rad=r*(.70+.30*cos(t*5));vs.append(center+tangent*(rad*cos(t))+Vector((0,0,rad*sin(t))))
 for j in range(60):fs.append((0,1+j,1+(j+1)%60))
 flower=mesh('Aya floral applique',vs,fs,petals[fi%3],'Bip001 Pelvis');garment_weights(flower)
tube('Aya gold obi knot',[(.025*cos(a),.185+.009*sin(a),.935+.025*sin(a)) for a in [j*2*pi/32 for j in range(33)]],[.009]*33,gold,'Bip001 Pelvis')
for s in [-1,1]:
 tube('Aya obi pin',[(s*-.09,.187,.91),(s*.09,.187,.96)],[.005,.005],gold,'Bip001 Pelvis')
 # Broad feline ears embedded in the crown, with outward-swept tips.
 outline=[(.10,.04,2.055),(.25,.08,2.19),(.44,.035,2.34),(.43,.02,2.16),(.38,.02,2.00),(.32,0,1.93),(.22,0,1.97)]
 front=[(s*x,y,z) for x,y,z in outline];back=[(x,y-.085,z-.012) for x,y,z in front]
 n=len(front);vs=front+back;fs=[tuple(range(n)),tuple(reversed(range(n,2*n)))]+[(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
 ear=mesh('Aya cat ear',vs,fs,hair)
 inset=[(.16,.055,2.055),(.28,.095,2.18),(.409,.05,2.28),(.40,.04,2.15),(.35,.04,2.025),(.30,.025,1.98)]
 mesh('Aya inner ear',[(s*x,y,z) for x,y,z in inset],[tuple(range(6))],pink)
 # One irregular fan of fur, rather than stair-step triangles.
 tuft=[(.20,2.045),(.205,2.10),(.235,2.092),(.22,2.14),(.255,2.12),(.258,2.17),(.28,2.135),(.30,2.17),(.304,2.125),(.335,2.145),(.327,2.10),(.36,2.11),(.345,2.06),(.30,2.025),(.25,2.025)]
 mesh('Aya white ear tuft',[(s*(.28+(x-.28)*.9),.10,2.055+(z-2.11)*.85) for x,z in tuft],[tuple(range(len(tuft)))],white)
# A smooth swept ponytail, narrow at the tied root and converging to one tip.
controls=[((0,-.12,2.065),.07),((0,-.225,2.12),.064),((0,-.32,2.19),.085),((0,-.45,2.13),.115),((0,-.51,1.99),.105),((.018,-.51,1.81),.075),((.025,-.48,1.65),.038),((.045,-.42,1.55),.001)]
pts=[];rs=[]
for k in range(len(controls)-1):
 p0=Vector(controls[max(k-1,0)][0]);p1=Vector(controls[k][0]);p2=Vector(controls[k+1][0]);p3=Vector(controls[min(k+2,len(controls)-1)][0])
 for step in range(8):
  t=step/8;pts.append(.5*((2*p1)+(-p0+p2)*t+(2*p0-5*p1+4*p2-p3)*t*t+(-p0+3*p1-3*p2+p3)*t*t*t));rs.append(controls[k][1]*(1-t)+controls[k+1][1]*t)
pts.append(Vector(controls[-1][0]));rs.append(.001)
pony=tube('Aya tapered ponytail',pts,rs,body.data.materials[hairidx])
# Sample the original painted hair region with the same material as the bangs.
# Longitudinal UVs retain Sakura's strand highlights in the matching palette.
uv=pony.data.uv_layers.new(name='UVMap')
for poly in pony.data.polygons:
 for li in poly.loop_indices:
  vi=pony.data.loops[li].vertex_index;row=vi//24;around=(vi%24)/24
  uv.data[li].uv=((215+85*around)/512,1-(12+78*row/(len(pts)-1))/512)
# The tie is a complete cuff perpendicular to the root, not a partial torus
# buried in the ponytail. Its inner radius clears the entire root section.
axis=(Vector(controls[2][0])-Vector(controls[1][0])).normalized();u=Vector((1,0,0));v=axis.cross(u).normalized();center=Vector(controls[1][0])+axis*.015
vs=[];fs=[];N=48
for length,radius in [(-.022,.078),(.022,.078),(.022,.069),(-.022,.069)]:
 for j in range(N):a=2*pi*j/N;vs.append(center+axis*length+radius*(u*cos(a)+v*sin(a)))
for ring in range(4):
 for j in range(N):a=ring*N+j;b=ring*N+(j+1)%N;c=((ring+1)%4)*N+(j+1)%N;d=((ring+1)%4)*N+j;fs.append((a,b,c,d))
mesh('Aya continuous red hairband',vs,fs,red)
for s,side in [(-1,'L'),(1,'R')]:
 bone='Bip001 '+side+' Foot'
 cx=s*.11;N=48;vs=[];fs=[]
 # A thin continuous sole, replacing all of the original shoe fragments.
 for z in [.002,.024]:
  for j in range(N):a=2*pi*j/N;vs.append((cx+.068*sin(a),-.018+.118*cos(a),z))
 for j in range(N):a=j;b=(j+1)%N;fs.append((a,b,b+N,a+N))
 fs.extend([tuple(reversed(range(N))),tuple(range(N,2*N))]);mesh('Aya sandal sole '+side,vs,fs,sole,bone)
 # Closed foot volume overlaps the ankle and sole. Every sandal piece shares
 # this foot's rigid binding, so straps cannot drift away during ankle flexion.
 vs=[];fs=[]
 for k in range(13):
  th=.001+(pi-.002)*k/12
  for j in range(N):
   a=2*pi*j/N;vs.append((cx+.062*sin(th)*sin(a),-.018+.109*sin(th)*cos(a),.049+.043*cos(th)))
 for k in range(12):
  for j in range(N):a=k*N+j;b=k*N+(j+1)%N;fs.append((a,b,b+N,a+N))
 mesh('Aya bare foot '+side,vs,fs,skin,bone)
 tube('Aya sandal strap '+side,[(cx-.061,-.012,.032),(cx-.048,.008,.073),(cx,.046,.084),(cx+.048,.008,.073),(cx+.061,-.012,.032)],[.009]*5,hair,bone)
 tube('Aya sandal toe post '+side,[(cx,.046,.084),(cx,.053,.023)],[.006,.006],hair,bone)
for im in bpy.data.images:
 if im.type=='IMAGE':im.pack()
rig.data.pose_position='POSE'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'aya.blend'))
rest={o.name:o.matrix_basis.copy() for o in bpy.context.scene.objects}
bpy.ops.export_scene.gltf(filepath=str(ROOT/'public/chibi/aya.glb'),export_format='GLB',export_animations=True,export_nla_strips=True,export_force_sampling=True,export_def_bones=False)
for o in bpy.context.scene.objects:
 if o.animation_data:
  o.animation_data.action=None
  for t in o.animation_data.nla_tracks:t.mute=True
 o.matrix_basis=rest[o.name]
rig.data.pose_position='REST'
for o in bpy.context.scene.objects:
 if o.type=='MESH' and 'weapon' in o.name:o.hide_render=True
scene=bpy.context.scene;scene.render.engine='BLENDER_EEVEE';scene.world.color=(.4,.4,.4);scene.render.film_transparent=True
scene.render.resolution_x=900;scene.render.resolution_y=1000;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
for pos,power in [((2,4,5),250),((-3,2,3),180),((0,-3,4),220)]:
 bpy.ops.object.light_add(type='AREA',location=pos);bpy.context.object.data.energy=power;bpy.context.object.data.size=4
for name,pos in [('front',(0,5,1.2)),('three-quarter',(3,5,1.7)),('back',(0,-5,1.2))]:
 bpy.ops.object.camera_add(location=pos);cam=bpy.context.object;cam.rotation_euler=(Vector((0,0,1.2))-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.type='ORTHO';cam.data.ortho_scale=2.8;scene.camera=cam
 scene.render.filepath=str(PREVIEW/('aya-'+name+'.png'));bpy.ops.render.render(write_still=True)
print('AYA_BUILD_COMPLETE')




