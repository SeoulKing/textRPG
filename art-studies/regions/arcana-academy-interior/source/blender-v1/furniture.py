"""Editable furniture and small study props for the first-floor plan."""

import math
import random

import bpy


class Furniture:
    def __init__(self, api, collection, name, x, y, angle=0):
        self.api = api
        self.collection = collection
        self.name = name
        self.x = x
        self.y = y
        self.angle = angle
        self.cos = math.cos(math.radians(angle))
        self.sin = math.sin(math.radians(angle))
        self.root = bpy.data.objects.new(name, None)
        collection.objects.link(self.root)
        self.root.location = (x, -y, 0)
        self.root.empty_display_type = "PLAIN_AXES"
        self.root.empty_display_size = 0.16

    def xy(self, x, y):
        return self.x + x * self.cos - y * self.sin, self.y + x * self.sin + y * self.cos

    def part(self, obj):
        obj.parent = self.root
        obj.location -= self.root.location
        return obj

    def box(self, part, x, y, z, w, d, h, material, bevel=0.018, angle=0):
        x, y = self.xy(x, y)
        return self.part(self.api.box(
            f"{self.name} | {part}", x, y, z, w, d, h, material,
            bevel=bevel, rotation=self.angle + angle, collection=self.collection,
        ))

    def mesh(self, part, verts, faces, material):
        world = []
        for x, y, z in verts:
            px, py = self.xy(x, y)
            world.append((px-self.x, -(py-self.y), z))
        mesh = bpy.data.meshes.new(f"{self.name} | {part}")
        mesh.from_pydata(world, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(mesh.name, mesh)
        self.collection.objects.link(obj)
        obj.parent = self.root
        mesh.materials.append(material)
        return obj

    def strokes(self, part, paths, material, width=0.009):
        curves = bpy.data.curves.new(f"{self.name} | {part}", "CURVE")
        curves.dimensions = "3D"
        curves.bevel_depth = width
        curves.bevel_resolution = 1
        curves.use_fill_caps = True
        for path in paths:
            spline = curves.splines.new("POLY")
            spline.points.add(len(path)-1)
            for point, (x, y, z) in zip(spline.points, path):
                px, py = self.xy(x, y)
                point.co = (px-self.x, -(py-self.y), z, 1)
        obj = bpy.data.objects.new(curves.name, curves)
        self.collection.objects.link(obj)
        obj.parent = self.root
        curves.materials.append(material)

    def turned(self, part, x, y, z, profile, material, sides=10):
        verts = [
            (x+r*math.cos(2*math.pi*i/sides), y+r*math.sin(2*math.pi*i/sides), z+h)
            for r, h in profile for i in range(sides)
        ]
        faces = [tuple(range(sides))]
        for j in range(len(profile)-1):
            bottom = j*sides
            top = bottom+sides
            faces.extend(
                (bottom+(i+1)%sides, bottom+i, top+i, top+(i+1)%sides)
                for i in range(sides)
            )
        top = (len(profile)-1)*sides
        faces.append(tuple(reversed(range(top, top+sides))))
        self.mesh(part, verts, faces, material)


def textured_wood(api, name, color):
    material = api.mat(name, color, roughness=0.55)
    tree = material.node_tree
    shader = next(node for node in tree.nodes if node.type == "BSDF_PRINCIPLED")
    base = shader.inputs["Base Color"].default_value[:]
    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    stretch = tree.nodes.new("ShaderNodeVectorMath")
    stretch.operation = "MULTIPLY"
    stretch.inputs[1].default_value = (0.7, 5.0, 14.0)
    grain = tree.nodes.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 4.3
    grain.inputs["Detail"].default_value = 2.0
    tones = tree.nodes.new("ShaderNodeValToRGB")
    for stop, position, amount in zip(tones.color_ramp.elements, (0.23, 0.79), (0.76, 1.2)):
        stop.position = position
        stop.color = tuple(min(1, channel*amount) for channel in base[:3]) + (1,)
    tree.links.new(coordinates.outputs["Generated"], stretch.inputs[0])
    tree.links.new(stretch.outputs["Vector"], grain.inputs["Vector"])
    tree.links.new(grain.outputs["Fac"], tones.inputs["Fac"])
    tree.links.new(tones.outputs["Color"], shader.inputs["Base Color"])
    return material


def color_set(api):
    return {
        "wood": textured_wood(api, "Academy | rubbed walnut", "764728"),
        "surface": textured_wood(api, "Academy | honey oak", "A5673A"),
        "edge": textured_wood(api, "Academy | walnut edging", "583221"),
        "inset": textured_wood(api, "Academy | recessed walnut panel", "654029"),
        "brass": api.mat("Academy | burnished brass", "BA8B49", metallic=0.60, roughness=0.36),
        "paper": api.mat("Academy | parchment sheets", "EAD19C"),
        "paper_light": api.mat("Academy | turned pages", "F0DBAB"),
        "ink": api.mat("Academy | ink and dark fittings", "4D372D"),
        "board": api.mat("Academy | moss slate", "303D33"),
        "chalk": api.mat("Academy | ivory chalk", "E5D5AE"),
        "chalk_red": api.mat("Academy | terracotta chalk", "CB7753"),
        "chalk_gold": api.mat("Academy | ochre chalk", "DAB15D"),
        "chalk_green": api.mat("Academy | sage chalk", "7D9D8D"),
        "cloth": api.mat("Academy | sage upholstery", "667053"),
        "cloth_light": api.mat("Academy | brushed olive wool", "838263"),
        "cushion": api.mat("Academy | burnt-ochre cushion", "AB6848"),
        "ceramic": api.mat("Academy | amber vessel", "AE632F", roughness=0.27),
        "glass_green": api.mat("Academy | sage vessel", "71847A", roughness=0.31),
        "book": [
            api.mat(f"Academy | bookbinding {name}", color)
            for name, color in [
                ("umber", "855039"), ("buff", "AB8052"), ("lichen", "6E7048"),
                ("rust", "914D38"), ("teal", "546C68"), ("plum", "735264"),
                ("olive", "74724B"), ("slate blue", "556B81"),
            ]
        ],
    }


def open_book(prop, colors, x, y, z, width=0.53, depth=0.37):
    prop.box("open book covers", x, y, z, width, depth, 0.037, colors["book"][0], 0.012)
    for side in (-1, 1):
        page_x = lambda fraction: x + side*width*fraction
        rails = [(0.014, 0.065), (0.12, 0.081), (0.32, 0.081), (0.47, 0.057)]
        pts = [(page_x(a), y+dy, z+h) for a, h in rails for dy in (-depth*0.44, depth*0.43)]
        faces = [(i, i+1, i+3, i+2) for i in (0, 2, 4)]
        if side < 0:
            faces = [tuple(reversed(face)) for face in faces]
        prop.mesh("bowed page", pts, faces, colors["paper_light" if side < 0 else "paper"])
        prop.box("page block", x+side*width*0.24, y, z+0.035,
                 width*0.45, depth*0.88, 0.023, colors["paper"], 0.005)
        prop.strokes("handwritten lines", [
            [(page_x(0.12), y+row*depth/9, z+0.084),
             (page_x(0.33-(abs(row)%3)*0.043), y+row*depth/9, z+0.084)]
            for row in range(-3, 4)
        ], colors["ink"], 0.0024)


def closed_book(prop, colors, x, y, z, width=0.31, depth=0.42, color=2, angle=0):
    material = colors["book"][color]
    prop.box("closed book cover", x, y, z, width, depth, 0.055, material, 0.009, angle)
    prop.box("page edges", x, y-0.004, z+0.011, width*0.89, depth*0.97, 0.033, colors["paper"], 0.006, angle)
    prop.box("closed book top", x, y, z+0.042, width, depth, 0.014, material, 0.005, angle)


def table(prop, colors, width, depth, top):
    oak, walnut, edge = colors["surface"], colors["wood"], colors["edge"]
    xmax, ymax = width/2, depth/2
    for x in (-xmax+0.15, xmax-0.15):
        for y in (-ymax+0.14, ymax-0.14):
            prop.box("tapered foot", x, y, 0, 0.13, 0.13, top-0.12, walnut, 0.021)
            prop.box("foot collar", x, y, 0.09, 0.169, 0.169, 0.07, edge, 0.015)
    for y in (-ymax+0.12, ymax-0.12):
        prop.box("long carved apron", 0, y, top-0.27, width-0.15, 0.11, 0.16, walnut)
        prop.box("apron lower bead", 0, y, top-0.285, width-0.15, 0.12, 0.034, edge)
    for x in (-xmax+0.12, xmax-0.12):
        prop.box("side apron", x, 0, top-0.27, 0.11, depth-0.15, 0.16, walnut)
    prop.box("lipped tabletop", 0, 0, top-0.11, width, depth, 0.11, oak, 0.045)
    grooves = [[(-xmax+0.08, y, top+0.002), (xmax-0.08, y, top+0.002)]
               for y in (-depth/6, depth/6)]
    prop.strokes("tabletop plank joints", grooves, walnut, 0.0045)


def chair(prop, colors, compact=False):
    oak, walnut = colors["surface"], colors["wood"]
    w, d, seat_h = (0.48, 0.44, 0.36) if compact else (0.55, 0.57, 0.40)
    for x in (-w/2+0.055, w/2-0.055):
        for y in (-d/2+0.055, d/2-0.055):
            height = seat_h-0.04 if y < 0 else seat_h+0.29
            prop.box("chair upright", x, y, 0, 0.092, 0.095, height, walnut, 0.015)
    prop.box("rounded wooden seat", 0, 0, seat_h-0.057, w, d, 0.07, oak, 0.029)
    prop.box("seat back panel", 0, d/2-0.055, seat_h+0.125, w-0.08, 0.075, 0.17, oak, 0.023)
    prop.box("top rail", 0, d/2-0.055, seat_h+0.25, w, 0.09, 0.063, walnut, 0.019)


def cabinet(prop, colors, w, d, top, panels=3):
    oak, walnut, edge, inset = (colors[k] for k in ("surface", "wood", "edge", "inset"))
    front = d/2 - 0.08
    rear = -front
    prop.box("cabinet carcase", 0, 0, 0.115, w-0.135, d-0.16, top-0.20, walnut)
    prop.box("lower plinth", 0, 0, 0.025, w-0.04, d-0.04, 0.13, edge, 0.028)
    prop.box("worktop bevel molding", 0, 0, top-0.155, w-0.03, d-0.04, 0.07, edge, 0.024)
    prop.box("worktop", 0, 0, top-0.09, w, d, 0.09, oak, 0.033)
    for end in (-1, 1):
        x = end*(w/2-0.10)
        for y in (rear, front):
            prop.box("corner post", x, y, 0.08, 0.14, 0.14, top-0.19, oak)
        prop.box("side inset panel", end*(w/2-0.073), 0, 0.23, 0.032, d-0.32, top-0.51, inset)
        prop.box("side stile", end*(w/2-0.056), 0, 0.19, 0.032, d-0.22, 0.05, oak)
    panel_width = (w-0.31)/panels
    for i in range(panels):
        x = (i-(panels-1)/2)*panel_width
        prop.box("raised drawer front", x, front+0.026, top-0.31, panel_width-0.037, 0.065, 0.149, oak)
        prop.box("raised door surround", x, front+0.023, 0.19, panel_width-0.04, 0.065, top-0.52, oak)
        prop.box("recessed door field", x, front+0.059, 0.24, panel_width-0.17, 0.022, top-0.63, inset)
        prop.box("door brass knob", x+panel_width*0.29, front+0.076, top*0.49, 0.049, 0.038, 0.038, colors["brass"], 0.012)
        prop.strokes("cast drawer pull", [
            [(x-0.081, front+0.071, top-0.232), (x-0.056, front+0.103, top-0.255),
             (x+0.056, front+0.103, top-0.255), (x+0.081, front+0.071, top-0.232)]
        ], colors["brass"], 0.009)


def bookcase(prop, colors, rng, width=2.15):
    oak, walnut, edge = colors["surface"], colors["wood"], colors["edge"]
    depth, top = 0.72, 2.05
    prop.box("dark shelf backing", 0, -0.292, 0.12, width-0.12, 0.08, top-0.23, edge)
    for x in (-width/2+0.066, 0, width/2-0.066):
        prop.box("tall fluted upright", x, 0, 0.12, 0.115, depth-0.06, top-0.22, walnut)
        prop.box("upright edge bead", x, 0.326, 0.12, 0.047, 0.059, top-0.24, oak)
    prop.box("bottom molding", 0, 0, 0.04, width+0.04, depth+0.02, 0.14, edge, 0.027)
    prop.box("cornice undercut", 0, 0, top-0.16, width+0.06, depth+0.025, 0.086, walnut)
    prop.box("projecting cornice", 0, 0, top-0.075, width+0.12, depth+0.06, 0.075, oak)
    for shelf in (0.29, 0.686, 1.082, 1.478):
        prop.box("shelf and edge", 0, 0, shelf-0.052, width-0.11, depth-0.036, 0.052, walnut, 0.01)
        prop.box("shelf lip", 0, 0.323, shelf-0.049, width-0.12, 0.036, 0.046, oak, 0.008)
        for left, right in ((-width/2+0.16, -0.08), (0.08, width/2-0.16)):
            cursor = left+0.012
            count = 0
            while cursor < right-0.15:
                w = rng.uniform(0.07, 0.146)
                h = rng.uniform(0.203, 0.315)
                if cursor+w > right:
                    break
                x = cursor+w/2
                y = rng.uniform(0.13, 0.195)
                depth = rng.uniform(0.20, 0.265)
                prop.box("bound volume", x, y-depth/2, shelf, w, depth, h, rng.choice(colors["book"]), 0.009)
                if count%3 != 1:
                    prop.box("spine foil", x, y+0.004, shelf+h*0.78, w*0.82, 0.014, 0.014, colors["brass"], 0.003)
                if count%3 == 1:
                    prop.box("spine label", x, y+0.004, shelf+h*0.53, w*0.61, 0.014, 0.035, colors["paper"], 0.004)
                cursor += w+rng.uniform(0.012, 0.032)
                count += 1


def waiting_bench(prop, colors):
    oak, walnut, edge = colors["surface"], colors["wood"], colors["edge"]
    for x in (-1.24, 1.24):
        for y in (-0.31, 0.31):
            prop.box("bench leg", x, y, 0, 0.135, 0.135, 0.74, walnut)
        prop.box("curved-effect armrest", x, 0, 0.69, 0.18, 0.76, 0.09, oak, 0.045)
    prop.box("seat rail", 0, 0, 0.26, 2.64, 0.74, 0.16, edge)
    prop.box("rear bench frame", 0, 0.315, 0.39, 2.58, 0.116, 0.54, walnut, 0.035)
    for x in (-0.82, 0, 0.82):
        prop.box("seat cushion", x, -0.016, 0.41, 0.80, 0.68, 0.135, colors["cloth"], 0.057)
        prop.box("back cushion", x, 0.264, 0.55, 0.79, 0.13, 0.29, colors["cloth_light"], 0.049)
    prop.box("rust cushion", 0.79, 0.14, 0.55, 0.40, 0.19, 0.28, colors["cushion"], 0.067, -9)


def chalkboard(prop, colors):
    walnut, oak, slate = colors["wood"], colors["surface"], colors["board"]
    for x in (-1.82, 1.82):
        prop.box("standing board post", x, 0, 0, 0.15, 0.18, 1.83, walnut, 0.023)
        prop.box("board foot", x, 0, 0.02, 0.28, 0.43, 0.095, walnut, 0.021)
    prop.box("slate", 0, 0, 0.66, 3.58, 0.11, 1.13, slate)
    for z in (0.645, 1.766):
        prop.box("wide timber frame", 0, 0, z, 3.74, 0.18, 0.088, oak, 0.024)
    prop.box("molded chalk trough", 0, 0.09, 0.625, 3.62, 0.16, 0.055, walnut)
    plane = 0.062
    prop.strokes("chalk refraction construction", [
        [(x, plane, z) for x, z in [(-0.34, 1.005), (0.38, 1.04), (-0.05, 1.57), (-0.34, 1.005)]],
        [(-1.39, plane, 1.38), (-0.2, plane, 1.31), (0.235, plane, 1.22)],
        [(-1.24, plane, 0.98), (-0.91, plane, 0.98)],
        [(-1.11, plane, 0.93), (-1.04, plane, 0.93)],
        [(0.54, plane, 1.53), (1.29, plane, 1.53)],
        [(0.64, plane, 1.45), (1.05, plane, 1.45)],
    ], colors["chalk"], 0.009)
    for color, end in (("chalk_red", 1.2), ("chalk_gold", 1.112), ("chalk_green", 1.018)):
        prop.strokes("refracted ray", [[(0.235, plane, 1.22), (1.47, plane, end)]], colors[color], 0.008)
    prop.box("chalk stub", -0.52, 0.116, 0.682, 0.13, 0.047, 0.047, colors["chalk"], 0.014)
    prop.box("felt eraser", 1.08, 0.114, 0.682, 0.20, 0.095, 0.065, walnut, 0.015)


def bottle(prop, colors, x, y, z, size, body):
    prop.turned("octagonal reagent vessel", x, y, z,
                [(size*0.33, 0), (size*0.43, size*0.095), (size*0.43, size*0.55),
                 (size*0.18, size*0.79), (size*0.18, size*0.97)], colors[body], 8)
    prop.box("paper label", x, y+size*0.399, z+size*0.30, size*0.39, size*0.04, size*0.24, colors["paper"], 0.004)
    prop.turned("stopper", x, y, z+size*0.94,
                [(size*0.15, 0), (size*0.205, size*0.15), (size*0.205, size*0.195)], colors["wood"], 8)


def build_furniture(api):
    """Populate the plan while preserving the center hall and the three door gaps."""
    colors = color_set(api)
    rng = random.Random(19)

    library = api.collection("Furniture - Library")
    for index, y in enumerate((4.64, 7.13, 9.62), 1):
        shelves = Furniture(api, library, f"Library bookcase {index:02}", 1.64, y, -90)
        bookcase(shelves, colors, rng)
    for index, y in enumerate((5.5, 9.95), 1):
        reading = Furniture(api, library, f"Reading table {index:02}", 3.95, y)
        table(reading, colors, 2.60, 1.18, 0.80)
        open_book(reading, colors, 0, 0, 0.80, 0.69, 0.45)
        closed_book(reading, colors, -0.64, -0.18, 0.801, 0.35, 0.42, color=index+1, angle=-9)
        if index == 2:
            closed_book(reading, colors, 0.65, 0.11, 0.801, 0.37, 0.46, color=5, angle=11)
            closed_book(reading, colors, 0.68, 0.10, 0.858, 0.31, 0.38, color=3, angle=-2)
        for chair_index, (dx, dy) in enumerate((
            (-0.57, -0.88), (0.57, -0.88), (-0.57, 0.88), (0.57, 0.88),
        ), 1):
            seat = Furniture(api, library, f"Reading chair {index}-{chair_index}", 3.95+dx, y+dy, 180 if dy<0 else 0)
            chair(seat, colors)

    hall = api.collection("Furniture - Entrance and Hall")
    reception = Furniture(api, hall, "Reception counter", 4.0, 15.8)
    cabinet(reception, colors, 3.30, 1.16, 1.08)
    open_book(reception, colors, 0.20, -0.04, 1.08, 0.75, 0.46)
    closed_book(reception, colors, -1.03, 0.10, 1.08, 0.37, 0.45, color=7, angle=4)
    closed_book(reception, colors, -1.04, 0.12, 1.137, 0.33, 0.41, color=2, angle=-8)
    reception.turned("dark ceramic inkwell", -0.37, -0.17, 1.08, [(0.078, 0), (0.076, 0.082), (0.057, 0.10)], colors["ink"])
    for index, (x, y) in enumerate(((3.67, 18.82), (21.42, 19.02)), 1):
        bench = Furniture(api, hall, f"Waiting bench {index:02}", x, y)
        waiting_bench(bench, colors)

    practice = api.collection("Furniture - Spell Practice")
    workbench = Furniture(api, practice, "Lens workbench", 21.05, 3.5)
    cabinet(workbench, colors, 3.32, 1.20, 1.01)
    open_book(workbench, colors, 0.33, 0.05, 1.01, 0.73, 0.47)
    for dx, dy, size, tint in ((-1.15, -0.12, 0.28, "ceramic"), (-1.3, 0.15, 0.19, "glass_green")):
        bottle(workbench, colors, dx, dy, 1.01, size, tint)
    workbench.box("lens cradle", -0.35, -0.15, 1.01, 0.32, 0.20, 0.067, colors["edge"])
    workbench.strokes("brass lens cradle guides", [
        [(-0.50, -0.15, 1.07), (-0.44, -0.15, 1.15), (-0.38, -0.15, 1.16)],
        [(-0.20, -0.15, 1.07), (-0.26, -0.15, 1.15), (-0.32, -0.15, 1.16)],
    ], colors["brass"], 0.018)
    supplies = Furniture(api, practice, "Workbench supplies cabinet", 23.48, 6.02, 90)
    cabinet(supplies, colors, 2.85, 0.80, 0.82)
    for i, (x, y) in enumerate(((-0.9, -0.05), (-0.68, 0.10), (-0.50, -0.11), (0.67, 0.14), (0.88, -0.07), (1.11, 0.07))):
        bottle(supplies, colors, x, y, 0.82, rng.uniform(0.17, 0.29), "ceramic" if i%2 == 0 else "glass_green")
    closed_book(supplies, colors, 0.10, 0, 0.82, color=2, angle=-7)

    lecture = api.collection("Furniture - Introductory Classroom")
    chalkboard(Furniture(api, lecture, "Refraction teaching slate", 21.15, 10.38), colors)
    instructor = Furniture(api, lecture, "Demonstration lectern", 21.12, 11.34)
    table(instructor, colors, 1.66, 0.69, 0.96)
    open_book(instructor, colors, 0.14, -0.06, 0.96, 0.53, 0.35)
    for index, (x, y) in enumerate((
        (19.77, 12.62), (22.19, 12.62), (19.77, 14.46), (22.19, 14.46),
    ), 1):
        desk = Furniture(api, lecture, f"Student desk {index:02}", x, y)
        table(desk, colors, 1.27, 0.68, 0.72)
        chair(Furniture(api, lecture, f"Student chair {index:02}", x, y+0.57), colors, compact=True)
        closed_book(desk, colors, 0.015, 0.019, 0.72, 0.32, 0.37, color=index, angle=(index-2)*4)
        desk.turned("inkpot", -0.415, -0.12, 0.72,
                    [(0.071, 0), (0.064, 0.076), (0.047, 0.094), (0.061, 0.113)], colors["ink"], 8)

