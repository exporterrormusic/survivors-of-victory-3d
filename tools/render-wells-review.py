"""Render the saved Wells master without rebuilding or exporting animations."""
import bpy
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[1]
PREVIEW=ROOT/'artifacts/wells/side-patches'; PREVIEW.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(ROOT/'assets/characters/wells/wells-research.blend'))
rig=next(o for o in bpy.context.scene.objects if o.type=='ARMATURE')
rest_transforms={o.name:o.matrix_basis.copy() for o in bpy.context.scene.objects}
source=(ROOT/'tools/build-wells-skin.py').read_text(encoding='utf-8')
source=source[source.index('# Unarmed rest-pose turnarounds'):]
source=source.replace("('back',(0,-5,1.13))", "('back',(0,-5,1.13)),('side',(5,0,1.3))")
source=source.replace("ROOT/'public/chibi/wells_research_icon.png'", "PREVIEW/'portrait.png'")
exec(compile(source,'wells-review','exec'),globals())
