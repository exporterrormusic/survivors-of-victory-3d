"""Bake exact Japanese lettering and a porcelain blossom design for the sake props."""
from pathlib import Path
from math import sin, cos, pi
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
out = root / 'public/environment/easter-egg-props'
out.mkdir(parents=True, exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/YuGothB.ttc', 150)
for name, ink in [('jug', '#24384a'), ('cup', '#fff8e9')]:
    im = Image.new('RGBA', (1024, 1024))
    d = ImageDraw.Draw(im)
    if name == 'jug':
        for flip in [False, True]:
            def pt(x,y): return (1024-x if flip else x,y)
            d.line([pt(105,920),pt(160,770),pt(185,610),pt(280,470),pt(315,285)],fill='#685054',width=12)
            d.line([pt(180,650),pt(95,520),pt(80,405)],fill='#685054',width=7)
            for x,y,s in [(150,770,43),(185,610,58),(280,470,50),(315,285,44),(95,520,45),(80,405,30)]:
                x,y=pt(x,y)
                for k in range(5):
                    a=k*2*pi/5-pi/2;cx=x+cos(a)*s*.65;cy=y+sin(a)*s*.65
                    d.ellipse((cx-s*.52,cy-s*.52,cx+s*.52,cy+s*.52),fill='#e9a4b0',outline='#c9637c',width=3)
                d.ellipse((x-9,y-9,x+9,y+9),fill='#d9a54d')
    lettering = ImageFont.truetype('C:/Windows/Fonts/YuGothB.ttc', 220) if name == 'cup' else font
    for i,char in enumerate('誤り輸出'):
        y = 165+i*230 if name == 'cup' else 225+i*162
        d.text((512,y),char,font=lettering,anchor='mm',fill=ink,stroke_width=2 if name == 'cup' else 1)
    im.save(out/f'sake-{name}-decoration.png',optimize=True)
    print(out/f'sake-{name}-decoration.png')
