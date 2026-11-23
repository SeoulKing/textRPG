"""Split the Blender shop export into independently importable Godot models."""

from copy import deepcopy
import hashlib
import json
from pathlib import Path
import struct


ROOM_DIRECTORY = (
    Path(__file__).resolve().parents[2] / "godot-arcana/art/source/shop-room-blender"
)
TRANSFORM_KEYS = ("translation", "rotation", "scale", "matrix")


def read_glb(path):
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", data)
    if (magic, version, length) != (b"glTF", 2, len(data)):
        raise ValueError(f"Invalid glTF 2.0 binary: {path}")

    chunks = {}
    offset = 12
    while offset < length:
        size, kind = struct.unpack_from("<I4s", data, offset)
        offset += 8
        chunks[kind] = data[offset : offset + size]
        offset += size
    document = json.loads(chunks[b"JSON"])
    if len(document["buffers"]) != 1 or "uri" in document["buffers"][0]:
        raise ValueError("Expected one embedded buffer in the shop export")
    return document, chunks[b"BIN\0"]


def write_glb(path, document, binary):
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    encoded += b" " * (-len(encoded) % 4)
    padded_binary = bytes(binary) + b"\0" * (-len(binary) % 4)
    data = (
        struct.pack("<4sII", b"glTF", 2, 28 + len(encoded) + len(padded_binary))
        + struct.pack("<I4s", len(encoded), b"JSON")
        + encoded
        + struct.pack("<I4s", len(padded_binary), b"BIN\0")
        + padded_binary
    )
    if not path.exists() or path.read_bytes() != data:
        path.write_bytes(data)


class ShopPart:
    def __init__(self, source, binary):
        self.source = source
        self.source_binary = binary
        self.document = {"asset": deepcopy(source["asset"]), "scene": 0}
        self.binary = bytearray()
        self.index_map = {}
        self.extensions_used = set()

    def copy_resource(self, table, index, rewrite=None):
        table_map = self.index_map.setdefault(table, {})
        if index not in table_map:
            target = self.document.setdefault(table, [])
            table_map[index] = len(target)
            resource = deepcopy(self.source[table][index])
            target.append(resource)
            if rewrite is not None:
                rewrite(resource)
        return table_map[index]

    def copy_view(self, index):
        def rewrite(view):
            if view["buffer"] != 0:
                raise ValueError("Expected every buffer view to use the embedded buffer")
            offset = view.get("byteOffset", 0)
            self.binary.extend(b"\0" * (-len(self.binary) % 4))
            view["byteOffset"] = len(self.binary)
            self.binary.extend(self.source_binary[offset : offset + view["byteLength"]])

        return self.copy_resource("bufferViews", index, rewrite)

    def copy_accessor(self, index):
        def rewrite(accessor):
            if "bufferView" in accessor:
                accessor["bufferView"] = self.copy_view(accessor["bufferView"])
            if "sparse" in accessor:
                for field in ("indices", "values"):
                    item = accessor["sparse"][field]
                    item["bufferView"] = self.copy_view(item["bufferView"])

        return self.copy_resource("accessors", index, rewrite)

    def copy_texture(self, index):
        def rewrite_image(image):
            image["bufferView"] = self.copy_view(image["bufferView"])

        def rewrite(texture):
            texture["source"] = self.copy_resource("images", texture["source"], rewrite_image)
            if "sampler" in texture:
                texture["sampler"] = self.copy_resource("samplers", texture["sampler"])

        return self.copy_resource("textures", index, rewrite)

    def copy_material(self, index):
        def rewrite_textures(properties):
            for key, value in properties.items():
                if not isinstance(value, dict):
                    continue
                if key.endswith("Texture") and "index" in value:
                    value["index"] = self.copy_texture(value["index"])
                else:
                    rewrite_textures(value)

        def rewrite(material):
            self.extensions_used.update(material.get("extensions", {}))
            rewrite_textures(material)

        return self.copy_resource("materials", index, rewrite)

    def copy_mesh(self, index):
        def rewrite(mesh):
            for primitive in mesh["primitives"]:
                if primitive.get("extensions"):
                    raise ValueError("Compressed or extended shop mesh primitives are unsupported")
                for attribute in [primitive["attributes"], *primitive.get("targets", [])]:
                    for name, accessor in attribute.items():
                        attribute[name] = self.copy_accessor(accessor)
                if "indices" in primitive:
                    primitive["indices"] = self.copy_accessor(primitive["indices"])
                if "material" in primitive:
                    primitive["material"] = self.copy_material(primitive["material"])

        return self.copy_resource("meshes", index, rewrite)

    def copy_node(self, index):
        def rewrite(node):
            if "skin" in node or "camera" in node:
                raise ValueError("Shop parts must not contain skins or cameras")
            if "mesh" in node:
                node["mesh"] = self.copy_mesh(node["mesh"])
            if "children" in node:
                node["children"] = [self.copy_node(child) for child in node["children"]]
            if node.get("extensions"):
                raise ValueError("Shop part extensions must be attached to materials")

        return self.copy_resource("nodes", index, rewrite)

    def save(self, path, name, roots):
        self.document["scenes"] = [{"name": name, "nodes": roots}]
        self.document["buffers"] = [{"byteLength": len(self.binary)}]
        if self.extensions_used:
            self.document["extensionsUsed"] = sorted(self.extensions_used)
        required = self.extensions_used.intersection(self.source.get("extensionsRequired", []))
        if required:
            self.document["extensionsRequired"] = sorted(required)
        write_glb(path, self.document, self.binary)


def rebase_display_object(node, room):
    # These props are siblings of the translated and uniformly scaled room in Blender.
    # Keep their position relative to the unscaled room used by Godot.
    room_scale = room.get("scale", [1, 1, 1])
    if (
        "matrix" in room or "matrix" in node
        or room.get("rotation", [0, 0, 0, 1]) != [0, 0, 0, 1]
        or room_scale[0] <= 0 or any(scale != room_scale[0] for scale in room_scale)
    ):
        raise ValueError("Display props require an unrotated, uniformly scaled room root")
    room_position = room.get("translation", [0, 0, 0])
    object_position = node.get("translation", [0, 0, 0])
    node["translation"] = [
        (value - origin) / room_scale[0]
        for value, origin in zip(object_position, room_position)
    ]
    node["scale"] = [scale / room_scale[0] for scale in node.get("scale", [1, 1, 1])]


def split_shop():
    source, binary = read_glb(ROOM_DIRECTORY / "arcana-shop.glb")
    output = ROOM_DIRECTORY / "parts"
    output.mkdir(exist_ok=True)
    nodes = source["nodes"]
    scene_roots = source["scenes"][source["scene"]]["nodes"]

    def by_name(indices):
        return {nodes[index]["name"]: index for index in indices}

    room_index = by_name(scene_roots)["ArcanaShop"]
    room = nodes[room_index]
    room_parts = by_name(room["children"])
    lamp = nodes[room_parts["Floor Lamp - move this"]]
    lamp["children"] = [
        index for index in lamp["children"] if nodes[index]["name"] != "Floor lamp | warm light"
    ]
    furniture = by_name(nodes[room_parts["Furniture"]]["children"])
    walls = by_name(nodes[room_parts["Walls"]]["children"])
    wall_assets = {
        "rear-wall": "RearWall", "west-wall": "WestWall", "right-wall": "RightWall",
        "front-left-wall": "FrontLeftWall", "front-right-wall": "FrontRightWall",
    }
    assets = {
        "floor": room_parts["Floor"],
        "floor-lamp": room_parts["Floor Lamp - move this"],
        "counter": furniture["Counter"],
        "herb-cabinet": furniture["HerbCabinet"],
        "herb-cabinet-2": furniture["HerbCabinet2"],
        "potion-cabinet": furniture["PotionCabinet"],
        "travel-cabinet": furniture["TravelCabinet"],
        "travel-cabinet-2": furniture["TravelCabinet2"],
        **{file: walls[name] for file, name in wall_assets.items()},
    }
    for file, node_index in assets.items():
        part = ShopPart(source, binary)
        index = part.copy_node(node_index)
        root = part.document["nodes"][index]
        for key in TRANSFORM_KEYS:
            root.pop(key, None)
        part.save(output / f"{file}.glb", root["name"], [index])

    entrance = []
    shadows = []
    for name, node_index in walls.items():
        if name in wall_assets.values():
            continue
        if nodes[node_index].get("extras", {}).get("shadow_only"):
            shadows.append(node_index)
        else:
            entrance.append(node_index)

    displays = [index for index in scene_roots if index != room_index]
    for file, name, roots in (
        ("entrance", "Entrance", entrance),
        ("sun-shadow-casters", "SunShadowCasters", shadows),
        ("display-potions", "DisplayPotions", displays),
    ):
        part = ShopPart(source, binary)
        copied = [part.copy_node(index) for index in roots]
        if file == "display-potions":
            bottles = {}
            for index in copied:
                node = part.document["nodes"][index]
                rebase_display_object(node, room)
                name = node["name"].rsplit(" ", 1)[0]
                bottles.setdefault(name, []).append(index)
            copied = []
            part_nodes = part.document["nodes"]
            for bottle_name, children in bottles.items():
                copied.append(len(part_nodes))
                part_nodes.append({"name": bottle_name, "children": children})
        part.save(output / f"{file}.glb", name, copied)

    print(f"Wrote {len(assets) + 3} shop assets to {output}")
    signature = room["extras"]["layout_signature"].encode("utf-8")
    print(f"Room layout signature: {hashlib.sha256(signature).hexdigest()}")


if __name__ == "__main__":
    split_shop()
