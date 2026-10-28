"""Move only the saved decorations obstructing existing bench approaches."""
from pathlib import Path
import re,json,shutil
ROOT=Path(__file__).resolve().parents[1]
REGION=ROOT/'art-studies/regions/arcana-city-center'
scene_path=ROOT/'godot-arcana/scenes/plaza.tscn'
backup=REGION/'source/bench-clearance-before.tscn'
if not backup.exists(): shutil.copy2(scene_path,backup)
changes={
 'flowerbed_05': ((27.2,32.6),(25.8,31.1),'left and slightly behind west plaza bench'),
 'flowerbed_06': ((44,34.8),(45.5,32.7),'right and behind east plaza bench, inside garden'),
 'flowerbed_08': ((25,40.3),(27.5,38.8),'beside and behind inn-lane bench'),
 'flowerbed_09': ((62,36.6),(64,35.4),'beside school-lane bench'),
 'hedge_01': ((43.5,34),(43.5,30),'rear edge of academy garden'),
 'hedge_08': ((27.2,34.8),(27.2,36),'far edge of west garden, outside bench approach'),
 'cafe_03': ((29.3,21.5),(32.5,18.2),'restaurant terrace, behind north bench'),
 'oak_02': ((44.3,35.5),(47,31.8),'inside academy garden, away from east bench front'),
}
text=scene_path.read_text(encoding='utf-8')
blocks=re.split(r'(?=^\[node )',text,flags=re.M)
changed=[]
for index,block in enumerate(blocks):
    match=re.match(r'\[node name="([^"]+)"',block)
    if not match or match[1] not in changes: continue
    name=match[1]; before,after,reason=changes[name]
    transform=re.search(r'^transform = Transform3D\(([^)]*)\)',block,re.M)
    position=re.search(r'^position = Vector3\(([^)]*)\)',block,re.M)
    if transform:
        values=[float(v) for v in transform[1].split(',')]
        old=(values[9],values[11])
    elif position:
        values=[float(v) for v in position[1].split(',')]
        old=(values[0],values[2])
    else: raise RuntimeError('Missing saved position: '+name)
    if any(abs(a-b)>.001 for a,b in zip(old,before)) and any(abs(a-b)>.001 for a,b in zip(old,after)):
        raise RuntimeError('Decoration was edited elsewhere; inspect '+name+' '+str(old))
    if transform:
        parts=transform[1].split(',');parts[9]=str(after[0]);parts[11]=' '+str(after[1])
        block=block[:transform.start(1)]+','.join(parts)+block[transform.end(1):]
    else:
        parts=position[1].split(',');parts[0]=str(after[0]);parts[2]=' '+str(after[1])
        block=block[:position.start(1)]+','.join(parts)+block[position.end(1):]
    blocks[index]=block
    changed.append({'node':name,'from':list(before),'to':list(after),'reason':reason})
if len(changed)!=len(changes): raise RuntimeError('Some requested saved nodes are missing')
scene_path.write_text(''.join(blocks),encoding='utf-8')
# Keep the explicit original creation recipe consistent; do not run it or reset
# this editor-authored scene, its newer NPCs, or other user edits.
recipe_path=ROOT/'scripts/author-arcana-city.py'
recipe=recipe_path.read_text(encoding='utf-8')
for before,after in [('(27.2,32.6)','(25.8,31.1)'),('(44,34.8)','(45.5,32.7)'),('(25,40.3)','(27.5,38.8)'),('(62,36.6)','(64,35.4)'),('(43.5,34)','(43.5,30)'),('(27.2,34.8)','(27.2,36)'),('(29.3,21.5)','(32.5,18.2)'),("('oak',44.3,35.5,.7)","('oak',47,31.8,.7)")]:
    recipe=recipe.replace(before,after)
recipe_path.write_text(recipe,encoding='utf-8')
layout_path=REGION/'layout.json'
layout=json.loads(layout_path.read_text(encoding='utf-8'))
for placement in layout.get('placements',[]):
    name=placement['node'].rsplit('/',1)[-1]
    if name in changes:
        target=changes[name][1]
        placement['position']=[target[0],0,target[1]]
layout_path.write_text(json.dumps(layout,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
# Cheap static layout evidence, matching world.gd's rect.grow(3)/16 and seat+8/16.
# This reads coordinates only; it does not execute gameplay or alter any save.
records=[]
for block in blocks:
    name=re.match(r'\[node name="([^"]+)"',block)
    kind=re.search(r'^model_kind = "([^"]+)"',block,re.M)
    if not name or not kind: continue
    transform=re.search(r'^transform = Transform3D\(([^)]*)\)',block,re.M)
    position=re.search(r'^position = Vector3\(([^)]*)\)',block,re.M)
    if transform:
        values=[float(v) for v in transform[1].split(',')];x,z=values[9],values[11];sx,sz=values[0],values[8]
    else:
        values=[float(v) for v in position[1].split(',')] if position else [0,0,0];x,z=values[0],values[2];sx=sz=1
    rect=re.search(r'^collision_footprint = Rect2\(([^)]*)\)',block,re.M)
    identity=re.search(r'^gameplay_id = "([^"]+)"',block,re.M)
    bounds=None
    if rect:
        rx,rz,w,h=[float(v) for v in rect[1].split(',')]
        bounds=[x+rx*sx-.1875,z+rz*sz-.1875,w*sx+.375,h*sz+.375]
    records.append({'node':name[1],'kind':kind[1],'id':identity[1] if identity else '', 'x':x,'z':z,'bounds':bounds})
proof=[]
for bench in [r for r in records if r['kind']=='bench']:
    x,z=bench['x'],bench['z']
    seat=(x,z+.5)
    corridor=(x-1.15,z+.25,2.3,2.25)
    blocking=[];seat_blocked=[]
    for other in records:
        if other is bench or not other['bounds']: continue
        bx,bz,w,h=other['bounds']
        if bx<=seat[0]<bx+w and bz<=seat[1]<bz+h: seat_blocked.append(other['node'])
        ax,az,aw,ah=corridor
        if max(ax,bx)<min(ax+aw,bx+w) and max(az,bz)<min(az+ah,bz+h): blocking.append(other['node'])
    proof.append({'bench':bench['id'],'seat':list(seat),'frontClearance':list(corridor),'seatBlockedBy':seat_blocked,'corridorBlockedBy':blocking})
report={'changes':changed,'staticBenchClearance':proof,'gameplayExecuted':False,'source':'saved plaza.tscn; unrotated X/Z footprints; world.gd 3 logical-unit collision margin'}
(REGION/'bench-clearance-fix.json').write_text(json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
print(json.dumps({'moved':len(changed),'benches':[{'id':p['bench'],'seatClear':not p['seatBlockedBy'],'frontClear':not p['corridorBlockedBy']} for p in proof]}))
if any(p['seatBlockedBy'] or p['corridorBlockedBy'] for p in proof): raise RuntimeError('A saved bench approach remains blocked; inspect bench-clearance-fix.json')