extends SceneTree
## Explicit authoring tool; rebuilding assets never overwrites a painted map.
const MAP = "res://scenes/ground/city_ground.tscn"
func _initialize() -> void:
 var spec = JSON.parse_string(FileAccess.get_file_as_string("res://art/export/ground/tiles.json"))
 var tiles = TileSet.new()
 tiles.tile_size = Vector2i(64,45)
 tiles.add_terrain_set()
 tiles.set_terrain_set_mode(0,TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)
 tiles.add_terrain(0)
 tiles.set_terrain_name(0,0,"상아색 판석 길")
 tiles.set_terrain_color(0,0,Color("e0d1b9"))
 tiles.add_custom_data_layer()
 tiles.set_custom_data_layer_name(0,"surface")
 tiles.set_custom_data_layer_type(0,TYPE_INT)
 var atlas = TileSetAtlasSource.new()
 atlas.texture = load("res://art/export/ground/town-ground.png")
 atlas.texture_region_size = Vector2i(64,45)
 tiles.add_source(atlas,0)
 var bits = [TileSet.CELL_NEIGHBOR_RIGHT_SIDE,TileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER,TileSet.CELL_NEIGHBOR_BOTTOM_SIDE,TileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER,TileSet.CELL_NEIGHBOR_LEFT_SIDE,TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER,TileSet.CELL_NEIGHBOR_TOP_SIDE,TileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER]
 var indices: Dictionary = {}
 for i in range(spec.tiles.size()):
  var coord = Vector2i(i%8,i/8)
  atlas.create_tile(coord)
  var entry: Dictionary = spec.tiles[i]
  atlas.get_tile_data(coord,0).set_custom_data("surface",2 if entry.kind=="paving" else (1 if entry.kind=="soil" else 0))
  if entry.kind != "paving": continue
  var mask = int(entry.mask)
  if not indices.has(mask): indices[mask] = coord
  var data = atlas.get_tile_data(coord,0)
  data.terrain_set = 0
  data.terrain = 0
  data.probability = .25 if mask==255 else 1.0
  for bit in range(8): data.set_terrain_peering_bit(bits[bit],0 if mask&(1<<bit) else -1)
 if ResourceSaver.save(tiles,"res://art/resources/ground_tileset.tres") != OK:
  quit(1)
  return
 if not FileAccess.file_exists(MAP) or "--reseed" in OS.get_cmdline_user_args():
  var plan = load("res://scenes/plaza.tscn").instantiate()
  plan.refresh_plan()
  var map = Node2D.new()
  map.name = "CityGround"
  var grass = TileMapLayer.new()
  grass.name = "Grass"
  grass.tile_set = tiles
  map.add_child(grass)
  grass.owner = map
  var soil = TileMapLayer.new()
  soil.name = "Soil"
  soil.tile_set = tiles
  map.add_child(soil)
  soil.owner = map
  var paving = TileMapLayer.new()
  paving.name = "Paving"
  paving.tile_set = tiles
  map.add_child(paving)
  paving.owner = map
  var occupied: Dictionary = {}
  for y in range(90):
   for x in range(72):
    var cell = Vector2i(x,y)
    grass.set_cell(cell,0,Vector2i(posmod(x*7+y*11,4),0))
    var surface = plan.material_at((Vector2(x,y)+Vector2(.5,.5))*16.0)
    if surface==2: occupied[cell]=true
    elif y>=48 and y<79 and absf(x+.5-36)<2.75: soil.set_cell(cell,0,Vector2i(54%8,54/8))
  var offsets = [Vector2i(1,0),Vector2i(1,1),Vector2i(0,1),Vector2i(-1,1),Vector2i(-1,0),Vector2i(-1,-1),Vector2i(0,-1),Vector2i(1,-1)]
  for cell in occupied:
   var mask = 0
   for b in [0,2,4,6]:
    if occupied.has(cell+offsets[b]): mask |= 1<<b
   for b in [1,3,5,7]:
    if mask&(1<<((b+7)%8)) and mask&(1<<((b+1)%8)) and occupied.has(cell+offsets[b]): mask |= 1<<b
   paving.set_cell(cell,0,indices[mask])
  var scene = PackedScene.new()
  scene.pack(map)
  if ResourceSaver.save(scene,MAP) != OK: quit(1); return
  map.free()
  plan.free()
 print("Saved native ground TileSet; existing painted map preserved.")
 quit()
