"""Build the initial Arcana shop authoring file from the current game room."""
from pathlib import Path
import sys
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[5]
STUDY = Path(__file__).resolve().parent
WORK = ROOT / ".runtime/shop-blender-work"
SOURCE = STUDY / "arcana-shop.blend"
GAME_ASSET = ROOT / "godot-arcana/art/source/shop-room-blender/arcana-shop.glb"


def collection(name, parent):
    result = bpy.data.collections.new(name)
    parent.children.link(result)
    return result


def link(obj, target):
    target.objects.link(obj)
    for prior in tuple(obj.users_collection):
        if prior != target:
            prior.objects.unlink(obj)


def color_material(name, hex_color, roughness=.82, metal=0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    srgb = [int(hex_color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    rgb = tuple((c + .055) ** 2.4 / 1.055 ** 2.4 if c > .04045 else c / 12.92 for c in srgb)
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (*rgb, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metal
    material.diffuse_color = (*rgb, 1)
    return material


def sandstone(material, hex_color, tone, seed):
    """Pack a repeatable, low-contrast sandstone texture with no external files."""
    rng = np.random.default_rng(seed)
    size = 128
    y, x = np.mgrid[:size, :size] * (2 * np.pi / size)
    broad = np.sin(2*x + y) * np.cos(2*y - x) * .55
    medium = np.sin(7*x + 5*y + np.sin(x)*1.5) * np.cos(6*y - x) * .28
    flecks = rng.choice([-1.5, 0, 1.1], p=[.065, .85, .085], size=(size, size))
    variation = (broad + medium + flecks + rng.normal(0, .14, (size,size))) * tone
    base = np.array([int(hex_color[i:i+2],16)/255 for i in (0,2,4)])
    srgb = np.clip(base + variation[...,None], 0, 1)
    pixels = np.ones((size,size,4), dtype=np.float32)
    pixels[...,:3] = srgb
    image = bpy.data.images.new(material.name, width=size, height=size, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    node = material.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = image
    shader = next(n for n in material.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    material.node_tree.links.new(node.outputs["Color"], shader.inputs["Base Color"])
    return material


def block(name, corners, material, target, parent, bevel=0):
    x0, x1, y0, y1, z0, z1 = corners
    half = Vector(((x1-x0)/2, (y1-y0)/2, (z1-z0)/2))
    verts = [(x*half.x, y*half.y, z*half.z)
             for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),
                           (-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]]
    faces = [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    layer = mesh.uv_layers.new()
    origin = Vector((x0+half.x, y0+half.y, z0+half.z))
    for face in mesh.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        u, v = [(1,2),(0,2),(0,1)][axis]
        for loop_id in face.loop_indices:
            point = mesh.vertices[mesh.loops[loop_id].vertex_index].co + origin
            layer.data[loop_id].uv = (point[u]/1.6, point[v]/1.6)
    mesh.materials.append(material)
    obj = bpy.data.objects.new(name, mesh)
    target.objects.link(obj)
    obj.parent = parent
    obj.location = origin
    if bevel:
        modifier = obj.modifiers.new("Cut edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
    return obj


def arch_details(walls, target):
    navy = color_material("Midnight painted oak", "343C50")
    inset = color_material("Recessed blue panel", "283044")
    edge = color_material("Raised blue moulding", "495468")
    stone = sandstone(color_material("Sandstone cut", "B99F7C"), "B99F7C", .023, 18)
    light_stone = sandstone(color_material("Sandstone face", "DDC5A0"), "DDC5A0", .019, 27)
    dark_stone = sandstone(color_material("Sandstone shaded course", "947954"), "947954", .021, 31)
    brass = color_material("Aged brass", "B18B55", .54)
    slate = color_material("Threshold slate", "374053")
    walnut = color_material("Window smoked oak", "573927")
    pale_wood = color_material("Window inner moulding", "AC8158")

    rear = bpy.data.objects["RearWall"]
    for start, end in [(5.06, 7.0), (17.0, 18.94)]:
        for index in range(2):
            lo = start + (end-start)/2 * index
            hi = start + (end-start)/2 * (index+1)
            block("Wainscot raised frame", (lo+.035, hi-.035, -4.064, -3.985, .115, .625),
                  edge, target, rear, .024)
            block("Wainscot inset", (lo+.093, hi-.093, -4.077, -4.029, .172, .568),
                  inset, target, rear, .018)
    for x in [5.04, 18.96]:
        block("Stone pilaster", (x-.104,x+.104,-4.13,-3.984,.78,3.32),
              light_stone,target,rear,.025)
        for low, high, extent, mat in [(.12,.22,.15,dark_stone),(.22,.34,.127,stone),
                                      (.69,.81,.143,stone),(3.25,3.36,.14,stone)]:
            block("Pilaster collar",(x-extent,x+extent,-4.155,-3.983,low,high),mat,target,rear,.013)
    block("Rear oak skirting",(5.0,19.0,-4.12,-3.984,.016,.115),navy,target,rear,.013)
    block("Rear bronze floorline",(5.0,19.0,-4.128,-4.018,.115,.137),brass,target,rear,.004)
    block("Cornice lower bead",(4.76,19.24,-4.10,-3.97,3.385,3.434),dark_stone,target,rear,.009)
    block("Cornice projecting course",(4.76,19.24,-4.16,-3.95,3.425,3.527),light_stone,target,rear,.019)
    top_bed = block("Cornice continuous bed",(4.75,19.25,-4.19,-3.76,3.526,3.568),
                    dark_stone,target,rear,.012)
    top_bed["no_shadow"] = True
    for i in range(7):
        lo = 4.75 + 14.5 * i / 7
        hi = 4.75 + 14.5 * (i+1) / 7
        cap = block("Cornice top stone",(lo+.012,hi-.012,-4.175,-3.785,3.540,3.588),
                    stone,target,rear,.014)
        cap["no_shadow"] = True

    # Side/front caps are jointed real stones above a bevelled apron.
    for name, limits, y_axis, count, height in [
        ("WestCutaway", (4.715,5.105,-12.99,-4.02), True, 8, .48),
        ("RightWall", (18.895,19.285,-12.99,-4.02), True, 8, .48),
        ("FrontLeftWall", (4.75,10.865,-13.31,-12.91), False, 6, .24),
        ("FrontRightWall", (13.135,19.25,-13.31,-12.91), False, 6, .24),
    ]:
        parent = bpy.data.objects[name]
        x0,x1,y0,y1 = limits
        for i in range(count):
            a,b = i/count,(i+1)/count
            region = (x0,x1,y0+(y1-y0)*a+.009,y0+(y1-y0)*b-.009) if y_axis else (
                x0+(x1-x0)*a+.009,x0+(x1-x0)*b-.009,y0,y1)
            block("Jointed coping stone",(*region,height-.01,height+.063),
                  light_stone if i % 3 else stone,target,parent,.022)
        if name in {"WestCutaway","RightWall"}:
            x = 5.04 if name == "WestCutaway" else 18.96
            block("Side oak skirting",(x-.062,x+.062,y0,y1,.012,.104),navy,target,parent,.012)
            block("Side bronze floorline",(x-.067,x+.067,y0,y1,.104,.126),brass,target,parent,.005)
        else:
            block("Front sandstone bevel",(x0,x1,y0+.007,y0+.086,.04,.16),dark_stone,target,parent,.011)

    west = bpy.data.objects["WestWall"]
    block("Window breast wall",(4.756,4.976,-8.969,-6.051,.478,.982),light_stone,target,west,.015)
    block("Window breast apron panel",(4.952,5.042,-8.914,-6.106,.53,.927),navy,target,west,.017)
    block("Window apron recessed panel",(5.025,5.053,-8.795,-6.225,.605,.852),inset,target,west,.011)
    block("Window apron lip",(5.024,5.079,-8.898,-6.122,.908,.955),pale_wood,target,west,.011)
    for y in (-8.88, -6.14):
        block("Window stone reveal",(4.765,4.926,y-.08,y+.08,1.018,3.225),stone,target,west,.015)
        block("Window dark jamb",(4.84,5.043,y-.048,y+.048,1.043,3.182),walnut,target,west,.013)
        block("Window inner jamb bead",(5.015,5.071,y-.027,y+.027,1.075,3.157),
              pale_wood,target,west,.008)
    block("Window head reveal",(4.754,4.974,-8.978,-6.042,3.194,3.275),stone,target,west,.016)
    block("Window inner lintel",(4.81,5.089,-8.91,-6.11,3.157,3.200),walnut,target,west,.011)
    block("Window sill cap",(4.67,5.232,-9.004,-6.016,.983,1.04),pale_wood,target,west,.018)
    block("Window sill apron",(4.82,5.171,-8.956,-6.064,.874,.973),walnut,target,west,.013)
    for y in (-8.73,-6.29):
        block("Sill bracket",(4.94,5.14,y-.055,y+.055,.752,.891),walnut,target,west,.015)

    # Keep the original bulk threshold below the top detail rather than covering its joints.
    threshold = bpy.data.objects["StoneThreshold"]
    threshold.scale.z = .72
    threshold.location.z = -.13

    # Widen the two existing post bases in the outward direction only.
    for x in (10.875,13.125):
        block("Door jamb foot",(x-.162,x+.162,-13.34,-12.983,.005,.162),stone,target,walls,.025)
        block("Door jamb recessed front",(x-.087,x+.087,-13.268,-13.228,.20,.754),walnut,target,walls,.019)
        block("Door jamb cap",(x-.154,x+.154,-13.287,-12.954,.82,.87),brass,target,walls,.013)

    for i in range(4):
        x0 = 10.99 + i * .505
        x1 = x0 + .498
        block("Upper threshold block",(x0,x1,-13.32,-12.974,-.13,-.014),light_stone,target,walls,.017)
        block("Lower threshold block",(x0,x1,-13.503,-13.31,-.20,-.062),stone,target,walls,.018)
    block("Slate threshold strip",(11.035,12.965,-13.306,-13.237,-.021,-.01),slate,target,walls,.005)
    block("Bronze threshold line",(11.035,12.965,-13.238,-13.225,-.020,-.008),brass,target,walls,.003)

    # The directional shadow cutaway uses volumes which are invisible in Godot.
    roof = bpy.data.objects["SunRoof"]
    roof.hide_set(True)
    roof.hide_render = True
    for name, span in [("Front west shadow wall",(4.75,11.0)),("Front east shadow wall",(13.0,19.25))]:
        caster = block(name,(*span,-13.275,-13.007,.228,3.565),navy,target,walls)
        caster["shadow_only"] = True
        caster.hide_set(True)
        caster.hide_render = True

    # Connect the west and front shadow volumes over the cutaway corner.
    stop = block("Southwest sunlight stop",(4.73,5.015,-13.305,-12.954,.12,3.59),
                 navy,target,walls)
    stop["shadow_only"] = True
    stop.hide_set(True)
    stop.hide_render = True


def configure_floor(room_collection, reference):
    floor = bpy.data.objects["Floor"]
    with bpy.data.libraries.load(str(STUDY / "oak-plank-floor-v2.blend")) as (source, destination):
        destination.objects = [name for name in source.objects if name.startswith("Oak board ")]
    planks = collection("02  Oak boards · edit individually", reference)
    for board in destination.objects:
        planks.objects.link(board)
        # Move the object origin to the board center before offsetting the room.
        center = sum((v.co for v in board.data.vertices), Vector()) / len(board.data.vertices)
        board.data.transform(Matrix.Translation(-center))
        board.location = center + Vector((5, -4, 0))
        board.hide_render = True

    data = bpy.data.meshes.new("Oak floor joined by Geometry Nodes")
    board_surface = bpy.data.objects.new("OakPlankFloor", data)
    room_collection.objects.link(board_surface)
    board_surface.parent = floor
    board_surface["oak_floor"] = True
    board_surface["no_shadow"] = True
    group = bpy.data.node_groups.new("Arcana oak boards export", "GeometryNodeTree")
    group.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    group.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    info = group.nodes.new("GeometryNodeCollectionInfo")
    info.inputs["Collection"].default_value = planks
    info.transform_space = "RELATIVE"
    realize = group.nodes.new("GeometryNodeRealizeInstances")
    realize.location.x = 215
    output = group.nodes.new("NodeGroupOutput")
    output.location.x = 425
    group.links.new(info.outputs["Instances"], realize.inputs["Geometry"])
    group.links.new(realize.outputs["Geometry"], output.inputs["Geometry"])
    board_surface.modifiers.new("Join editable boards for Godot", "NODES").node_group = group
    board_surface.hide_set(True)
    return len(destination.objects)


def prepare_room():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.name = "Arcana Shop"
    bpy.ops.import_scene.gltf(filepath=str(WORK / "source.glb"))
    room = bpy.data.objects["ArcanaShop"]
    game = collection("01  Arcana Shop · export to Godot", scene.collection)
    reference = collection("02  Authoring and layout guides", scene.collection)
    furnishings = collection("Cabinets and Counter", game)
    architecture = collection("Architecture", game)
    illumination = collection("Lighting", game)
    floor_collection = collection("Floor Surface", game)
    guides = collection("01  Game framing and interaction points", reference)

    link(room, game)
    for name, target in [("Furniture",furnishings),("Walls",architecture),
                         ("Floor",floor_collection),("Sun",illumination),
                         ("OverheadFill",illumination),("LayoutReference",guides),("GameFraming",guides)]:
        root = bpy.data.objects[name]
        for item in [root,*root.children_recursive]:
            link(item, target)
        if target == guides:
            matrix = root.matrix_world.copy()
            root.parent = None
            root.matrix_world = matrix

    furniture = bpy.data.objects["Furniture"]
    for name, x in [("HerbCabinet2", 9.0), ("TravelCabinet2", 15.0)]:
        next(obj for obj in furniture.children if abs(obj.location.x - x) < .001).name = name
    for obj in game.all_objects:
        if obj.type == "EMPTY":
            obj.empty_display_size = .18
        if obj.get("shadow_only"):
            obj.hide_set(True)
            obj.hide_render = True
    for obj in bpy.data.objects["LayoutReference"].children:
        obj.empty_display_type = "ARROWS"
        obj.empty_display_size = .28
    for material in bpy.data.materials:
        if material.node_tree:
            for node in material.node_tree.nodes:
                if node.type == "TEX_IMAGE":
                    node.interpolation = "Closest"

    arch_details(bpy.data.objects["Walls"], architecture)
    board_count = configure_floor(floor_collection, reference)
    scene.camera = bpy.data.objects["GameFraming"]
    scene.render.resolution_x, scene.render.resolution_y = 1280, 800
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"
    scene.world = bpy.data.worlds.new("Arcana preview ambient")
    scene.world.color = (.14,.12,.10)

    # The Godot-exported values use unitless glTF lighting. Blender's compat mode
    # converts those values to Blender energy for a useful material preview.
    bpy.data.objects["Sun"].data.energy = .58
    fill = bpy.data.objects["OverheadFill"].data
    fill.energy = 260
    fill.use_custom_distance = True
    fill.cutoff_distance = 12.6

    exporter = game.exporters.new("IO_FH_gltf2")
    exporter.name = "Update the Godot shop"
    exporter.filepath = "//../../../../../godot-arcana/art/source/shop-room-blender/arcana-shop.glb"
    settings = exporter.export_properties
    settings.export_extras = True
    settings.export_lights = True
    settings.export_animations = False
    settings.export_apply = True
    settings.check_existing = False

    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type != "VIEW_3D":
                continue
            space = area.spaces.active
            space.region_3d.view_perspective = "ORTHO"
            space.region_3d.view_rotation = scene.camera.matrix_world.to_quaternion()
            space.region_3d.view_location = (12,-8.45,.7)
            space.region_3d.view_distance = 20
            space.shading.type = "MATERIAL"
            space.overlay.show_extras = False
            space.clip_end = 300

    bpy.ops.object.select_all(action="DESELECT")
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    GAME_ASSET.parent.mkdir(parents=True, exist_ok=True)
    with bpy.context.temp_override(collection=game):
        if "FINISHED" not in bpy.ops.collection.exporter_export(index=0):
            raise RuntimeError("The Godot collection export did not finish")
    if not GAME_ASSET.is_file():
        raise RuntimeError(f"The saved Blender collection did not export to {GAME_ASSET}")
    print(f"ARCANA_ROOM_SAVED {len(game.all_objects)} objects, {board_count} individually editable boards")


if __name__ == "__main__":
    script_args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if SOURCE.exists() and "--replace-draft" not in script_args:
        raise SystemExit("Edit arcana-shop.blend directly. Use -- --replace-draft only to rerun the initial migration.")
    prepare_room()

