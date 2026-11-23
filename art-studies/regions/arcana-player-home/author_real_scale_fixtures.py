"""Export the real-scale home fixtures from the approved Campus A material palette.

Open player-home-campus-a.blend with Blender in background mode and run this script.
Each GLB starts on the floor at the centre of its footprint. In Godot, the prep
counter faces +X and fixtures with a front face +Z. List output names after --
to export just those fixtures.
"""

from math import cos, sin, tau
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SOURCE = HERE / "player-home-campus-a.blend"
OUTPUT = HERE.parents[2] / "godot-arcana/art/source/player-home-real-scale"
sys.path.insert(0, str(HERE.parent / "arcana-inn-interior/source/blender-v1"))
from export_inn import pack_group


def box(group, name, center, size, material, radius=0.008):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((*size, 1))), verts=list(bm.verts))
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = center
    bevel = obj.modifiers.new("Rounded edges", "BEVEL")
    bevel.width = radius
    bevel.segments = 2
    obj.modifiers.new("Corner normals", "WEIGHTED_NORMAL")


def profile(group, name, origin, section, materials, segments=32, bands=None):
    """Loft a closed elliptical section with one material per band or stave."""
    vertices = []
    faces = []
    for radius_x, radius_y, height in section:
        for index in range(segments):
            angle = index * tau / segments
            vertices.append((origin[0] + radius_x * cos(angle),
                origin[1] + radius_y * sin(angle), origin[2] + height))
    for row in range(len(section)):
        current = row * segments
        next_row = ((row + 1) % len(section)) * segments
        for index in range(segments):
            edge = (index + 1) % segments
            faces.append((current + index, current + edge, next_row + edge, next_row + index))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    for material in materials:
        mesh.materials.append(material)
    for index, face in enumerate(mesh.polygons):
        face.use_smooth = bands is None
        if bands is not None:
            face.material_index = bands(index // segments, index % segments)
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)


def tube(group, name, points, radius, material):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 7
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    curve.use_fill_caps = True
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = point.handle_right_type = "AUTO"
    curve.materials.append(material)
    obj = bpy.data.objects.new(name, curve)
    group.objects.link(obj)


def basin(group, name, origin, radii, material, insert):
    x, y = radii
    profile(group, name, origin, (
        (x * .57, y * .58, .010), (x * .76, y * .78, .047),
        (x, y, .106), (x * .99, y * .99, .126),
        (x * .84, y * .83, .126), (x * .79, y * .78, .081),
        (x * .51, y * .51, .039), (x * .51, y * .51, .013),
    ), [material])
    profile(group, name + " inset", origin, (
        (.002, .002, .038), (x * .54, y * .53, .038),
        (x * .54, y * .53, .045), (.002, .002, .045),
    ), [insert])


def bathtub(group, palette):
    wood, rim, shadow = (palette[key] for key in ("oak", "trim", "dark"))
    profile(group, "Coopered wood body", (0, 0, 0), (
        (.724, .280, .080), (.748, .304, .108), (.833, .358, .505),
        (.850, .375, .552), (.844, .369, .565), (.791, .318, .565),
        (.783, .310, .544), (.698, .237, .136), (.681, .225, .109),
    ), [wood, rim, shadow], bands=lambda row, stave: (
        1 if row in (2, 3, 4) else (2 if row == 0 or stave % 7 == 3 else 0)
    ))
    for base_x in (-.56, .56):
        box(group, "Low oak supporting foot", (base_x, 0, .05), (.11, .50, .10), shadow, .017)
    for height, radius_x, radius_y in ((.154, .760, .318), (.477, .829, .355)):
        profile(group, "Blackened stave band", (0, 0, height), (
            (radius_x - .015, radius_y - .015, -.014), (radius_x, radius_y, -.014),
            (radius_x + .005, radius_y + .005, .014), (radius_x - .010, radius_y - .010, .014),
        ), [palette["iron"]])
    profile(group, "Pale bathwater", (0, 0, 0), (
        (.001, .001, .425), (.753, .285, .425),
        (.753, .285, .436), (.001, .001, .436),
    ), [palette["water"]])
    for x, y, length in ((-.35, -.087, .20), (-.09, .126, .28), (.30, -.095, .23)):
        tube(group, "Short light ripple", [(x, y, .437),
            (x + length * .62, y + .009, .437), (x + length, y, .437)],
            .004, palette["ripple"])


def vanity(group, palette):
    wood, trim, dark = (palette[key] for key in ("oak", "trim", "dark"))
    for x in (-.242, .242):
        for y in (-.154, .154):
            box(group, "Solid timber leg", (x, y, .368), (.064, .064, .736), dark)
    box(group, "Shallow linen shelf", (0, 0, .187), (.542, .356, .034), wood)
    box(group, "Oak countertop", (0, 0, .758), (.60, .43, .055), trim, .012)
    box(group, "Hand-cut apron", (0, -.167, .695), (.518, .047, .085), wood)
    for x, y, size in ((-.106, .014, .105), (.040, -.015, .125)):
        box(group, "Folded linen towel", (x, y, .228), (size, .116, .048), palette["linen"], .012)
    basin(group, "Warm ivory washbowl", (0, -.026, .781), (.187, .139), palette["ivory"], palette["water"])
    tube(group, "Aged brass water spout", ((.191, .148, .785), (.191, .148, .978),
        (.156, .113, 1.019), (.095, .032, 1.019), (.075, .004, .991)), .013, palette["brass"])
    box(group, "Hammered tap handle", (.191, .148, .926), (.081, .024, .018), palette["brass"], .007)


def toilet(group, palette):
    ivory, wood = palette["ivory"], palette["dark"]
    box(group, "Glazed earthenware cistern", (0, .238, .480), (.358, .174, .287), ivory, .024)
    box(group, "Cistern timber cap", (0, .236, .629), (.380, .178, .032), palette["trim"], .011)
    box(group, "Small brass flush fitting", (.111, .154, .574), (.066, .027, .021), palette["brass"], .006)
    profile(group, "Earthenware floor pedestal", (0, -.089, 0), (
        (.115, .126, 0), (.117, .123, .026), (.078, .087, .21),
        (.121, .138, .267), (.001, .001, .267), (.001, .001, 0),
    ), [ivory])
    profile(group, "Rounded earthenware bowl", (0, -.122, 0), (
        (.084, .110, .217), (.132, .153, .263), (.183, .203, .365),
        (.184, .202, .406), (.144, .165, .407), (.118, .126, .323),
        (.061, .064, .281), (.001, .001, .281), (.001, .001, .217),
    ), [ivory])
    profile(group, "Oiled timber seat ring", (0, -.122, 0), (
        (.183, .202, .405), (.184, .201, .421), (.144, .166, .424), (.141, .165, .407),
    ), [wood])
    profile(group, "Small water seal", (0, -.122, 0), (
        (.001, .001, .293), (.080, .086, .293), (.080, .086, .297), (.001, .001, .297),
    ), [palette["water"]])


def bench(group, palette):
    wood, trim, dark = (palette[key] for key in ("oak", "trim", "dark"))
    for x in (-.599, .599):
        box(group, "Oiled oak side panel", (x, 0, .214), (.081, .358, .428), wood)
    box(group, "Sturdy rounded seat", (0, 0, .439), (1.30, .40, .055), trim, .014)
    box(group, "Dark oak kick rail", (0, 0, .074), (1.22, .341, .073), dark)
    box(group, "Recessed case backing", (0, .153, .245), (1.18, .046, .295), dark)
    for x in (-.397, 0, .397):
        box(group, "Storage compartment front", (x, -.156, .257), (.375, .057, .265), wood)
        box(group, "Indigo panel inset", (x, -.185, .250), (.312, .017, .161), palette["ink"])
        box(group, "Small brass pull", (x, -.191, .257), (.069, .017, .020), palette["brass"], .005)
    box(group, "Folded entry cushion", (-.294, .027, .494), (.43, .266, .055), palette["blue"], .020)


def prep_counter(group, palette):
    wood, trim, dark = (palette[key] for key in ("oak", "trim", "dark"))
    box(group, "Oak cabinet body", (-.016, 0, .414), (.528, 1.760, .705), wood, .013)
    box(group, "Recessed plinth", (-.048, 0, .055), (.442, 1.710, .110), dark)
    box(group, "Ivory work surface", (0, 0, .850), (.600, 1.800, .060), palette["ivory"], .012)
    for y in (-.598, 0, .598):
        box(group, "Inset oak cupboard door", (.253, y, .366), (.055, .558, .525), trim)
        box(group, "Carved door inset", (.282, y, .359), (.014, .442, .372), wood)
        box(group, "Horizontal drawer", (.255, y, .712), (.053, .558, .140), trim)
        box(group, "Aged brass drawer pull", (.286, y, .712), (.024, .086, .018), palette["brass"], .005)
        box(group, "Aged brass cupboard pull", (.285, y + .183, .555), (.023, .026, .040), palette["brass"], .005)


def dining_table(group, palette):
    wood, trim, dark = (palette[key] for key in ("oak", "trim", "dark"))
    for x in (-.503, .503):
        for y in (-.253, .253):
            box(group, "Pegged oak leg", (x, y, .349), (.070, .070, .698), dark, .008)
    for y in (-.253, .253):
        box(group, "Long timber apron", (0, y, .665), (.955, .042, .073), wood)
    for x in (-.503, .503):
        box(group, "End apron", (x, 0, .665), (.042, .445, .073), wood)
    box(group, "Rounded oak tabletop", (0, 0, .713), (1.20, .70, .054), trim, .018)


def coffee_table(group, palette):
    wood, trim, dark = (palette[key] for key in ("oak", "trim", "dark"))
    for x in (-.284, .284):
        for y in (-.126, .126):
            box(group, "Low shaped leg", (x, y, .190), (.056, .056, .380), dark)
    box(group, "Central oak stretcher", (0, 0, .142), (.620, .045, .050), wood)
    profile(group, "Rounded oak top", (0, 0, 0), (
        (.440, .215, .372), (.468, .242, .386), (.475, .250, .412),
        (.457, .234, .430), (.002, .002, .430), (.002, .002, .372),
    ), [trim])


def color_variant(material, name, color, roughness):
    copy = material.copy()
    copy.name = name
    copy.diffuse_color = (*color, 1)
    shader = next(node for node in copy.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = copy.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Emission Strength"].default_value = 0
    return copy


def export_fixture(scene, name, build, palette):
    group = bpy.data.collections.new(name)
    scene.collection.children.link(group)
    build(group, palette)
    anchor = bpy.data.objects.new(name + " placement", None)
    scene.collection.objects.link(anchor)
    bpy.context.view_layer.update()
    packed = pack_group(anchor, list(group.objects), bpy.context.evaluated_depsgraph_get())
    packed[0].name = name
    bpy.ops.object.select_all(action="DESELECT")
    for obj in packed:
        obj.select_set(True)
    object_bounds = [packed[1].matrix_world @ Vector(point) for point in packed[1].bound_box]
    bounds = [(min(point[axis] for point in object_bounds),
        max(point[axis] for point in object_bounds)) for axis in (0, 2, 1)]
    print(f"{name} bounds (Blender X, height, depth): {bounds}", flush=True)
    temporary = OUTPUT / (name + ".tmp.glb")
    result = bpy.ops.export_scene.gltf(filepath=str(temporary), export_format="GLB",
        use_selection=True, export_animations=False, export_cameras=False, export_lights=False)
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not export {name}")
    temporary.replace(OUTPUT / (name + ".glb"))


def export(only=()):
    if not bpy.app.background or Path(bpy.data.filepath).resolve() != SOURCE:
        raise RuntimeError(f"Open {SOURCE} in Blender background mode first.")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    materials = bpy.data.materials
    palette = {
        "oak": materials["Oak | honey"],
        "trim": materials["Oak | polished trim"],
        "dark": materials["Oak | dark carved frames"],
        "ivory": materials["Porcelain | warm ivory"],
        "iron": materials["Iron | blackened"],
        "brass": materials["Brass | aged and polished"],
        "ink": materials["Library Lane | indigo wood paint"],
        "blue": materials["Textile | lapis blue"],
        "linen": materials["Textile | flax linen"],
        "water": color_variant(materials["Library Lane | old glass"],
            "Library Lane | bath water", (.105, .364, .349), .31),
        "ripple": color_variant(materials["Library Lane | old glass"],
            "Library Lane | pale bath highlights", (.205, .506, .472), .38),
    }
    # The Campus A palette stores its game colors in the shader defaults.
    # glTF cannot export procedural grain or bump graphs; leave image textures intact.
    for material in palette.values():
        shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
        for channel in ("Base Color", "Normal"):
            for link in list(shader.inputs[channel].links):
                if link.from_node.type != "TEX_IMAGE":
                    material.node_tree.links.remove(link)
    fixtures = {
        "bath-tub": bathtub,
        "bath-vanity": vanity,
        "bath-toilet": toilet,
        "entry-bench": bench,
        "kitchen-prep": prep_counter,
        "kitchen-dining-table": dining_table,
        "living-coffee-table": coffee_table,
    }
    unknown = set(only).difference(fixtures)
    if unknown:
        raise ValueError(f"Unknown fixture names: {', '.join(sorted(unknown))}")
    for name in only or fixtures:
        export_fixture(bpy.context.scene, name, fixtures[name], palette)


if __name__ == "__main__":
    export(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ())
