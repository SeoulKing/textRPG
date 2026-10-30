"""Author the approved city once from a preserved scene, including collision nodes."""
from pathlib import Path
import re, json, shutil
ROOT = Path(__file__).resolve().parents[1]
REGION = ROOT / 'art-studies/regions/arcana-city-center'
BASE = REGION / 'source/baseline'
BASE.mkdir(parents=True, exist_ok=True)
scene_path = ROOT / 'godot-arcana/scenes/plaza.tscn'
for rel in ['scenes/plaza.tscn', 'scenes/ground/city_ground.tscn', 'art/export/combat-layout.json']:
    source = ROOT / 'godot-arcana' / rel
    target = BASE / Path(rel).name
    if not target.exists():
        shutil.copy2(source, target)
text = (BASE / 'plaza.tscn').read_text(encoding='utf-8')
blocks = re.split(r'(?=^\[node )', text, flags=re.M)

def field(block, key):
    found = re.search(r'^' + re.escape(key) + r' = "([^"]*)"', block, re.M)
    return found.group(1) if found else ''

def position(block):
    found = re.search(r'^transform = Transform3D\(([^)]*)\)', block, re.M)
    if found:
        return [float(v.strip()) for v in found.group(1).split(',')][-3:]
    found = re.search(r'^position = Vector3\(([^)]*)\)', block, re.M)
    return [float(v.strip()) for v in found.group(1).split(',')] if found else [0,0,0]

def move(block, x, z):
    found = re.search(r'^transform = Transform3D\(([^)]*)\)', block, re.M)
    if found:
        parts = found.group(1).split(',')
        parts[-3:] = [str(x), ' 0', ' ' + str(z)]
        return block[:found.start()] + 'transform = Transform3D(' + ','.join(parts) + ')' + block[found.end():]
    return re.sub(r'^position = Vector3\([^)]*\)', f'position = Vector3({x}, 0, {z})', block, flags=re.M)

moves = {
 'arcana_shop': (18,23), 'arcana_inn': (18,37), 'arcana_restaurant': (35.5,14.5),
 'arcana_academy': (54,27.5), 'arcana_return_portal': (26,16),
 'park_bench_01': (28,31.5), 'park_bench_02': (43,33), 'park_bench_03': (62,35.5),
 'park_bench_04': (30,20), 'park_bench_05': (25,39),
}
# Broad connected roads. +Z is south; the original fountain and gate axes stay fixed.
roads = [[3,11,66,35], [12,9,20,5], [25,17,20,23], [32,13,7,13], [3,21,25,6], [3,37,28,5],
         [40,26,29,10], [3,43,66,3], [33,33,6,22], [9.25,8,2.5,36], [3,11,29,3]]
gardens = [[42,29,8,4], [59,29,8,4], [26,22,3,2], [25.5,33.5,4,2.5], [42,34.5,3,2]]
root = blocks[1]
root = re.sub(r'^plaza_radii = .*', 'plaza_radii = Vector2(11, 10)', root, flags=re.M)
root = re.sub(r'^paved_areas = .*', 'paved_areas = Array[Rect2]([' + ', '.join('Rect2(' + ', '.join(map(str,r)) + ')' for r in roads) + '])', root, flags=re.M)
root = root.rstrip() + "\ngarden_areas = Array[Rect2]([Rect2(42, 29, 8, 4), Rect2(59, 29, 8, 4), Rect2(26, 22, 3, 2), Rect2(25.5, 33.5, 4, 2.5), Rect2(42, 34.5, 3, 2)])\n\n"
blocks[1] = root
vegetation = {'oak','birch','spruce','shrub','flowers','flowerbed','flowerpot','grass-clump','barrels','crate','basket','lamp-post','sign','lantern','handcart','canopy','pennant'}
removed, kept, retained_outer = set(), [], 0
for block in blocks:
    node = re.match(r'\[node name="([^"]*)"[^\n]*', block)
    if node:
        parent = field(node.group(0), 'parent')
        if any(parent == n or parent.startswith(n + '/') for n in removed):
            continue
        kind, identity = field(block, 'model_kind'), field(block, 'gameplay_id')
        x, y, z = position(block)
        if kind in vegetation and not identity and 1 < x < 71 and z < 46:
            removed.add(node.group(1))
            continue
        if kind in {'oak','birch','spruce'}:
            retained_outer += 1
        if identity in moves:
            block = move(block, *moves[identity])
    kept.append(block)
text = ''.join(kept).rstrip() + '\n\n'
assets = json.loads((REGION / 'manifest.json').read_text(encoding='utf-8'))['assets']
placements, generated, counters = [], [], {}
groups = ['Housing','Market','StreetFurniture','Gardens']
generated.append('[node name="CityDistrict" type="Node3D" parent="."]\nmetadata/design = "approved arcana-city-center/concept-v1"\n')
for group in groups:
    generated.append(f'[node name="{group}" type="Node3D" parent="CityDistrict"]\n')

def add(kind, x, z, group='StreetFurniture', scale=1, collision=None):
    counters[kind] = counters.get(kind,0) + 1
    name = kind.replace('city-','').replace('-','_') + '_' + str(counters[kind]).zfill(2)
    if collision is None:
        collision = assets[kind]['collision'] if kind in assets else {
            'oak': [-.4375,-.75,.875,.75], 'birch': [-.3,-.55,.6,.55], 'spruce': [-.4,-.6,.8,.6],
            'flowerpot': [-.24,-.35,.48,.35], 'flowerbed': [-.875,-.5,1.75,.5],
            'crate': [-.45,-.6,.9,.6], 'barrels': [-.55,-.7,1.1,.7], 'basket': [-.3,-.4,.6,.4]
        }.get(kind)
    block = [f'[node name="{name}" type="Node3D" parent="CityDistrict/{group}"]',
       f'transform = Transform3D({scale}, 0, 0, 0, {scale}, 0, 0, 0, {scale}, {x}, 0, {z})',
       'script = ExtResource("2")', f'model_kind = "{kind}"']
    if collision:
        block.append('collision_footprint = Rect2(' + ', '.join(map(str,collision)) + ')')
    generated.append('\n'.join(block) + '\n')
    placements.append({'node': 'CityDistrict/' + group + '/' + name, 'kind': kind, 'position':[x,0,z], 'scale':scale, 'collision':collision})

# Supporting residences make blocks around the four existing landmarks.
for kind,x,z,s in [
 ('city-townhouse',5.5,14,1), ('city-workshops',18,10,1), ('city-townhouse',27,9,.85),
 ('city-townhouse',5.5,29,1), ('city-bookshop',5.5,43,1),
 ('city-townhouse',46,42.3,1), ('city-workshops',56,42.3,1), ('city-bookshop',66,42.3,1)]:
    add(kind,x,z,'Housing',s)
# Stalls and storage sit beside the shop, leaving the main square open.
for x,z in [(18,27.4),(23,27.4)]: add('city-market',x,z,'Market')
for kind,x,z in [('crate',24.5,24.2),('crate',25.4,25),('barrels',12,25.7),('basket',15,28.3),('basket',21.3,28.4),('barrels',23,38),('crate',24.2,38.4)]:
    add(kind,x,z,'Market')
for x,z in [(29.3,17.8),(41.5,17.8),(32.5,18.2),(41.5,21)]: add('city-cafe',x,z,'Market')
# Repeated lamps frame the streets; no post is put in the gate opening.
for x,z in [(26,24),(31,20.7),(43.5,22.5),(28,28.5),(44,29.5),(31,38.3),(41,38.3),(31,44.3),(41,44.3),(10.8,16),(10.8,33),(50.5,36.5),(57.5,36.5),(67.5,37),(31,53),(41,53)]:
    add('lamp-post',x,z,scale=1.65)
for x,z in [(12.5,23.2),(23.5,23.2),(12.4,37.2),(23.6,37.2),(30.5,14.6),(40.5,14.6),(50.5,28.3),(57.5,28.3),(43,42.5),(49,42.5),(52,42.5),(60,42.5),(63.5,42.5),(68.5,42.5)]:
    add('flowerpot',x,z,'Gardens')
for x,z in [(43.5,30),(46.5,34),(49.5,34),(58.5,34),(61.5,34),(64.5,34),(27.2,24.3),(27.2,36)]:
    add('city-hedge',x,z,'Gardens',.9)
for x,z in [(31,36.5),(41,36.5),(31,41),(41,41),(25.8,31.1),(45.5,32.7),(30,18.9),(27.5,38.8),(64,35.4),(31,42),(41,42)]:
    add('flowerbed',x,z,'Gardens')
for kind,x,z,s in [
 ('oak',27.4,23.3,.75),('birch',27,35,.85),('oak',47,31.8,.7),('birch',62.5,32.7,.9),
 ('oak',44.2,31.2,.75),('birch',48.4,31.2,.8),('oak',64.5,31.5,.7),
 ('oak',3,8,.9),('birch',9,8,.85),('oak',23,5,1),('birch',30,5,.9),
 ('oak',3,35,.8),('birch',10,39.7,.8),('oak',68.8,18,.85),('birch',70,37,.8),
 ('oak',28.5,44.5,.8),('birch',43.3,45,.8),('oak',2,45,.8),('oak',69,45,.7)]:
    add(kind,x,z,'Gardens',s)
for x,z in [(26.5,22.5),(28,23),(26.5,34.5),(28,35),(42.5,30),(46,32.5),(60,32.8),(66,31.2),(8.8,37),(28.4,44.7),(42.4,45)]:
    add('flowers',x,z,'Gardens',.9,collision=[])
text += '\n'.join(generated)
scene_path.write_text(text, encoding='utf-8')
plan = {'approvedConcept':'approved-concept.png', 'fountain': [36,28.925], 'plazaRadii':[11,10],
 'roads': roads, 'gardens': gardens, 'southStoneRoad':[33,46,6,9], 'southSoilRoad':[33,55,6,24],
 'landmarks':{k:list(v) for k,v in moves.items()}, 'placements':placements,
 'preservedExteriorTrees':retained_outer, 'retiredCityDecorations':len(removed)}
(REGION / 'layout.json').write_text(json.dumps(plan, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
# Register new kinds through the existing shared editor/game prop path.
art_path = ROOT / 'godot-arcana/scripts/illustrated_art.gd'
art = art_path.read_text(encoding='utf-8')
if 'const CITY = ' not in art:
    art = art.replace('const Prop = ', 'const CITY = preload("res://art/resources/city_center_assets.gd")\nconst Prop = ',1)
    art = art.replace('return kind == "fountain" or TEXTURES.has(kind)', 'return kind == "fountain" or TEXTURES.has(kind) or CITY.ITEMS.has(kind)')
    art = art.replace('node.asset = TEXTURES[kind]', 'node.asset = CITY.ITEMS[kind].texture if CITY.ITEMS.has(kind) else TEXTURES[kind]')
    art = art.replace('    if kind in ["shop","inn","restaurant"]:', '    if CITY.ITEMS.has(kind):\n        node.foot = CITY.ITEMS[kind].foot\n        node.shadow_size = CITY.ITEMS[kind].shadow\n        node.shadow_offset = Vector2(0,-.5)\n    if kind in ["shop","inn","restaurant"]:')
    art_path.write_text(art, encoding='utf-8')
placement_path = ROOT / 'godot-arcana/scripts/arcana_placement.gd'
placement = placement_path.read_text(encoding='utf-8')
if '"city-townhouse"' not in placement:
    placement = placement.replace('@export_enum("shop",', '@export_enum("city-townhouse", "city-workshops", "city-bookshop", "city-market", "city-cafe", "city-hedge", "shop",',1)
    placement_path.write_text(placement, encoding='utf-8')
brief_path = REGION / 'brief.md'
brief = brief_path.read_text(encoding='utf-8').replace('현재 단계: 시안 승인 대기','현재 단계: 배치·연결 중')
brief = brief.replace('승인 상태: 사용자 디자인 승인 대기. 구현 요청은 받았으나 이 새 디자인의 승인은 아직 받지 않았습니다.', '승인 상태: 사용자 “오 좋다 이렇게 만등러줘”로 concept-v1.png의 도시 디자인과 게임 제작·적용 승인. approved-concept.png에 보존했습니다.')
brief = brief.replace('다음 행동: 현재 건물과 분수를 참조한 전체 시안을 제시하고 디자인 승인을 받은 뒤 제작합니다.', '다음 행동: 독립 자산과 저장 장면 배치를 연결하고 실제 지면 원본 및 서버 충돌 데이터를 갱신합니다.')
brief_path.write_text(brief,encoding='utf-8')
print(json.dumps({'newPlacements':counters, 'retiredDecorations':len(removed), 'exteriorTreesKept':retained_outer},ensure_ascii=False))