"""Build the approved MYSTIC rod. Run in Blender background mode."""
from math import cos, pi, sin
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[3]
SOURCE = Path(__file__).resolve().with_name("mystic_rod.blend")
OUTPUT = ROOT / "godot-arcana/art/props/fishing/mystic_rod.glb"

# The 64 px inventory art supplies the colors. Bake the facet values because
# the character's transparent pixel viewport intentionally has no scene light.
INK = "272d47"
NAVY = "263c62"
WRAP = "3a506c"
STEEL = "91a7bb"
SILVER = "b6c8d0"
LIGHT = "d5e2df"
WOOD = "715347"
GRAIN = "8b7469"
SHADE = "58434a"
BLUE = "518dbb"
GEM = "75b8dc"

verts, faces, paints = [], [], []
groups = {}


def color(hex_rgb, brightness=1.0):
    # Compatibility presents unlit vertex colors in display space. Store
    # the same display values as the approved pixel sprite's palette.
    return tuple(int(hex_rgb[i:i+2], 16) / 255 * brightness for i in (0, 2, 4)) + (1.0,)


def face(indices, paint, factor=1.0):
    faces.append(indices)
    paints.append(color(paint, factor))


def axis_frame(axis):
    axis = axis.normalized()
    reference = Vector((1, 0, 0)) if abs(axis.x) < 0.8 else Vector((0, 1, 0))
    across = (reference - reference.dot(axis) * axis).normalized()
    return across, axis.cross(across)


def turned(name, origin, axis, profile, sides, colors):
    """A faceted turned part; profile is a list of (distance, radius) rings."""
    origin, axis = Vector(origin), Vector(axis).normalized()
    u, v = axis_frame(axis)
    start = len(verts)
    for distance, radius in profile:
        for i in range(sides):
            angle = 2 * pi * i / sides
            verts.append(origin + axis * distance + radius * (u * cos(angle) + v * sin(angle)))
    for row in range(len(profile)-1):
        for i in range(sides):
            j = (i + 1) % sides
            a, b = start + sides * row, start + sides * (row+1)
            angle = 2 * pi * (i + .5) / sides
            outward = u * cos(angle) + v * sin(angle)
            light = outward.dot(Vector((.48, -.60, .64)))
            tint = colors[row] if isinstance(colors, list) else colors
            face([a+i, a+j, b+j, b+i], tint, .61 + .39 * (light + 1.0) / 2.0)
    end = start + (len(profile)-1) * sides
    face(list(range(start+sides-1, start-1, -1)), colors[0] if isinstance(colors, list) else colors, .69)
    face(list(range(end, end+sides)), colors[-1] if isinstance(colors, list) else colors)
    groups.setdefault(name, []).extend(range(start, len(verts)))


def rod_section(name, levels, sides, paints):
    turned(name, (0,0,0), (0,0,1), levels, sides, paints)


def pipe(name, start, end, radius, paint):
    delta = Vector(end) - Vector(start)
    turned(name, start, delta, [(0, radius), (delta.length, radius)], 7, paint)


def tube(name, centers, radius, paint, closed):
    """A wire eye or winding from a continuous row of circular profiles."""
    start = len(verts)
    steps = len(centers)
    for i, point in enumerate(centers):
        prev = centers[(i-1) % steps] if closed or i else centers[0]
        nxt = centers[(i+1) % steps] if closed or i < steps-1 else centers[-1]
        u, v = axis_frame(nxt-prev)
        # Transport a common radial reference so the cross section cannot flip.
        if i and u.dot(last_u) < 0:
            u, v = -u, -v
        last_u = u
        for j in range(6):
            theta = 2*pi*j/6
            verts.append(point + radius*(cos(theta)*u + sin(theta)*v))
    for i in range(steps if closed else steps-1):
        a, b = start+6*i, start+6*((i+1)%steps)
        for j in range(6):
            k = (j+1)%6
            face([a+j, a+k, b+k, b+j], paint, .72 + .22 * (1+cos(2*pi*j/6))*.5)
    groups.setdefault(name, []).extend(range(start,len(verts)))


def build():
    rod_section("Tapered wooden blank",
                [(.07,.021),(.15,.021),(.25,.020),(.35,.018),(.47,.017),
                 (.59,.015),(.70,.013),(.80,.012),(.89,.010),(.96,.008),(.996,.006)],
                10, [SHADE, WOOD, WOOD, WOOD, WOOD, WOOD, WOOD, GRAIN, GRAIN, GRAIN])
    rod_section("Navy grip", [(-.091,.016),(-.084,.028),(-.067,.030),(.086,.028),
                             (.109,.023),(.121,.022)], 12, [STEEL, INK, NAVY, WRAP, INK])
    winding = []
    for step in range(101):
        t = step/100
        angle = 2*pi*4.6*t
        r = .029-.002*t
        winding.append(Vector((r*cos(angle),r*sin(angle),-.062+.147*t)))
    tube("Silver grip winding", winding, .0038, STEEL, False)
    rod_section("Grip ferrules", [(-.090,.019),(-.086,.030),(-.077,.030),(-.073,.028)],
                12, [INK, SILVER, STEEL])
    rod_section("Grip ferrules", [(.089,.028),(.092,.031),(.102,.031),(.105,.026)],
                12, [INK, SILVER, STEEL])

    # Offset spool and folding crank. The sapphire is set into the outside cheek.
    pipe("Reel foot", (0,-.011,.124),(0,-.041,.167),.012,STEEL)
    pipe("Reel foot", (0,-.011,.212),(0,-.041,.179),.010,STEEL)
    turned("Spool and cheeks", (-.026,-.044,.172),(1,0,0),
           [(0,.026),(.004,.042),(.011,.042),(.014,.030),(.033,.030),(.036,.043),
            (.044,.044),(.049,.035)], 14,
           [INK, STEEL, NAVY, BLUE, NAVY, SILVER, WRAP])
    for x in (-.009, -.003, .003):
        turned("Wound line", (x,-.044,.172),(1,0,0),[(0,.031),(.003,.031)],14,STEEL)
    turned("Sapphire setting",(.022,-.044,.172),(1,0,0),
           [(0,.025),(.006,.027),(.009,.022),(.016,.013),(.018,.0035)],
           8,[INK,SILVER,BLUE,GEM])
    pipe("Reel crank", (-.030,-.044,.172),(-.039,-.044,.172),.007,STEEL)
    pipe("Reel crank", (-.039,-.044,.172),(-.039,-.073,.190),.006,SILVER)
    turned("Crank knob",(-.039,-.073,.190),(-1,0,0),
           [(0,.006),(.003,.011),(.015,.011),(.019,.007)],8,[INK,NAVY,WRAP])

    for base, shaft, eye in [(.324,.019,.022),(.566,.015,.017),(.806,.012,.013)]:
        rod_section("Silver guide ferrules",[(base-.010,shaft),(base-.007,shaft+.0035),
                    (base+.007,shaft+.0035),(base+.010,shaft)],10,[INK,STEEL,LIGHT])
        cy = -shaft - eye * .9
        path = [Vector((eye*cos(i*2*pi/12), cy+eye*sin(i*2*pi/12),base+.009))
                for i in range(12)]
        tube("Line guides",path,.0035,SILVER,True)
        pipe("Line guide feet",(0,-shaft,base-.008),(0,cy,base+.009),.0038,STEEL)
    rod_section("Tip ferrule",[(.966,.009),(.971,.011),(.985,.0095),(.99,.006)],
                8,[INK,STEEL,SILVER])
    tip = [Vector((.009*cos(i*2*pi/12),0,1+.008*sin(i*2*pi/12))) for i in range(12)]
    tube("Tip eye",tip,.0033,LIGHT,True)

    mesh = bpy.data.meshes.new("MYSTIC rod fittings")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    rod = bpy.data.objects.new("Rod", mesh)
    root = bpy.data.objects.new("MysticRod", None)
    bpy.context.collection.objects.link(root)
    bpy.context.collection.objects.link(rod)
    rod.parent = root
    for name, indices in groups.items():
        rod.vertex_groups.new(name=name).add(indices,1,"REPLACE")
    paint = mesh.color_attributes.new(name="Palette",type="FLOAT_COLOR",domain="CORNER")
    for poly, tint in zip(mesh.polygons, paints):
        for loop in poly.loop_indices:
            paint.data[loop].color = tint
    material = bpy.data.materials.new("MYSTIC painted facets")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    attr = nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Palette"
    emit = nodes.new("ShaderNodeEmission")
    light_path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    output = nodes.new("ShaderNodeOutputMaterial")
    links = material.node_tree.links
    links.new(attr.outputs["Color"],emit.inputs["Color"])
    links.new(light_path.outputs["Is Camera Ray"],mix.inputs[0])
    links.new(emit.outputs[0],mix.inputs[1])
    links.new(emit.outputs[0],mix.inputs[2])
    links.new(mix.outputs[0],output.inputs["Surface"])
    mesh.materials.append(material)
    rod.shape_key_add(name="Basis")
    # Godot +Z faces the water. Line tension pulls forward, and inertia
    # during the forward cast bends the tip back toward the angler.
    for name, direction in (("Flex", -1.0), ("CastLag", 1.0)):
        bend = rod.shape_key_add(name=name, from_mix=False)
        for point in bend.data:
            t = max(0.0, (point.co.z - .22) / .78)
            point.co.y += direction * .22 * t * t
            point.co.z -= .05 * t * t * t
    bpy.context.view_layer.objects.active = rod
    rod.select_set(True)
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type == "VIEW_3D":
                region=area.spaces.active.region_3d
                region.view_distance=1.64
                region.view_location=(0,0,.43)
                region.view_rotation=Vector((-.55,.82,-.16)).to_track_quat("-Z","Y")
                area.spaces.active.shading.color_type="VERTEX"
    OUTPUT.parent.mkdir(parents=True,exist_ok=True)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", export_yup=True,
                              export_animations=False, export_morph=True, export_morph_normal=False,
                              export_texcoords=False, export_tangents=False)


bpy.ops.wm.read_factory_settings(use_empty=True)
build()
