from pathlib import Path
from PIL import Image
from collections import Counter
import json,sys
variant=sys.argv[1] if len(sys.argv)>1 else 'original'
root=Path('godot-arcana/art/source/heroine');qa=Path('godot-arcana/art/reference/natural-walk');atlas=Image.open('godot-arcana/art/export/reference/hero-'+variant+'.png').convert('RGBA');data=json.loads((root/'workshop.json').read_text());dirs=['s','se','e','ne','n','nw','w','sw'];changes=[]
surfaces={name:Image.open('godot-arcana/art/export/reference/hero-'+name+'.png').convert('RGBA') for name in ['body','dress','blouse','skirt','shawl','hair']}
for i in range(352):
 bx=i%16*96;by=i//16*136;im=atlas.crop((bx,by,bx+96,by+136));seen=set()
 for x0,y0,x1,y1 in [(36,38,61,50),(36,69,62,82)]:
  for y in range(y0,y1):
   for x in range(x0,x1):
    if im.getpixel((x,y))[3] or (x,y) in seen:continue
    todo=[(x,y)];seen.add((x,y));component=[];outside=False
    while todo:
     u,v=todo.pop();component.append((u,v))
     if len(component)>32:outside=True;break
     for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
      p=(u+dx,v+dy)
      if not (x0<=p[0]<x1 and y0<=p[1]<y1):outside=True;continue
      if p not in seen and not im.getpixel(p)[3]:seen.add(p);todo.append(p)
    if outside or len(component)>4:continue
    neighbors=Counter(im.getpixel((u+dx,v+dy)) for u,v in component for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)] if im.getpixel((u+dx,v+dy))[3])
    if not neighbors:continue
    color=neighbors.most_common(1)[0][0];hexcolor='#%02x%02x%02x'%color[:3]
    if i<288:
     d=i//36;f=i%36;clip='idle' if f<4 else 'walk' if f<28 else 'stop_left' if f<32 else 'stop_right';cf=f if f<4 else f-4 if f<28 else f%4
    else:d=(i-288)//8;f=(i-288)%8;clip='turn_left' if f<4 else 'turn_right';cf=f%4
    owners=Counter()
    for u,v in component:
     for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
      if im.getpixel((u+dx,v+dy))!=color:continue
      for layer in (['hair','shawl','blouse','skirt','body'] if variant=='alternate' else ['hair','dress','body'] if variant=='no-shawl' else ['hair','shawl','dress','body']):
       if surfaces[layer].getpixel((bx+u+dx,by+v+dy))==color:owners[layer]+=1;break
    layer=owners.most_common(1)[0][0] if owners else 'body'
    key=f'{layer}/{dirs[d]}/{clip}/{cf}'
    for u,v in component:
     data['patches'].setdefault(key,{}).setdefault(f'{u},{v}',hexcolor);changes.append({'frame':i,'key':key,'pixel':[u,v],'color':hexcolor})
(root/'workshop.json').write_text(json.dumps(data,indent=2)+'\n',encoding='utf8')
file=root/'skeletal/frame-corrections.json';previous=json.loads(file.read_text()).get('edits',[]) if file.exists() else []
merged={(e['key'],tuple(e['pixel'])):e for e in previous+changes}
file.write_text(json.dumps({'regions':['neck/collar','waist'],'edits':list(merged.values())},indent=2)+'\n',encoding='utf8')
print('Targeted collar/waist pixel corrections:',len(changes),'examples:',changes[:4])
