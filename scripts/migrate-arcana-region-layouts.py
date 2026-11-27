"""One-time geometry registration; never run during normal builds.
Existing schema=1 scenes are left untouched, including manual edits.
Artwork and node transforms are preserved. Geometry is copied from legacy rules.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent / "godot-arcana"

def vector(x, y):
    return f"Vector2({x:g}, {y:g})"

def rects(values):
    return "[" + ", ".join("Rect2(" + ", ".join(f"{v:g}" for v in box) + ")" for box in values) + "]"

def migrate(name, furniture, boundaries, entities, markers):
    path = ROOT / "scenes/native_2d" / (name + ".tscn")
    text = path.read_text(encoding="utf-8-sig")
    if "metadata/layout_schema = 1" in text:
        print("Preserved authored layout:", name)
        return
    blocks = re.split(r"(?=\[node )", text)
    root = next(i for i,b in enumerate(blocks) if b.startswith("[node "))
    blocks[root] = blocks[root].rstrip() + "\nmetadata/layout_schema = 1\n\n"
    found = set()
    for index in range(root + 1, len(blocks)):
        block = blocks[index]
        match = re.match(r'\[node name="([^"]+)"', block)
        if not match: continue
        node_name = match[1]
        if node_name not in furniture and node_name not in entities: continue
        position = re.search(r'^position = Vector2\(([^,]+), ([^)]+)\)', block, re.M)
        x,y = map(float, position.groups()) if position else (0.,0.)
        additions=[]
        if node_name in furniture:
            found.add(node_name)
            additions.append("metadata/layout_collisions = " + rects([(a*4-x,b*4-y,w*4,h*4) for a,b,w,h in furniture[node_name]]))
        if node_name in entities:
            additions.append("metadata/layout_entity = " + entities[node_name](x,y))
        blocks[index] = block.rstrip() + "\n" + "\n".join(additions) + "\n\n"
    missing = set(furniture) - found
    if missing: raise RuntimeError(f"Missing nodes in {name}: {sorted(missing)}")
    suffix='[node name="LayoutBounds" type="Node2D" parent="."]\nmetadata/layout_collisions = '+rects([[v*4 for v in b] for b in boundaries])+"\n\n"
    for marker,(x,y) in markers.items():
        suffix += f'[node name="{marker}" type="Marker2D" parent="."]\nposition = {vector(x*4,y*4)}\nmetadata/layout_marker = "{marker}"\n\n'
    path.write_text("".join(blocks)+suffix, encoding="utf-8", newline="\n")
    print("Registered authored layout:", name)

def entity(id, title, kind, point, **extra):
    def render(x,y):
        fields = [f'"id": "{id}"',f'"name": "{title}"',f'"kind": "{kind}"',f'"pos": {vector(point[0]*4-x, point[1]*4-y)}']
        for k,v in extra.items():
            if isinstance(v,tuple): value=vector(v[0]*4-x,v[1]*4-y)
            elif isinstance(v,str): value='"'+v+'"'
            else: value=str(v)
            fields.append('"'+k+'": '+value)
        return "{"+", ".join(fields)+"}"
    return render

def run():
    inn = {
     'Inn_corner_sofa18':[(68,119,92,39),(68,157,25,16)], 'Inn_tea_table19':[(101,195,42,21)],
     'Inn_armchair20':[(161,181,24,22)], 'Inn_fireplace9':[(64,55,54,28)],
     'Inn_bookcase10':[(139,58,23,25)], 'Inn_storage_bench11':[(165,75,54,18)],
     'Inn_counter12':[(240,101,55,31)], 'Inn_stairs15':[(299,44,36,81)],
     'Inn_lamp_table21':[(58,184,18,18)], '_Node3D_3922':[(157,127,18,18)],
     '_Node3D_4223':[(251,219,58,17)], 'Inn_luggage24':[(307,152,26,19)],
     '_Node3D_4725':[(296,188,18,18)], 'Inn_plant26':[(46,208,15,14)], '_Node3D_5227':[(310,237,15,14)],
     'Inn_front_wall33':[(48,256,120,12)], '_Node3D_7234':[(216,256,120,12)]}
    inn_entities={
     'InnQuestBoard14':entity('inn_quest_board','퀘스트판 살펴보기','quest_board',(224,83.2),interaction_radius=26.0),
     'Inn_counter12':entity('innkeeper','여관주인과 대화하기','innkeeper',(267,148)),
     'Inn_corner_sofa18':entity('inn_sofa','소파에서 쉬기','inn_sofa',(112,164),seat_visual=(112,158),seat_room='arcana_inn'),
     'EntranceThreshold35':entity('exit','밖으로 나가기','exit',(192,248))}
    migrate('inn_lobby',inn,[(48,0,288,64),(0,0,48,328),(336,0,48,328),(0,264,384,64)],inn_entities,{'Arrival':(192,200)})
    base=[(0,0,48,344),(336,0,48,344),(48,0,288,64),(48,310,288,34),(48,300,110,10),(226,300,110,10)]
    partition=[(46,64,4,176),(150,64,4,176),(48,238,32,4),(120,238,32,4),(334,64,4,200),(238,64,4,56),(238,168,4,32),(238,248,4,16),(240,182,96,4),(240,262,96,4)]
    first_names=['Academy_stairs_up43','Academy_bookcase44','Academy_desk45','Academy_blackboard46','_Node3D_10047','_Node3D_10348','Academy_orrery49','Academy_reading_table50','Academy_bench55','_Node3D_12256','Academy_book_trolley51','_Node3D_11252','Academy_floor_lamp53','_Node3D_11754','Academy_plant57','_Node3D_12758']
    first_boxes=[(156,64,72,33),(56,77,54,20),(72,117,36,17),(252,86,64,20),(266,137,38,17),(266,205,38,17),(172,166,40,22),(74,196,48,20),(66,273,50,16),(268,273,50,16),(55,165,18,12),(312,191,18,14),(132,153,8,8),(315,151,8,8),(55,215,14,14),(0,0,0,0)]
    # The last plant has no legacy obstacle; do not introduce a new one.
    furniture={n:[b] for n,b in zip(first_names,first_boxes) if b[2]>0}
    interactions={'Academy_stairs_up43':entity('academy_stairs','2층으로 올라가기','academy_stairs',(192,112))}
    room_points=[('courtyard','학교 앞뜰',(192,276)),('hall','중앙 회랑',(192,222)),('library','도서관',(88,151)),('classroom','기초 강의실',(284,171)),('practice','수정 실습실',(284,239))]
    # Independent room markers retain the original navigation targets.
    add_markers=[]
    for rid,title,point in room_points:
        add_markers.append((rid,entity(rid,title,'academy_room',point)(0,0)))
    migrate('academy_first_floor',furniture,base+partition,interactions,{'Arrival':(192,260),'StairArrival':(192,152)})
    append_entities('academy_first_floor',add_markers+[('Exit',entity('exit','밖으로 나가기','exit',(192,304))(0,0))])
    second_names=['Academy_office_door137','Academy_desk138','Academy_telescope139','Academy_bench141','Academy_plant142','_Node3D_368143','Academy_stairs_down144','Academy_reading_table145','Academy_book_trolley146','Academy_floor_lamp147','_Node3D_379148']
    second_boxes=[(70,67,52,24),(74,133,44,19),(258,112,46,24),(70,220,52,17),(52,202,16,22),(125,202,16,22),(163,244,58,23),(261,231,48,22),(124,244,18,14),(55,252,8,8),(316,232,8,8)]
    migrate('academy_second_floor',{n:[b] for n,b in zip(second_names,second_boxes)},base+[(48,300,288,10)],{'Academy_stairs_down144':entity('academy_stairs','1층으로 내려가기','academy_stairs',(192,230))},{'Arrival':(192,194),'StairArrival':(192,194)})
    append_entities('academy_second_floor',[(rid,entity(rid,title,'academy_room',point)(0,0)) for rid,title,point in [('headmaster','교장실',(96,170)),('garden','별빛 정원',(96,258)),('observatory','천문 관측탑',(280,166))]])
    migrate('restaurant',{'RestaurantSurfaces':[(110,90,166,35)]},[],{'RestaurantSurfaces':entity('counter','시설 이용하기','scene',(192,148))},{'Arrival':(192,200)})
    append_entities('restaurant',[('Exit',entity('exit','밖으로 나가기','exit',(192,308))(0,0))])

def append_entities(name, values):
    path=ROOT/'scenes/native_2d'/(name+'.tscn')
    text=path.read_text(encoding='utf-8')
    for node,value in values:
        if f'[node name="Location_{node}"' not in text:
            text+=f'[node name="Location_{node}" type="Marker2D" parent="."]\nmetadata/layout_entity = {value}\n\n'
    path.write_text(text,encoding='utf-8',newline='\n')

if __name__ == '__main__': run()
