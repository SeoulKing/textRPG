@tool
extends RefCounted
## Native TileMapLayer data is the only surface placement source.
const MAP = "res://scenes/ground/city_ground.tscn"
const ATLAS = "res://art/export/ground/town-ground.png"
static var _stamp: int = -1
static var _cells: Dictionary = {}
static var _underlay: Dictionary = {}
static var _image: ImageTexture
static var _atlas: Texture2D
static var _size = Vector2i(72,90)
static func refresh() -> bool:
 # Export remaps .tscn to .scn: FileAccess cannot see the original path.
 if not ResourceLoader.exists(MAP,"PackedScene"): return false
 var stamp = FileAccess.get_modified_time(MAP) if Engine.is_editor_hint() else 0
 if stamp == _stamp: return false
 _stamp = stamp
 _cells.clear()
 _underlay.clear()
 var packed = ResourceLoader.load(MAP,"PackedScene",ResourceLoader.CACHE_MODE_REPLACE) as PackedScene
 if packed == null: return false
 var source = packed.instantiate()
 _size = Vector2i(72,90)
 for layer in source.find_children("*","TileMapLayer",true,false):
  for cell in layer.get_used_cells():
   if cell.x<0 or cell.y<0: continue
   var at = layer.get_cell_atlas_coords(cell)
   if _cells.has(cell): _underlay[cell] = _cells[cell]
   _cells[cell] = Vector3i(at.x,at.y,int(layer.get_cell_tile_data(cell).get_custom_data("surface")))
   _size = _size.max(cell+Vector2i.ONE)
 source.free()
 var data = Image.create(_size.x,_size.y,false,Image.FORMAT_RGBA8)
 for y in range(_size.y):
  for x in range(_size.x):
   var cell = Vector2i(x,y)
   var entry: Vector3i = _cells.get(cell,Vector3i(posmod(x*7+y*11,4),0,0))
   var below: Vector3i = _underlay.get(cell,Vector3i(posmod(x*7+y*11,4),0,0))
   data.set_pixel(x,y,Color8(entry.x,entry.y,entry.z,below.x+below.y*8))
 _image = ImageTexture.create_from_image(data)
 _atlas = load(ATLAS)
 return true
static func bind(mat: ShaderMaterial) -> void:
 refresh()
 if _image == null: return
 mat.set_shader_parameter("authored_ground",true)
 mat.set_shader_parameter("ground_cells",_image)
 mat.set_shader_parameter("ground_atlas",_atlas)
 mat.set_shader_parameter("ground_map_size",Vector2(_size))
static func surface_at(point: Vector2) -> int:
 refresh()
 var cell = Vector2i(floor(point.x),floor(point.y))
 if not _cells.has(cell): return -1
 var entry: Vector3i = _cells[cell]
 return entry.z
