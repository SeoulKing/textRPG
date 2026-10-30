"""Package actual Blender review images; never redraw or synthesize model previews."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
P=Path('art-studies/arcana-hero/white-bob-heroine/blender-v5');V=P/'review'
font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',24);small=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',17)
ref=Image.open(P/'approved-concept.png').convert('RGB').crop((625,0,1240,525))
actual=Image.open(V/'face-three-quarter.png').convert('RGB')
board=Image.new('RGB',(1280,720),(231,228,226));d=ImageDraw.Draw(board)
for im,x,label in [(ref,20,'승인 시안 · 생성 이미지'),(actual,650,'실제 Blender 모델 · 사선 렌더')]:
 d.text((x,14),label,font=font,fill=(50,46,55));im=ImageOps.contain(im,(610,610),Image.Resampling.LANCZOS);board.paste(im,(x+(610-im.width)//2,64+(610-im.height)//2))
d.text((20,688),'같은 디자인 비교입니다. 시안의 고개 기울기와 포즈는 실제 중립 모델과 다릅니다.',font=small,fill=(65,61,70));board.save(V/'reference-vs-model.png')
angles=Image.new('RGB',(1600,660),(231,228,226));d=ImageDraw.Draw(angles)
for i,(file,label) in enumerate([('face-front','정면'),('face-three-quarter','사선'),('face-side','측면'),('face-clay','재질 제거 · 입체 확인')]):
 d.text((i*400+15,14),label,font=font,fill=(50,46,55));im=Image.open(V/(file+'.png')).convert('RGB').resize((400,400),Image.Resampling.LANCZOS);angles.paste(im,(i*400,70))
for i,(file,label) in enumerate([('front','정면 흉상'),('side','측면 흉상'),('rear','뒷머리')]):
 im=Image.open(V/(file+'.png')).convert('RGB');im=ImageOps.contain(im,(190,170),Image.Resampling.LANCZOS);angles.paste(im,(i*210+15,480));d.text((i*210+15,630),label,font=small,fill=(50,46,55))
d.text((700,530),'모든 화면은 같은 .blend의 실제 메시에서 출력했습니다.',font=small,fill=(60,55,65));d.text((700,565),'이번 범위: 얼굴 · 단발 · 귀 · 목 · 보조 의상 흉상',font=small,fill=(60,55,65));angles.save(V/'model-angles.png')
frames=[Image.open(V/'turntable'/f'{i:02d}.png').convert('RGB') for i in range(24)]
frames[0].save(V/'head-turntable.gif',save_all=True,append_images=frames[1:],duration=[120,120,130]*8,loop=0,optimize=False,disposal=2)
print('Packaged reference/model comparison, four-view board and 24-frame native-model turntable.')
