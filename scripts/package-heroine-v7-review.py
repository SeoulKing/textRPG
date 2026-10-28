from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
P=Path('art-studies/arcana-hero/white-bob-heroine/blender-v7');V=P/'review';font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',22);small=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',16)
ref=Image.open(P.parent/'blender-v6/approved-concept.png').convert('RGB').crop((640,0,1250,525));new=Image.open(V/'reference-pose-native-v7.png').convert('RGB').resize((610,525),Image.Resampling.LANCZOS);old=Image.open(P.parent/'blender-v6/review/reference-pose-v6.png').convert('RGB').resize((610,525),Image.Resampling.LANCZOS)
out=Image.new('RGB',(1830,620),(231,227,226));d=ImageDraw.Draw(out)
for i,(im,label) in enumerate([(ref,'승인 시안 · 변경하지 않음'),(old,'이전 V6 · 사용자가 거절한 후보'),(new,'추가 수정 V7 · 실제 3D / 미승인')]):
 out.paste(im,(i*610,52));d.text((i*610+15,12),label,font=font,fill=(43,38,45))
d.text((15,590),'동일 참조 영역의 비교용 자세입니다. 원본 모델은 중립 자세이며, 일러스트와의 외형 차이는 남아 있습니다.',font=small,fill=(60,51,65));out.save(V/'reference-comparison-v7.png')
board=Image.new('RGB',(1500,375),(231,227,226));d=ImageDraw.Draw(board)
for i,(name,label) in enumerate([('front-native-v7','정면'),('portrait-native-v7','사선'),('side-native-v7','측면'),('rear-native-v7','뒷머리'),('clay-native-v7','재질 제거 · 실제 조형')]):
 im=Image.open(V/(name+'.png')).convert('RGB').resize((300,300),Image.Resampling.LANCZOS);board.paste(im,(i*300,52));d.text((i*300+10,12),label,font=small,fill=(43,38,45))
board.save(V/'model-angles-v7.png')
frames=[Image.open(V/'turntable'/f'{i:02d}.png').convert('RGB') for i in range(16)];frames[0].save(V/'head-turntable-v7.gif',save_all=True,append_images=frames[1:],duration=150,loop=0,optimize=False,disposal=2)
evidence=json.loads((V/'render-evidence.json').read_text());assert hashlib.sha256((P/'heroine-v7-head.blend').read_bytes()).hexdigest()==evidence['source_sha256'];evidence.update({'status':'unapproved candidate; below the approved illustration target','reference_projection_used_in_master':False,'face_basis':'Sendagaya Shino CC0, modified mesh and prior painted UV','hair_basis':'Sendagaya Shibu CC0 rear foundation; newly sculpted front, framing and curls','game_integration':False,'remaining_visual_gaps':['Hair clumps are broader and more uniform than the reference','Face expression and lower eyelid detail remain different','Supporting bust lacks final costume detail']});(P/'delivery.json').write_text(json.dumps(evidence,indent=2),encoding='utf8');print('V7 comparisons and true native turntable packaged; approval remains pending.')
