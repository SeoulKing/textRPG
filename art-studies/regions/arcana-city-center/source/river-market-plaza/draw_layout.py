"""Draw the city-center circulation plan from the saved plaza scene and terrain."""
from functools import cache
import json
import math
import os
from pathlib import Path
import re

from PIL import Image, ImageDraw, ImageFont


HERE = Path(__file__).resolve().parent
ROOT = next(p for p in HERE.parents if (p / "godot-arcana/project.godot").is_file())
GODOT = ROOT / "godot-arcana"
OUT = HERE.parents[1] / "render/river-market/layout.png"
PAPER, INK, MUTED, RULE = "#FAF6EB", "#243D40", "#4E6663", "#C9C7B6"
GROUND, MARKET, HOUSING = "#ECEADB", "#ECD1A0", "#B9CABB"
WATER, BANK, BRIDGE = "#96C8C5", "#4E9494", "#D7BC89"
MAIN, LOOP = "#176B78", "#98552C"
FONT_DIR = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
FONTS = [FONT_DIR / "malgun.ttf", FONT_DIR / "malgunbd.ttf"]
if not all(p.exists() for p in FONTS):
    FONTS = [Path("/usr/share/fonts/opentype/noto") / f"NotoSansCJK-{weight}.ttc"
             for weight in ("Regular", "Bold")]


@cache
def font(size, bold=False):
    return ImageFont.truetype(str(FONTS[bold]), size)


def numbers(value):
    return [float(n) for n in value.split("(", 1)[1].split(")", 1)[0].split(",")]


def read_scene():
    """Read the saved footprints with their node positions and horizontal scales."""
    text = (GODOT / "scenes/plaza/terraced_market_candidate.tscn").read_text(encoding="utf-8")
    nodes, resources = {}, {}
    for match in re.finditer(r"^\[(node|sub_resource) ([^\n]+)\]\n([^\[]*)", text, re.M):
        kind, attrs, payload = match.groups()
        fields = dict(re.findall(r'(\w+)="([^"]*)"', attrs))
        values = dict(re.findall(r"^(\w+) = (.+)$", payload, re.M))
        if kind == "sub_resource":
            resources[fields["id"]] = values
        elif "parent" in fields:
            parent = fields["parent"]
            nodes[(parent + "/" if parent != "." else "") + fields["name"]] = values

    def transform(name):
        node = nodes[name]
        if "transform" in node:
            m = numbers(node["transform"])
            return m[9], m[11], m[0], m[2], m[6], m[8]
        x, _, z = numbers(node.get("position", "Vector3(0,0,0)"))
        sx, _, sz = numbers(node.get("scale", "Vector3(1,1,1)"))
        return x, z, sx, 0, 0, sz

    landmarks = {}
    for name in ("Shop", "Inn", "Restaurant", "Academy", "PlayerHome"):
        path = name + "/Collision/Footprint"
        resource = re.search(r'"([^"]+)"', nodes[path]["shape"])[1]
        width, _, depth = numbers(resources[resource]["size"])
        points = [(x * width / 2, z * depth / 2) for x, z in ((-1,-1),(1,-1),(1,1),(-1,1))]
        for part in (path, name + "/Collision", name):
            tx, tz, xx, xz, zx, zz = transform(part)
            points = [(tx + x * xx + z * xz, tz + x * zx + z * zz) for x, z in points]
        landmarks[name] = points
    home = transform("PlayerHome")
    door = transform("PlayerHome/InteractionPoint")
    threshold = (home[0] + door[0] * home[2] + door[1] * home[4],
                 home[1] + door[0] * home[3] + door[1] * home[5])
    paths = []
    for match in re.finditer(r'"centerline": (PackedVector2Array\([^)]*\))', text):
        coords = numbers(match[1])
        paths.append(list(zip(coords[::2], coords[1::2])))
    home_lane = min(paths, key=lambda path: math.dist(path[-1], threshold))
    return landmarks, home_lane, transform("Fountain")[:2], float(resources["CylinderShape3D_fountain"]["radius"])


def main():
    data = json.loads((GODOT / "data/plaza-terraces.json").read_text(encoding="utf-8-sig"))
    buildings, home_lane, fountain, fountain_radius = read_scene()
    west, north, east, south = data["bounds"]
    image = Image.new("RGB", (1732, 1300), PAPER)
    draw = ImageDraw.Draw(image)
    scale, left, top = 16.5, 52, 157

    def pt(p):
        return (round(left + (p[0] - west) * scale), round(top + (p[1] - north) * scale))

    def label(x, y, value, size=22, fill=INK, bold=False, anchor="lt", halo=0):
        draw.text((x, y), value, font=font(size, bold), fill=fill, anchor=anchor,
                  stroke_width=halo, stroke_fill=PAPER)

    def box(r, fill, outline=None, width=1):
        draw.rectangle([pt(r[:2]), pt(r[2:])], fill=fill, outline=outline, width=width)

    def line(points, color, width):
        draw.line([pt(p) for p in points], fill=color, width=width, joint="curve")

    def track(points, color, dashed=False):
        line(points, PAPER, 8)
        if not dashed:
            line(points, color, 4)
            return
        distance = 0
        for start, end in zip(map(pt, points), list(map(pt, points))[1:]):
            delta = (end[0] - start[0], end[1] - start[1])
            length = math.hypot(*delta)
            for offset in range(math.ceil(length)):
                if (distance + offset) % 16 >= 10:
                    continue
                x, y = (round(start[i] + delta[i] * offset / length) for i in (0, 1))
                draw.ellipse((x-2, y-2, x+2, y+2), fill=color)
            distance += length

    def dot(p, color, radius=5):
        x, y = pt(p)
        draw.ellipse((x-radius, y-radius, x+radius, y+radius), fill=color, outline=PAPER, width=2)

    def map_text(p, text, size=19, **kwargs):
        label(*pt(p), text, size, **kwargs)

    def rule(y):
        draw.line((1163, y, 1678, y), fill=RULE, width=2)

    label(52, 40, "아르카나  /  도시 설계", 21, MUTED, True)
    label(49, 77, "강과 시장이 만나는 분수광장", 48, bold=True)
    label(1678, 109, "배치 평면도   ·   북쪽이 위", 23, MUTED, anchor="ra")
    draw.line((52, 137, 1678, 137), fill=INK, width=2)
    box(data["bounds"], GROUND)
    for x in range(west + 4, east, 4):
        line([(x, north), (x, south)], "#DEDCCE", 1)
    for z in range(north + 4, south, 4):
        line([(west, z), (east, z)], "#DEDCCE", 1)
    terraces = {s["id"]: s for s in data["terraces"]}
    for key, color in (("residential_terrace", HOUSING), ("market_terrace", MARKET)):
        box(terraces[key]["rect"], color, "#858C78", 3)
    for stair in data["stairs"]:
        x0, z0, x1, z1 = stair["rect"]
        box(stair["rect"], "#F5E4BF", "#877958", 2)
        for k in range(1, 7):
            z = z0 + (z1 - z0) * k / 7
            line([(x0, z), (x1, z)], "#A39875", 2)

    spans = data["river"]["spans"]
    for x0, x1, zn, zs in spans:
        box([x0, zn, x1, zs], WATER)
    for bank in (2, 3):
        points = [p for a in spans for p in [(a[0], a[bank]), (a[1], a[bank])]]
        line(points, BANK, 3)
    x0, z0, x1, z1 = data["bridge"]["rect"]
    box([x0,z0,x1,z1], BRIDGE, "#8B7958", 2)
    for k in range(1, 14):
        z = z0 + (z1 - z0) * k / 14
        line([(x0,z), (x1,z)], "#AE9974", 1)

    for house in data["buildings"]:
        r = house["rect"]
        box(r, house["color"], "#455454", 2)
        z = (r[1] + r[3]) / 2
        line([(r[0]+0.25,z), (r[2]-0.25,z)], "#E9D9BA", 2)
    for stall in data["stalls"]:
        r = stall["rect"]
        box(r, stall["color"], INK, 2)
        for k in (2, 5):
            x = r[0] + (r[2]-r[0]) * k / 7
            line([(x,r[1]+0.12),(x,r[3]-0.12)], PAPER, 4)

    line(home_lane, "#CCC1AC", round(2 * scale))
    names = {"Shop":"상점", "Inn":"여관", "PlayerHome":"내 집", "Restaurant":"식당", "Academy":"아카데미"}
    for name, corners in buildings.items():
        draw.polygon([pt(p) for p in corners], fill="#D9CABA", outline="#786F60", width=2)
        center = tuple(sum(p[i] for p in corners) / len(corners) for i in (0,1))
        map_text(center, names[name], 21, bold=True, anchor="mm")
    px, py = pt(fountain)
    radius = round(fountain_radius * scale)
    draw.ellipse((px-radius-5,py-radius-5,px+radius+5,py+radius+5), fill="#DED3AD", outline="#A79571", width=2)
    draw.ellipse((px-radius,py-radius,px+radius,py+radius), fill="#A8C9C4", outline=BANK, width=3)
    map_text(fountain, "분수", 18, bold=True, anchor="mm")

    rest = next(o["rect"] for o in data["obstacles"] if o["id"] == "inn_shade_bench")
    tree = next(o["rect"] for o in data["obstacles"] if o["id"] == "shade_tree")
    box(rest, "#886447", "#5C5345", 2)
    tx, ty = pt(((tree[0]+tree[2])/2, (tree[1]+tree[3])/2))
    draw.ellipse((tx-13,ty-13,tx+13,ty+13), fill="#88A183", outline="#516E57", width=2)
    map_text((rest[0]-0.1, rest[1]+2.1), "여관 쉼터", 17, anchor="mt", halo=2)

    stairs = {s["id"]: s["rect"] for s in data["stairs"]}
    def axis(key):
        r = stairs[key]
        return (r[0]+r[2])/2
    wx, ex = axis("west_lower"), axis("east_lower")
    bridge_x = (x0+x1) / 2
    fx, fz = fountain
    road = [(bridge_x, south-0.6), (bridge_x, fz+3.45), (fx+2.7,fz+2.7), (fx+3.45,4.7),
            (14.2,4.7),(18.5,1.8),(24,-5),(24,-15.3)]
    tour = [(fx-3.45,fz),(-11.5,4.4),(-12.2,0.4),(-12.2,-6.9),(wx,-10.1),
            (wx,stairs["west_lower"][3]), (axis("west_upper"),stairs["west_upper"][1]-1.5),
            (axis("east_upper"),stairs["east_upper"][1]-1.5), (ex,stairs["east_lower"][3]+0.25),
            (11.3,-14.25),(13,-12.2),(16,-7),(18.5,1.8)]
    track(road, MAIN)
    track(tour, LOOP, True)
    for p in (road[0],road[-1]): dot(p, MAIN, 7)
    for p in (tour[0],tour[-1]): dot(p, LOOP, 6)
    access = data["fishingAccess"]
    dot(access, MAIN, 8)
    map_text((access[0]-0.8, access[1]-0.6), "낚시 자리", 17, anchor="rs", halo=2)
    map_text((bridge_x+3.4, z1+0.3), "남쪽 다리", 17, halo=2)
    map_text((27,21), "남쪽 강", 23, fill="#256264", bold=True, anchor="mm")
    map_text((-7,-28), "주거 골목", 18, bold=True, anchor="mm")
    map_text((-7,-19.1), "시장 테라스", 18, bold=True, anchor="mm")
    box(data["bounds"], None, "#839087", 2)
    compass = pt((37, -31))
    label(*compass, "북", 17, INK, True, "mm")
    cx, cy = compass
    draw.polygon([(cx, cy+13), (cx-6,cy+29),(cx+6,cy+29)],fill=INK)

    label(1163, 164, "보행 동선", 30, bold=True)
    for y, color, title, text, dashed in [
        (230, MAIN, "남쪽 다리와 학교길", ["남쪽 강을 건너 북극성 분수를 돌아", "아카데미 정문으로 이어집니다."], False),
        (380, LOOP, "시장과 주거 골목", ["분수 서쪽에서 계단을 올라 노점과", "주택 앞을 지나 동쪽 학교길로 돌아옵니다."], True),
    ]:
        for x in range(1163,1229,16):
            draw.line((x,y+9,min(1227,x+(10 if dashed else 16)),y+9),fill=color,width=5)
        label(1247,y-6,title,25,color,True)
        for i, row in enumerate(text):
            label(1163,y+42+i*32,row,22,MUTED)
    rule(515)
    label(1163, 546, "광장의 세 높이", 30, bold=True)
    for y, key, color, title, sub in [
        (609,"residential_terrace",HOUSING,"주거 골목",f"낮은 주택 {len(data['buildings'])}채"),
        (704,"market_terrace",MARKET,"시장 테라스","물약 · 약초 · 천문 기구 노점"),
        (799,None,GROUND,"분수광장","여관 · 식당 · 상점 · 내 집 · 아카데미"),
    ]:
        height = terraces[key]["height"] if key else 0
        draw.rectangle((1163,y,1255,y+39), fill=color, outline=RULE, width=1)
        label(1209,y+19,f"{height:+.1f}" if height else "±0.0",20,INK,True,"mm")
        label(1274,y,title,23,bold=True)
        label(1274,y+38,sub,19,MUTED)
    rule(901)
    label(1163, 932, "강둑과 쉼터", 30, bold=True)
    label(1163, 995, "여관 앞 옛 연못 자리에 나무와 벤치를 두고,", 21, MUTED)
    label(1163, 1033, "낚시 자리는 남쪽 다리 서쪽 강둑으로 옮겼습니다.", 21, MUTED)
    label(1163, 1104, "계단 네 곳", 22, bold=True)
    label(1163, 1143, "시장 양끝에서 지상과 주거층을 오갑니다.", 21, MUTED)
    rule(1212)
    label(52, 1234, f"{east-west:.0f} × {south-north:.0f}칸  ·  한 격자 4칸", 20, MUTED)
    draw.line((865,1248,997,1248), fill=INK, width=2)
    for x in (865,931,997): draw.line((x,1243,x,1253), fill=INK,width=2)
    label(1010,1238,"8칸",18,MUTED)
    label(1678,1234,"아르카나  /  분수광장",19,MUTED,anchor="rt")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUT)
    print(OUT)


if __name__ == "__main__":
    main()
