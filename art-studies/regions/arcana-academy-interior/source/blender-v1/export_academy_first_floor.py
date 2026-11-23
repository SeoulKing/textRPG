"""Open the academy .blend and run this script with Blender 4.5 in background mode."""

from collections import defaultdict
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[5]
OUTPUT = ROOT / "godot-arcana/art/source/academy-first-floor-blender/academy-first-floor.glb"
COLOR_ATTRIBUTE = "AcademyColor"
EXPORT_GROUPS = ("Architecture", "LowWalls", "Fixtures", "Magic", "WindowGlass")


def export_group(obj, collection):
    if collection.startswith("04 |") and " | amber pane " in obj.name:
        return "WindowGlass"
    if collection.startswith("02 |"):
        return "Architecture" if obj.name.startswith(("West exterior wall", "West coping stone", "Entrance pier")) else "LowWalls"
    if collection.startswith("03 |"):
        return "Architecture" if "threshold" in obj.name else "LowWalls"
    if collection.startswith(("01 |", "04 |", "05 |")):
        return "Architecture"
    if collection.startswith("Magic |"):
        return "Magic"
    return "Fixtures"


def vertex_color_material(name, roughness, metallic, emission=None):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.use_backface_culling = False
    shader = next(node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = metallic
    if emission:
        color, strength = emission
        shader.inputs["Emission Color"].default_value = color
        shader.inputs["Emission Strength"].default_value = strength
    return material


def material_style(source, styles):
    if source in styles:
        return styles[source]
    shader = next((node for node in source.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
    if shader is None:
        raise ValueError(f"Missing Principled material inputs for {source.name}")

    color = tuple(shader.inputs["Base Color"].default_value)
    roughness = shader.inputs["Roughness"].default_value
    metallic = shader.inputs["Metallic"].default_value
    strength = shader.inputs["Emission Strength"].default_value
    emission_color = tuple(shader.inputs["Emission Color"].default_value)
    emission = (emission_color, strength) if strength > 0 and max(emission_color[:3]) > 0 else None
    if emission:
        name = f"Academy Export | {source.name}"
    elif metallic >= 0.25:
        name, roughness, metallic = "Academy Export | Metal", 0.42, 0.52
    elif roughness <= 0.4:
        name, roughness, metallic = "Academy Export | Gloss", 0.31, 0.0
    elif roughness <= 0.65:
        name, roughness, metallic = "Academy Export | Satin", 0.56, 0.0
    else:
        name, roughness, metallic = "Academy Export | Matte", 0.82, 0.0
    material = bpy.data.materials.get(name) or vertex_color_material(name, roughness, metallic, emission)
    styles[source] = material, color
    return styles[source]


def make_batch(name, source_objects, depsgraph, styles):
    vertices, faces, normals, colors, material_ids, material_slots = [], [], [], [], [], {}
    for source in source_objects:
        evaluated = source.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        if mesh is None:
            continue
        try:
            transform = evaluated.matrix_world
            normal_matrix = transform.to_3x3().inverted().transposed()
            mirror = transform.to_3x3().determinant() < 0
            offset = len(vertices)
            vertices.extend(transform @ vertex.co for vertex in mesh.vertices)
            materials = [material_style(material, styles) for material in mesh.materials]
            for polygon in mesh.polygons:
                material, color = materials[polygon.material_index]
                loops = tuple(polygon.loop_indices)
                if mirror:
                    loops = loops[::-1]
                faces.append(tuple(offset + mesh.loops[loop].vertex_index for loop in loops))
                normals.extend((normal_matrix @ mesh.corner_normals[loop].vector).normalized() for loop in loops)
                colors.extend(color for _ in loops)
                material_ids.append(material_slots.setdefault(material, len(material_slots)))
        finally:
            evaluated.to_mesh_clear()

    batch = bpy.data.meshes.new(name)
    batch.from_pydata(vertices, [], faces)
    for material in material_slots:
        batch.materials.append(material)
    batch.polygons.foreach_set("material_index", material_ids)
    batch.polygons.foreach_set("use_smooth", [True] * len(faces))
    batch.normals_split_custom_set(normals)
    attribute = batch.color_attributes.new(name=COLOR_ATTRIBUTE, type="BYTE_COLOR", domain="CORNER")
    attribute.data.foreach_set("color", [channel for color in colors for channel in color])
    batch.update()
    result = bpy.data.objects.new(name, batch)
    print(f"ACADEMY_BATCH {name}: {len(source_objects)} objects, {len(faces)} faces, {len(material_slots)} surfaces")
    return result


def export_academy():
    source = bpy.data.collections.get("Academy | First floor")
    if source is None:
        raise ValueError("Open arcana-academy-first-floor.blend before exporting")
    groups = defaultdict(list)
    for collection in source.children:
        if collection.name.startswith(("12 |", "90 |")):
            continue
        for obj in collection.objects:
            if obj.type in {"MESH", "CURVE", "FONT", "SURFACE"} and not obj.hide_render:
                groups[export_group(obj, collection.name)].append(obj)
                # Small edge bevels occupy roughly one game pixel at the original scale.
                for modifier in obj.modifiers:
                    if modifier.type == "BEVEL" and modifier.width <= 0.08:
                        modifier.segments = 1

    styles = {}
    depsgraph = bpy.context.evaluated_depsgraph_get()
    batches = [make_batch(name, groups[name], depsgraph, styles) for name in EXPORT_GROUPS]
    bpy.ops.object.select_all(action="DESELECT")
    target = bpy.data.collections.new("Academy GLB export")
    bpy.context.scene.collection.children.link(target)
    model = bpy.data.objects.new("AcademyFirstFloor", None)
    target.objects.link(model)
    model.select_set(True)
    for batch in batches:
        target.objects.link(batch)
        batch.parent = model
        batch.select_set(True)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_name(".academy-first-floor-export.glb")
    try:
        result = bpy.ops.export_scene.gltf(
            filepath=str(temporary),
            export_format="GLB",
            use_selection=True,
            export_yup=True,
            export_vertex_color="NAME",
            export_vertex_color_name=COLOR_ATTRIBUTE,
            export_texcoords=False,
            export_tangents=False,
            export_cameras=False,
            export_lights=False,
            export_animations=False,
        )
        if "FINISHED" not in result:
            raise RuntimeError(f"Academy GLB export did not finish: {result}")
        temporary.replace(OUTPUT)
    finally:
        temporary.unlink(missing_ok=True)
    print(f"ACADEMY_GLB {OUTPUT} {OUTPUT.stat().st_size} bytes")


if __name__ == "__main__":
    export_academy()
