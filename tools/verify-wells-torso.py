"""Confirm that the skin retains Product 08's original lower torso shape."""
import bpy,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(ROOT/'public/chibi/c302_00.glb'))
body=bpy.data.objects['c302_00_skin.001']
components=json.loads((ROOT/'artifacts/wells/components.json').read_text())
ids=components[53]['verts']+components[57]['verts']
original={tuple(round(float(c),6) for c in body.data.vertices[i].co) for i in ids if (body.matrix_world@body.data.vertices[i].co).z<.999}
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/characters/wells/wells-research.blend'))
body=bpy.data.objects['c302_00_skin.001']
retained={tuple(round(float(c),6) for c in v.co) for v in body.data.vertices}
assert original<=retained, 'Original lower torso vertices changed or missing'
report={'originalLowerTorsoVertices':len(original),'preservedExactly':len(original&retained),'source':'c302_00.glb','result':'pass'}
(ROOT/'artifacts/wells/original-torso-comparison.json').write_text(json.dumps(report,indent=2))
print(report)
