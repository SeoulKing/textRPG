from pathlib import Path
from PIL import Image,ImageDraw,ImageFont,ImageOps
import json,hashlib
P=Path('art-studies/arcana-hero/white-bob-heroine/blender-v6');V=P/'review';font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',23);small=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',16)
ref=Image.open(P/'approved-concept.png').convert('RGB').crop((640,0,1250,525));model=Image.open(V/'reference-pose-v6.png').convert('RGB').resize((610,525),Image.Resampling.LANCZOS);out=Image.new('RGB',(1220,600),(231,227,226));out.paste(ref,(0,50));out.paste(model,(610,50));d=ImageDraw.Draw(out);d.text((16,10),'승인 시안',font=font,fill=(43,38,45));d.text((625,10),'실제 3D V6 · 비교용 자세',font=font,fill=(43,38,45));d.text((16,578),'실제 메시/UV/재질을 수정했습니다. 모델 원본은 중립 자세로 보존했습니다.',font=small,fill=(65,57,67));out.save(V/'reference-comparison-v6.png')
board=Image.new('RGB',(1500,680),(231,227,226));d=ImageDraw.Draw(board)
for i,(file,label) in enumerate([('front-v6','정면'),('portrait-v6','사선'),('side-v6','측면'),('rear-v6','뒷머리'),('clay-v6','재질 제거 · 실제 조형')]):
 im=Image.open(V/(file+'.png')).convert('RGB').resize((300,300),Image.Resampling.LANCZOS);board.paste(im,(i*300,55));d.text((i*300+10,10),label,font=small,fill=(43,38,45))
old=Image.open(P.parent/'blender-v5/review/portrait-native-v5.png').convert('RGB');old=ImageOps.contain(old,(260,260),Image.Resampling.LANCZOS);new=Image.open(V/'portrait-v6.png').convert('RGB').resize((260,260),Image.Resampling.LANCZOS);board.paste(old,(20,380));board.paste(new,(300,380));d.text((25,650),'V5 보존본',font=small,fill=(43,38,45));d.text((305,650),'V6 현재 모델',font=small,fill=(43,38,45));d.text((610,420),'긴 앞머리 · 독립된 갈라진 끝 · 가는 속눈썹 · 새 피부/눈 UV',font=font,fill=(55,47,60));d.text((610,465),'정면 중립과 비교용 고개 자세를 함께 확인했습니다.',font=small,fill=(55,47,60));d.text((610,500),'같은 .blend를 새로 읽어 정면/측면/뒤/회색 조형/회전을 출력했습니다.',font=small,fill=(55,47,60));board.save(V/'model-angles-v6.png')
frames=[Image.open(V/'turntable'/f'{i:02d}.png').convert('RGB') for i in range(24)];frames[0].save(V/'head-turntable-v6.gif',save_all=True,append_images=frames[1:],duration=[120,120,130]*8,loop=0,optimize=False,disposal=2)
textures={}
for file in (P/'textures').glob('*.png'):
 im=Image.open(file);textures[file.name]={'size':list(im.size),'mode':im.mode,'alpha_extrema':im.getchannel('A').getextrema() if 'A' in im.getbands() else None}
report={'source':'heroine-v6-head.blend','source_sha256':hashlib.sha256((P/'heroine-v6-head.blend').read_bytes()).hexdigest(),'rendered_from_saved_native_model':True,'turntable_frames':24,'scope':'head and bob hair with supporting costume bust','game_integration':False,'browser_or_gameplay_testing':False,'new_primary_hair_flows':23,'independent_split_ends':46,'textures':textures,'reference_image_is_editor_only':True,'pose_registration_is_not_art_approval':True}
(P/'delivery.json').write_text(json.dumps(report,indent=2),encoding='utf8');print('Packaged actual V6 model comparison, native multi-angle board, turntable and source hash.')
