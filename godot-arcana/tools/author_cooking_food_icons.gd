extends SceneTree
const BASE = "res://art/source/items/cooking-food-v2/"
const OUT = "res://art/export/items/"
const IDS = ["grilled-mushroom", "roasted-potato", "meat-skewer", "mushroom", "potato", "raw-meat", "tree-branch"]
const COLORS = ["00000000", "000000", "573027", "80432b", "a95a2c", "cb7a37", "e59e4a", "f2c277", "ffe1a2", "fff0c8", "723f33", "a9574d", "d67966", "ecaa8b"]
var pixels: Array = []
func _initialize() -> void: call_deferred("author")
func poly(points: Array, color: int) -> void:
 var shape = PackedVector2Array()
 for p in points: shape.append(Vector2(p[0],p[1]))
 for y in range(8,56):
  for x in range(8,56):
   if Geometry2D.is_point_in_polygon(Vector2(x+0.5,y+0.5),shape): pixels[y][x] = color
func stroke(points: Array, color: int, width: int = 1) -> void:
 for i in range(points.size()-1):
  var a = Vector2(points[i][0],points[i][1]); var b = Vector2(points[i+1][0],points[i+1][1])
  var n = int(max(abs(b.x-a.x),abs(b.y-a.y)))
  for j in range(n+1):
   var p = a.lerp(b,float(j)/max(1,n))
   for dy in range(width):
    for dx in range(width):
     var x = int(p.x)+dx; var y = int(p.y)+dy
     if x >= 8 and x < 56 and y >= 8 and y < 56: pixels[y][x] = color
func detail_mushroom(ox: int, oy: int, small: bool, grilled: bool) -> void:
 # Main specimen uses individually placed source pixels; smaller specimens have their own silhouette.
 var body = [[15,25],[18,23],[22,24],[24,28],[23,40],[21,43],[15,43],[13,40],[14,31]] if not small else [[6,12],[9,11],[11,13],[11,20],[9,22],[6,21],[5,19]]
 var cap = [[2,23],[3,17],[6,11],[11,7],[17,5],[23,6],[28,9],[32,14],[34,20],[33,24],[29,26],[25,25],[21,23],[16,23],[11,25],[6,26],[3,25]] if not small else [[0,12],[1,8],[4,4],[8,2],[12,3],[15,6],[16,10],[15,13],[12,14],[9,12],[6,12],[3,14],[1,14]]
 var convert = func(p: Array):
  var out = []; for v in p: out.append([v[0]+ox,v[1]+oy])
  return out
 poly(convert.call(body),7); poly(convert.call(cap),5)
 if not small:
  poly(convert.call([[4,21],[8,15],[13,12],[20,11],[27,14],[32,19],[32,23],[29,24],[24,22],[19,21],[13,22],[8,24],[5,24]]),6)
  poly(convert.call([[4,22],[8,23],[12,22],[16,21],[22,21],[27,23],[31,23],[29,25],[25,24],[20,23],[15,23],[10,25],[6,25]]),4)
  for line in [[[7,23],[13,22]],[[9,24],[15,22]],[[12,24],[16,22]],[[23,22],[28,24]],[[21,22],[25,24]],[[18,24],[17,39]],[[20,24],[19,40]],[[15,28],[15,38]],[[22,28],[21,38]]]:
   stroke(convert.call(line),8,1)
  for line in [[[5,18],[8,14],[12,12]],[[8,15],[11,12],[15,10]],[[12,11],[17,9],[21,9]],[[24,11],[27,13]],[[6,20],[9,18]],[[26,17],[29,19]]]: stroke(convert.call(line),7,1)
  if grilled:
   for line in [[[11,13],[15,10]],[[19,15],[23,12]],[[26,19],[28,18]]]: stroke(convert.call(line),3,1)
   for line in [[[11,14],[14,12]],[[20,16],[23,13]]]: stroke(convert.call(line),4,1)
  else:
   for p in [[12,15],[13,14],[21,12],[25,16],[8,19],[17,17]]: stroke(convert.call([p,[p[0]+1,p[1]]]),8,1)
 else:
  poly(convert.call([[2,10],[4,7],[7,5],[11,5],[14,8],[15,11],[12,11],[9,10],[5,11],[2,12]]),6)
  for line in [[[2,10],[5,7],[8,5]],[[3,12],[6,11]],[[10,11],[13,12]],[[7,13],[7,19]],[[9,13],[9,20]]]: stroke(convert.call(line),8,1)
  if grilled: stroke(convert.call([[7,7],[9,5]]),3,1)
func design(id: String) -> void:
 match id:
  "grilled-mushroom":
   detail_mushroom(15,9,false,true); detail_mushroom(8,33,true,true); detail_mushroom(40,33,true,true)
  "mushroom": detail_mushroom(15,10,false,false)
  "potato", "roasted-potato":
   poly([[12,27],[15,22],[19,18],[25,15],[34,14],[42,17],[48,22],[51,28],[50,36],[47,42],[41,47],[33,49],[24,48],[17,45],[13,40],[11,34]],5)
   poly([[14,27],[18,21],[24,18],[31,17],[38,18],[44,21],[48,26],[49,32],[47,38],[43,43],[38,46],[31,47],[23,45],[18,42],[14,37]],6)
   poly([[13,31],[15,26],[19,22],[24,19],[28,19],[23,22],[19,27],[17,33],[17,38],[20,43],[16,40],[14,36]],7)
   for line in [[[18,31],[20,30]],[[22,40],[24,41]],[[28,21],[30,20]],[[39,23],[41,24]],[[42,35],[44,34]],[[31,43],[34,42]],[[20,26],[22,25]],[[36,39],[38,38]],[[45,28],[46,30]]]: stroke(line,4,1)
   for line in [[[20,23],[23,21]],[[17,34],[18,37]],[[28,45],[31,46]],[[43,39],[45,37]]]: stroke(line,8,1)
   if id == "roasted-potato":
    poly([[21,32],[25,26],[27,20],[30,17],[33,22],[35,24],[39,20],[41,20],[42,24],[39,29],[38,33],[34,37],[30,41],[26,41],[26,37],[22,37]],7)
    poly([[23,32],[27,26],[29,20],[31,22],[32,27],[35,27],[39,22],[40,22],[39,27],[36,31],[35,34],[31,37],[28,40],[28,36],[25,36]],8)
    poly([[25,31],[28,27],[30,23],[31,29],[34,29],[37,26],[36,30],[33,33],[30,35],[28,34],[26,35]],9)
    for line in [[[25,29],[26,27]],[[29,30],[31,31]],[[32,33],[34,31]],[[28,37],[30,36]],[[36,28],[38,26]]]: stroke(line,7,1)
    for line in [[[18,27],[21,23]],[[20,39],[22,41]],[[40,37],[42,35]],[[37,43],[39,42]],[[44,27],[45,29]],[[23,20],[25,19]]]: stroke(line,3,1)
  "meat-skewer":
   stroke([[11,53],[52,10]],4,3); stroke([[12,52],[52,10]],7,1); stroke([[15,49],[20,44]],6,1)
   stroke([[18,46],[16,41]],4,2); stroke([[18,45],[17,42]],7,1)
   for off in [0,11,22]:
    var x = 16+off; var y = 38-off
    poly([[x,y],[x+2,y-5],[x+5,y-8],[x+10,y-9],[x+14,y-7],[x+16,y-3],[x+15,y+2],[x+12,y+5],[x+7,y+6],[x+2,y+4]],10)
    poly([[x+1,y],[x+3,y-5],[x+6,y-7],[x+10,y-8],[x+14,y-6],[x+15,y-3],[x+14,y+1],[x+11,y+4],[x+7,y+5],[x+3,y+3]],11)
    poly([[x+2,y-1],[x+4,y-5],[x+7,y-7],[x+11,y-7],[x+13,y-5],[x+11,y-3],[x+6,y-2],[x+4,y+1]],12)
    stroke([[x+4,y-4],[x+11,y-2]],3,1)
    stroke([[x+5,y-5],[x+11,y-3]],6,1)
    stroke([[x+4,y],[x+6,y+2],[x+8,y+3]],13,1)
    stroke([[x+8,y-1],[x+10,y+1],[x+11,y+2]],13,1)
    stroke([[x+3,y+1],[x+4,y+2]],8,1)
  "raw-meat":
   poly([[12,27],[16,21],[21,18],[27,18],[31,20],[36,17],[42,18],[48,22],[51,27],[51,33],[48,39],[43,43],[37,46],[30,48],[23,46],[17,43],[13,38],[11,33]],11)
   poly([[14,27],[18,22],[23,20],[28,21],[31,23],[37,19],[42,20],[47,24],[49,28],[48,34],[45,39],[40,42],[35,44],[29,45],[23,43],[18,40],[15,36]],12)
   poly([[16,27],[20,23],[24,22],[29,24],[32,25],[37,22],[41,22],[45,25],[43,28],[38,27],[34,30],[29,29],[25,27],[21,29],[17,31]],13)
   for line in [[[18,35],[21,33],[25,33],[28,35],[31,36],[35,34],[39,33],[43,34]],[[21,38],[25,37],[28,39],[32,40],[36,39]],[[23,24],[26,25]],[[37,24],[41,24]],[[42,37],[44,35]]]: stroke(line,8,1)
   for line in [[[18,32],[20,31]],[[25,30],[28,31]],[[33,31],[35,30]],[[39,29],[42,30]],[[27,42],[30,43]],[[37,41],[40,39]]]: stroke(line,10,1)
  "tree-branch":
   poly([[11,50],[14,44],[20,39],[25,34],[30,30],[35,25],[41,19],[48,13],[51,12],[52,14],[49,18],[44,22],[39,28],[34,32],[29,36],[24,41],[19,46],[15,52]],5)
   poly([[13,48],[16,44],[21,40],[27,34],[32,30],[38,25],[44,19],[49,15],[50,15],[46,20],[41,25],[36,30],[30,35],[25,40],[19,46],[15,50]],6)
   stroke([[17,45],[22,40],[28,35],[34,30],[40,24],[47,18]],8,1)
   stroke([[16,48],[22,43],[26,40]],4,1); stroke([[30,33],[35,29],[39,26]],4,1)
   stroke([[27,34],[24,29],[22,25]],5,3); stroke([[27,34],[24,29],[23,26]],7,1)
   stroke([[35,28],[37,23],[40,20]],5,2); stroke([[35,28],[38,24]],7,1)
func add_outline() -> void:
 var original = pixels.duplicate(true)
 for y in range(8,56):
  for x in range(8,56):
   if original[y][x] == 0: continue
   for d in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
    if original[y+d.y][x+d.x] == 0:
     pixels[y][x] = 1
     break

func author() -> void:
 DirAccess.make_dir_recursive_absolute(BASE); DirAccess.make_dir_recursive_absolute(OUT)
 var preview = Image.create(7*192,320,false,Image.FORMAT_RGBA8); preview.fill(Color("fffaf0"))
 for y in range(160,320):
  for x in range(7*192): preview.set_pixel(x,y,Color("26364d"))
 for i in range(IDS.size()):
  var id: String = IDS[i]; var path = BASE+id+".pxpen"; var project: PixelPenProject
  if not FileAccess.file_exists(path):
   pixels = []; for y in range(64):
    var row = []; row.resize(64); row.fill(0); pixels.append(row)
   design(id); add_outline()
   project = PixelPenProject.new(); project.initialized(Vector2i(64,64),id+" - hand-designed inventory icon")
   PixelPen.state.current_project = project
   var palette = PackedColorArray(); for c in COLORS: palette.append(Color(c))
   project.palette.color_index = palette
   var layer: IndexedColorImage = project.active_frame.layers[0]; layer.label = "Hand-designed material silhouette and details"
   for y in range(64):
    for x in range(64):
     if pixels[y][x] > 0: layer.set_index_on_color_map(x,y,pixels[y][x])
   project.file_path = path
   if ProjectPacker.save(project,path) != OK: push_error("Save failed: "+id); quit(1); return
  project = ProjectPacker.load_project(path)
  if project == null: push_error("Reopen failed: "+id); quit(1); return
  PixelPen.state.current_project = project
  var img: Image = project.get_image(project.animation_timeline[0].frame); img.convert(Image.FORMAT_RGBA8)
  if img.save_png(OUT+id+".png") != OK: push_error("Export failed: "+id); quit(1); return
  for y in range(64):
   for x in range(64):
    var alpha = img.get_pixel(x,y).a
    if alpha != 0.0 and (alpha != 1.0 or x < 8 or x >= 56 or y < 8 or y >= 56): push_error("Invalid alpha or margin: "+id); quit(1); return
  for bg in range(2):
   for size in [64,40]:
    var copy: Image = img.duplicate(); copy.resize(size,size,Image.INTERPOLATE_NEAREST); copy.resize(size*2,size*2,Image.INTERPOLATE_NEAREST)
    preview.blend_rect(copy,Rect2i(0,0,size*2,size*2),Vector2i(i*192+(0 if size==64 else 104),bg*160+16+(0 if size==64 else 48)))
  print("PIXELPEN_ITEM_EXPORTED ",id)
 preview.save_png(BASE+"preview.png")
 PixelPen.state.current_project = null; PixelPen.state.free(); PixelPen.state = null; quit()
