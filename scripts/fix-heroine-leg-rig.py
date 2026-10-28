from pathlib import Path
from PIL import Image,ImageDraw,ImageOps
import shutil,json
r=Path('godot-arcana/art/source/heroine');backup=Path('art-studies/arcana-reference-v1/before-fixed-legs');backup.mkdir(exist_ok=True)
for p in list((r/'parts').glob('boots-*.png'))+list((r/'skeletal').glob('leg-*.png')):
 if not (backup/p.name).exists():shutil.copyfile(p,backup/p.name)
if not (backup/'hero-original.png').exists():shutil.copyfile('godot-arcana/art/export/reference/hero-original.png',backup/'hero-original.png')
for kind in ['boots-taupe','boots-navy']:
 src=Image.open(r/'masters'/f'{kind}-e.png').convert('RGBA');mask=Image.new('L',src.size);draw=ImageDraw.Draw(mask)
 poly=[(45,101),(49,101),(49,107),(52,110),(55,111),(55,113),(52,115),(48,116),(44,114),(44,109)]
 draw.polygon(poly,fill=255);one=Image.new('RGBA',src.size);one.paste(src,(0,0),mask)
 dark=min((c for c in src.getdata() if c[3]),key=lambda c:sum(c[:3]));p=ImageDraw.Draw(one);p.line(poly+[poly[0]],fill=dark,width=1)
 for d in ['e','w']:
  glyph=one if d=='e' else ImageOps.mirror(one)
  anchor=47 if d=='e' else 48
  for side,target in [('left',44),('right',53)]:
   im=Image.new('RGBA',(96,136));im.alpha_composite(glyph,(target-anchor,0));im.save(r/'parts'/f'{kind}-{d}-{side}.png')
# Bind every cuff/calf to the actual ankle rest point rather than to image halves.
for d in ['s','se','e','ne','n','nw','w','sw']:
 for side,target in [('left',44),('right',53)]:
  path=r/'skeletal'/f'leg-{d}-{side}.png';im=Image.open(path).convert('RGBA');xs=[x for y in range(98,101) for x in range(96) if im.getpixel((x,y))[3]]
  if xs:
   shift=round(target-sum(xs)/len(xs));out=Image.new('RGBA',im.size);out.alpha_composite(im,(shift,0));out.save(path)
  if d not in ['e','w']:
   for kind in ['boots-taupe','boots-navy']:
    path=r/'parts'/f'{kind}-{d}-{side}.png';im=Image.open(path).convert('RGBA');xs=[x for y in range(101,104) for x in range(96) if im.getpixel((x,y))[3]]
    shift=round(target-sum(xs)/len(xs));out=Image.new('RGBA',im.size);out.alpha_composite(im,(shift,0));out.save(path)
(r/'skeletal/fixed-leg-contract.json').write_text(json.dumps({'thighLength':15,'shinLength':12,'scale':[1,1],'ankleCuffs':{'left':44,'right':53},'shoeSurfacesPerVariant':2,'profileShoe':'one cuff, one sole, rear-shoe fragment removed'},indent=2)+'\n')
p=Path('godot-arcana/scripts/heroine_skeleton.gd');s=p.read_text(encoding='utf8')
a=s.index('    if side!="" and layer in ["body","body-upper"]:');b=s.index('    if y<40:',a)
s=s[:a]+'''    if side!="" and layer in ["body","body-upper"]:
        var suffix="L" if side=="left" else "R"
        if y<88:return {"Thigh"+suffix:1.0}
        if y<92:
            var t=(y-88)/4.0;return {"Thigh"+suffix:1-t,"Knee"+suffix:t}
        if y<99:return {"Knee"+suffix:1.0}
        var t=clampf((y-99)/3.0,0,1);return {"Knee"+suffix:1-t,"Ankle"+suffix:t}
'''+s[b:]
s=s.replace('    add_joint_rotations()\n    set_layer("original")','    add_joint_rotations()\n    install_fixed_legs()\n    set_layer("original")')
s=s.replace('if not child.has_meta("arm_weight_revision"):','if not child.has_meta("arm_weight_revision") or (side!="" and layer in ["body","body-upper"] and not child.has_meta("fixed_leg_weights")):')
s=s.replace('child.set_meta("arm_weight_revision",1);upgraded=true','child.set_meta("arm_weight_revision",1);child.set_meta("fixed_leg_weights",1);upgraded=true')
s+='''
func install_fixed_legs() -> void:
    for side in ["L","R"]:
        var thigh=get_node("Skeleton2D/Hip/Thigh"+side)
        var knee=thigh.get_node("Knee"+side)
        thigh.length=15;knee.length=12
    for clip in player.get_animation_list():
        var anim=player.get_animation(clip)
        if anim.has_meta("fixed_leg_revision"):continue
        var count=24 if clip=="walk" else 4
        for side in ["L","R"]:
            var prefix="Skeleton2D/Hip/Thigh"+side
            var knee_path=prefix+"/Knee"+side
            var ankle_path=knee_path+"/Ankle"+side
            for path in [prefix,knee_path,ankle_path]:
                for property in ["position","rotation","scale"]:
                    var track=anim.find_track(NodePath(path+":"+property),Animation.TYPE_VALUE)
                    if track>=0:anim.remove_track(track)
            for key in ["Thigh","Knee","Ankle"]:
                var path=prefix if key=="Thigh" else knee_path if key=="Knee" else ankle_path
                var pos_track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(pos_track,NodePath(path+":position"))
                var local_position=Vector2(-4 if side=="L" else 5,1) if key=="Thigh" else Vector2(0,15 if key=="Knee" else 12)
                anim.track_insert_key(pos_track,0.0,local_position)
                var scale_track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(scale_track,NodePath(path+":scale"));anim.track_insert_key(scale_track,0.0,Vector2.ONE)
                var angle_track=anim.add_track(Animation.TYPE_VALUE);anim.track_set_path(angle_track,NodePath(path+":rotation"))
                for f in range(count+1):
                    var t=float(f)/count
                    var phase=t if clip=="walk" else .3 if clip=="stop_left" else .8
                    var amount=1.0 if clip=="walk" else 1.0-smoothstep(0.0,1.0,t) if str(clip).begins_with("stop") else 0.0
                    var angles=leg_angles(phase,amount,side)
                    var angle=angles[0] if key=="Thigh" else angles[1] if key=="Knee" else -angles[0]-angles[1]
                    anim.track_insert_key(angle_track,t*anim.length,angle)
        anim.set_meta("fixed_leg_revision",1);upgraded=true
func leg_angles(phase: float, amount: float, side: String) -> Vector2:
    if amount<=.00001:return Vector2.ZERO
    var p=phase+(.5 if side=="L" else 0.0)
    var hip=REST["Thigh"+side]+offsets(phase,amount).Hip
    var f=foot(p)*Vector2(.55,.30)*amount
    var target=REST["Ankle"+side]+f
    var vector=target-hip
    var distance=clampf(vector.length(),3.02,26.98)
    target=hip+vector.normalized()*distance
    var bend=1.0 if direction in [1,2,3] else -1.0 if direction in [5,6,7] else -1.0 if side=="L" else 1.0
    var alpha=vector.angle()-PI*.5-bend*acos(clampf((distance*distance+225.0-144.0)/(30.0*distance),-1,1))
    var knee=hip+Vector2.DOWN.rotated(alpha)*15.0
    var beta=(target-knee).angle()-PI*.5-alpha
    return Vector2(alpha,beta)
''';p.write_text(s,encoding='utf8')
