"""Connected coat and replacement torso, executed in build-wells-skin globals."""
navy=mat('Wells tailored undersuit',(.075,.115,.19))
HEM_COUNT=11
hem_angles=[.60+(2*pi-1.20)*i/(HEM_COUNT-1) for i in range(HEM_COUNT)]
bpy.context.view_layer.objects.active=rig; rig.select_set(True); bpy.ops.object.mode_set(mode='EDIT')
inv=rig.matrix_world.inverted()
for i,a in enumerate(hem_angles):
 bone=rig.data.edit_bones.new(f'Wells_Hem_{i:02d}')
 bone.head=inv@Vector((.245*sin(a),.19*cos(a)-.006,.87))
 bone.tail=inv@Vector((.35*sin(a),.245*cos(a)-.006,.59))
 bone.parent=rig.data.edit_bones['Bip001 Pelvis']
 tip=rig.data.edit_bones.new(f'Wells_HemTip_{i:02d}')
 tip.head=bone.tail; tip.tail=bone.tail+Vector((0,.015,0));tip.parent=bone
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
def hem_weight(z,a):
 amount=max(0,min(1,(.87-z)/.19))
 if amount==0:
  # Keep the hip band with the pelvis. Blending this row into the aimed
  # spine twisted it across the thighs while the hem stayed with the legs.
  t=max(0,min(1,(z-.92)/.18))
  return {spine:t,'Bip001 Pelvis':1-t}
 f=max(0,min(HEM_COUNT-1,(a-.60)/(2*pi-1.20)*(HEM_COUNT-1)))
 i=min(HEM_COUNT-2,int(f)); t=f-i
 return {'Bip001 Pelvis':1-amount,f'Wells_Hem_{i:02d}':amount*(1-t),f'Wells_Hem_{i+1:02d}':amount*t}
def torso_weight(z):
 t=max(0,min(1,(z-.79)/.31)); return {spine:t,'Bip001 Pelvis':1-t}
# Rebuilt smooth torso replaces the bulky plated chest under the coat.
body_levels=[(1.29,.065,.065),(1.245,.10,.08),(1.205,.16,.10),(1.14,.185,.145),(1.07,.18,.15),(.995,.153,.125),(.955,.135,.10)]
vs=[]; fs=[]; weights=[]; S=48
for z,rx,ry in body_levels:
 for j in range(S):
  a=2*pi*j/S; x=rx*sin(a); y=ry*cos(a)
  # Left underarm: recess only the covered side of the undersuit. The visible
  # chest remains unchanged while the sleeve folds inward in rifle poses.
  underarm=max(0,1-abs(z-1.115)/.13)*max(0,min(1,(-x-.105)/.065))
  x+=.032*underarm; y*=1-.10*underarm
  vs.append((x,y,z)); weights.append(torso_weight(z))
for r in range(len(body_levels)-1):
 for j in range(S):
  a=r*S+j; b=r*S+(j+1)%S; face=(a,b,b+S,a+S)
  center=sum((Vector(vs[i]) for i in face),Vector())/4
  # Covered side/back torso beneath each sleeve is deliberately masked.
  # Keep the complete visible chest; hidden geometry cannot poke through
  # a compressed sleeve in the rifle aiming and reload poses.
  if center.z>1.015 and abs(center.x)>.105 and center.y<.105: continue
  fs.append(face)
torso=mesh('Wells_Rebuilt_Torso',vs,fs,navy,weights)
# Dedicated chest texture with a continuous UV projection, free of the old
# armor atlas's straps and seams.
size=1024; yy,xx=np.mgrid[0:size,0:size]; x=(xx/(size-1)-.5)*.5; z=.54+yy/(size-1)*.78
sample=np.stack([x,z],-1); dist=np.full((size,size),100.)
paths=[[(0,1.17),(.062,1.115),(0,1.05),(-.062,1.115),(0,1.17)],[(0,1.215),(0,1.16)],[(.017*cos(t*2*pi/40),1.225+.013*sin(t*2*pi/40)) for t in range(41)]]
for side in [-1,1]: paths.append([(side*.018+.048*cos(t*2*pi/48),1.078+.022*sin(t*2*pi/48)) for t in range(49)])
for path in paths:
 for p1,p2 in zip(path,path[1:]):
  p1=np.array(p1); d=np.array(p2)-p1; f=np.clip(np.sum((sample-p1)*d,-1)/np.dot(d,d),0,1)
  dist=np.minimum(dist,np.linalg.norm(sample-p1-f[...,None]*d,axis=-1))
pix=np.ones((size,size,4),dtype=np.float32); pix[:,:,:3]=(.28,.35,.46)
pix[dist<.002,:3]=(.76,.83,.88)
gem=(z>=1.094)&(z<=1.127)&(abs(x)<.025*(z-1.094)/.033); pix[gem,:3]=(.12,.72,.99)
# Subtle center seam, continuing below the emblem.
pix[(abs(x)<.0015)&(z<1.045),:3]=(.36,.43,.53)
tex=bpy.data.images.new('Wells chest emblem',width=size,height=size); tex.pixels[:]=pix.ravel(); tex.filepath_raw=str(OUT/'wells-chest.png'); tex.file_format='PNG'; tex.save()
chest=mat('Wells seamless chest emblem',(.1,.15,.25)); nodes=chest.node_tree.nodes; node=nodes.new('ShaderNodeTexImage'); node.image=tex; chest.node_tree.links.new(node.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color'])
torso.data.materials.append(chest); uv=torso.data.uv_layers.new(name='ChestProjection')
for p in torso.data.polygons:
 p.material_index=1 if sum(torso.data.vertices[i].co.y for i in p.vertices)>0 else 0
 for li in p.loop_indices:
  co=torso.data.vertices[torso.data.loops[li].vertex_index].co; uv.data[li].uv=(co.x/.5+.5,(co.z-.54)/.78)

# One continuous surface: front panels, back, shoulders and both sleeves.
# Armhole boundary vertices are reused by the sleeve, not overlapped by caps.
levels=[(1.285,.085,.083,.62),(1.245,.17,.104,.56),(1.18,.205,.145,.52),(1.075,.205,.168,.52),(.98,.21,.17,.54),(.87,.28,.225,.58),(.76,.325,.235,.60),(.65,.345,.245,.63),(.59,.35,.245,.65)]
N=32; vs=[]; fs=[]; weights=[]
for z,rx,ry,opening in levels:
 for j in range(N+1):
  a=opening+(2*pi-2*opening)*j/N
  x=rx*sin(a); y=ry*cos(a)-.006
  ease=max(0,1-abs(z-1.075)/.17)*max(0,min(1,(-x-.11)/.07))
  vs.append((x-.018*ease,y*(1+.05*ease),z)); weights.append(hem_weight(z,a))
holes=[(6,10,1,3),(22,26,1,3)]
for r in range(len(levels)-1):
 for j in range(N):
  if any(c0<=j<c1 and r0<=r<r1 for c0,c1,r0,r1 in holes): continue
  a=r*(N+1)+j; fs.append((a,a+1,a+N+2,a+N+1))
for side,(c0,c1,r0,r1) in zip([1,-1],holes):
 bside='R' if side>0 else 'L'; upper='Bip001 '+bside+' UpperArm'; fore='Bip001 '+bside+' Forearm'
 perimeter=[r0*(N+1)+j for j in range(c0,c1+1)]
 perimeter += [r*(N+1)+c1 for r in range(r0+1,r1+1)]
 perimeter += [r1*(N+1)+j for j in range(c1-1,c0-1,-1)]
 perimeter += [r*(N+1)+c0 for r in range(r1-1,r0,-1)]
 # Sort boundary around the arm axis; this avoids any twist at the seam.
 tangent=Vector((side*.78,0,-.625)).normalized(); axis=Vector((0,1,0)); other=tangent.cross(axis).normalized()
 center=sum((Vector(vs[i]) for i in perimeter),Vector())/len(perimeter)
 perimeter.sort(key=lambda i:math.atan2((Vector(vs[i])-center).dot(other),(Vector(vs[i])-center).dot(axis)))
 angles=[math.atan2((Vector(vs[i])-center).dot(other),(Vector(vs[i])-center).dot(axis)) for i in perimeter]
 for i in perimeter:
  # Do not let the left sleeve drag the lower armhole into the torso.
  share=.35 if side>0 else .10+.25*max(0,min(1,(vs[i][2]-1.075)/.17))
  weights[i]={spine:1-share,upper:share}
 prev=perimeter; count=len(prev)
 rings=[(.245,1.115,.084,.0),(.29,1.073,.081,.05),(.33,1.039,.080,.35),(.357,1.015,.077,.7),(.405,.975,.073,1),(.465,.927,.067,1),(.491,.905,.067,1)]
 for k,(cx,cz,radius,blend) in enumerate(rings):
  center=Vector((side*cx,.008,cz)); ring=[]
  for a in angles:
   ring.append(len(vs)); vs.append(center+radius*(axis*cos(a)+other*sin(a)))
   weights.append({upper:1-blend,fore:blend})
  for j in range(count): fs.append((prev[j],prev[(j+1)%count],ring[(j+1)%count],ring[j]))
  prev=ring
 # Narrow sewn cuff, following the forearm exactly.
 cuffvs=[]; cufffs=[]
 for length,rad in [(0,.070),(.022,.070)]:
  center=Vector((side*.475,.008,.918))+tangent*length
  for a in angles: cuffvs.append(center+rad*(axis*cos(a)+other*sin(a)))
 for j in range(count): cufffs.append((j,(j+1)%count,(j+1)%count+count,j+count))
 cuff=mesh('Wells_Cuff_'+bside,cuffvs,cufffs,white,[{fore:1}]*len(cuffvs)); shell(cuff,.004)
coat=mesh('Wells_Coat_Continuous',vs,fs,white,weights)
# Remove unused interior armhole vertices and make all garment normals
# consistent before adding physical fabric thickness.
bm=bmesh.new(); bm.from_mesh(coat.data)
bmesh.ops.delete(bm,geom=[v for v in bm.verts if not v.link_faces],context='VERTS')
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
boundary={v for e in bm.edges if e.is_boundary for v in e.verts}; loops=[]
while boundary:
 stack=[boundary.pop()]; loop=[]
 while stack:
  v=stack.pop(); loop.append(v)
  for e in v.link_edges:
   other=e.other_vert(v)
   if e.is_boundary and other in boundary: boundary.remove(other); stack.append(other)
 loops.append(len(loop))
assert len(loops)==3, f'Unexpected garment opening: {loops}'
assert all(e.is_manifold or e.is_boundary for e in bm.edges), 'Nonmanifold garment seam'
(PREVIEW/'coat-topology.json').write_text(json.dumps({'boundaryLoops':len(loops),'loopVertexCounts':loops,'description':'One front/neck/hem opening and two wrist openings; no shoulder or armhole gaps.'},indent=2))
bm.to_mesh(coat.data); bm.free()
sub=coat.modifiers.new('Tailored smooth panels','SUBSURF'); sub.levels=2
shell(coat,.005)
# Horizontal cyan patches, projected directly onto the fabric just below
# each shoulder. Transfer local surface weights so patches follow the seam.
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree
bpy.context.view_layer.update(); deps=bpy.context.evaluated_depsgraph_get()
evaluated=coat.evaluated_get(deps); surface=evaluated.to_mesh()
surface.calc_loop_triangles()
bvh=BVHTree.FromPolygons([v.co for v in surface.vertices],[p.vertices[:] for p in surface.loop_triangles],all_triangles=True)
kd=KDTree(len(surface.vertices))
for v in surface.vertices: kd.insert(v.co,v.index)
kd.balance()
def fabric_point(x,z,side=None,y=0):
 origin=Vector((x,1,z)) if side is None else Vector((side,y,z))
 direction=Vector((0,-1,0)) if side is None else Vector((-side,0,0))
 hit,normal,face,dist=bvh.ray_cast(origin,direction)
 assert hit is not None, 'Fabric detail misses garment'
 ids=surface.loop_triangles[face].vertices
 a,b,c=[surface.vertices[i].co for i in ids]; u=b-a; v=c-a; p=hit-a
 uu=u.dot(u); uv=u.dot(v); vv=v.dot(v); pu=p.dot(u); pv=p.dot(v); den=uu*vv-uv*uv
 wb=(vv*pu-uv*pv)/den; wc=(uu*pv-uv*pu)/den; wa=1-wb-wc
 weights={}
 for vi,w in zip(ids,[wa,wb,wc]):
  for g in surface.vertices[vi].groups:
   name=coat.vertex_groups[g.group].name; weights[name]=weights.get(name,0)+g.weight*w
 return hit+normal*.0045,{n:max(0,w) for n,w in weights.items()}
for side in [-1,1]:
 verts=[]; faces=[]; ws=[]
 for row in range(3):
  for col in range(7):
   y=(col/6-.5)*.070; z=1.17+(row/2-.5)*.026
   point,weight=fabric_point(0,z,side=side,y=y); verts.append(point); ws.append(weight)
 for row in range(2):
  for col in range(6): a=row*7+col; faces.append((a,a+1,a+8,a+7))
 badge=mesh('Wells_Shoulder_Patch_'+str(side),verts,faces,cyan,ws); shell(badge,.0015)
 # Pocket welts lie on the flared panels, with the same surface weights.
 verts=[]; ws=[]
 for x,z in [(side*.195,.816),(side*.245,.816),(side*.245,.808),(side*.195,.808)]:
  point,weight=fabric_point(x,z); verts.append(point); ws.append(weight)
 mesh('Wells_Pocket_Welt_'+str(side),verts,[(0,1,2,3)],inner,ws)
evaluated.to_mesh_clear()
for side in [-1,1]:
 # Narrow notched lapels reveal the fitted chest and taper into the opening.
 v=[(side*.051,.081,1.29),(side*.10,.091,1.275),(side*.165,.118,1.225),(side*.119,.15,1.195),(side*.15,.16,1.174),(side*.09,.151,1.025),(side*.065,.155,1.17)]
 o=mesh('Wells_Notched_Lapel_'+str(side),v,[(0,1,2,3,6),(6,3,4,5)],white,[{spine:1}]*7); shell(o,.004)
 v=[(side*.057,-.074,1.285),(side*.08,-.065,1.317),(side*.108,.036,1.30),(side*.051,.081,1.29)]
 o=mesh('Wells_Folded_Collar_'+str(side),v,[(0,1,2,3)],white,[{spine:1}]*4); shell(o,.004)
