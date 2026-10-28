"""Author the Vapaus specimen label (Pillow + qrcode)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import qrcode
root=Path(__file__).resolve().parents[1]
out=root/'public/environment/easter-egg-props'
out.mkdir(parents=True,exist_ok=True)
image=Image.new('RGB',(768,512),'#dedbd1');draw=ImageDraw.Draw(image)
font_dir=Path('C:/Windows/Fonts')
bold=lambda n:ImageFont.truetype(str(font_dir/'arialbd.ttf'),n)
regular=lambda n:ImageFont.truetype(str(font_dir/'arial.ttf'),n)
draw.rectangle((0,0,767,15),fill='#8b1625')
draw.rectangle((24,32,744,480),outline='#a7a59e',width=2)
draw.text((52,48),'VAPAUS',font=bold(96),fill='#71202a')
draw.line((52,162,711,162),fill='#aaa69b',width=3)
draw.text((55,210),'Subject 07',font=bold(48),fill='#333c41')
draw.text((55,284),'SPECIMEN',font=regular(33),fill='#525a5b')
draw.text((55,427),'S U B J E C T  /  0 7',font=regular(23),fill='#535958')
# Encode the channel URL exactly, including a four-module white quiet zone.
qr=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=6,border=4)
qr.add_data('https://www.youtube.com/@ExportErrorMusic');qr.make(fit=True)
code=qr.make_image(fill_color='black',back_color='white').convert('RGB')
image.paste(code,(714-code.width,193))
# A few small worn edges, away from the identifying text.
for x,y in [(2,73),(756,180),(10,451),(750,475)]:draw.rectangle((x,y,x+8,y+22),fill='#b8b4a8')
image.save(out/'vapaus-label.png',optimize=True)
print(out/'vapaus-label.png')
