from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,hashlib
B=Path('art-studies/arcana-hero/white-bob-heroine/blender-v7');P=B/'face-refinement';V=P/'review/final';font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',27);small=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',18);bg=(232,228,227);ink=(49,40,52)
out=Image.new('RGB',(1800,990),bg);d=ImageDraw.Draw(out)
for i,(file,label) in enumerate([('before-front','이전 얼굴 · 보존된 V7'),('front','얼굴 집중 수정 · 실제 3D')]):
 im=Image.open(V/(file+'.png')).convert('RGB');assert im.size==(900,900);out.paste(im,(900*i,52));d.text((900*i+20,12),label,font=font,fill=ink)
d.text((20,965),'같은 카메라·배율의 실제 모델입니다. 머리카락은 유지하고 얼굴 조형과 눈 재질을 수정했습니다.',font=small,fill=ink);out.save(V/'face-before-after.png')
board=Image.new('RGB',(1800,650),bg);d=ImageDraw.Draw(board)
for i,(file,label) in enumerate([('front','정면'),('three-quarter','사선'),('profile','측면')]):
 im=Image.open(V/(file+'.png')).convert('RGB').resize((600,600),Image.Resampling.LANCZOS);board.paste(im,(600*i,50));d.text((600*i+16,12),label,font=font,fill=ink)
board.save(V/'face-angles.png')
ref=Image.open(B.parent/'blender-v6/approved-concept.png').convert('RGB').crop((640,0,1250,525));old=Image.open(B/'review/reference-pose-native-v7.png').convert('RGB').resize((610,525),Image.Resampling.LANCZOS);new=Image.open(V/'reference-pose.png').convert('RGB').resize((610,525),Image.Resampling.LANCZOS);out=Image.new('RGB',(1830,615),bg);d=ImageDraw.Draw(out)
for i,(im,label) in enumerate([(ref,'승인 시안'),(old,'이전 얼굴'),(new,'얼굴 집중 수정 · 실제 모델')]):out.paste(im,(i*610,52));d.text((i*610+15,12),label,font=font,fill=ink)
d.text((15,585),'승인 그림은 유지했습니다. 비교용 자세는 기존 카메라와 같은 값이며, 모델 원본은 중립 고개입니다.',font=small,fill=ink);out.save(V/'reference-face-comparison.png')
e=json.loads((V/'render-evidence.json').read_text());assert hashlib.sha256((P/'heroine-face.blend').read_bytes()).hexdigest()==e['source_sha256'];assert hashlib.sha256((B/'heroine-v7-head.blend').read_bytes()).hexdigest()==e['baseline_sha256'];e.update({'source':'heroine-face.blend','scope':'Face-only geometry, eye materials and line finish; hair geometry preserved','game_integration':False,'status':'Refined native model candidate for visual review','shape_key_control':'V7 MASTER[face_refinement_weight]'});(P/'delivery.json').write_text(json.dumps(e,indent=2),encoding='utf8');print('Face comparison packaged from preserved native models. Hair geometry and both source hashes verified.')
