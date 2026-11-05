extends SceneTree
# Reference-derived palette and pixel clusters, followed by material-specific pixel retouching.
const BASE = "res://art/source/items/cooking-food-reference-v1/"
const OUT = "res://art/export/items/"
const IDS = ["grilled-mushroom", "roasted-potato", "meat-skewer"]
const CROPS = [Rect2i(40,190,484,508),Rect2i(620,242,518,430),Rect2i(1214,156,522,576)]
var ref: Image
var pixels: Array
var palette: PackedColorArray
var destination: Rect2i
var crop: Rect2i
func _initialize() -> void: call_deferred("author")
func warm(c: Color) -> bool:
 return (c.r > c.b * 1.18 and c.r > 0.055 and c.r >= c.g * 0.97) or (c.r > 0.65 and c.g > 0.55 and c.r >= c.b * 0.95)
func distance(a: Color,b: Color) -> float:
 return pow(a.r-b.r,2)*1.2+pow(a.g-b.g,2)*1.5+pow(a.b-b.b,2)
func nearest(c: Color, colors: PackedColorArray, start: int = 0) -> int:
 var found = start; var score = 1.0e9
 for i in range(start,colors.size()):
  var d = distance(c,colors[i])
  if d < score: score = d; found = i
 return found
func extract_palette() -> PackedColorArray:
 var samples = PackedColorArray()
 for y in range(crop.position.y,crop.end.y,4):
  for x in range(crop.position.x,crop.end.x,4):
   var c = ref.get_pixel(x,y)
   if warm(c): samples.append(c)
 var colors = PackedColorArray([samples[int(samples.size()/2)]])
 # Farthest-point color seeds retain highlights, char, flesh and amber transitions.
 while colors.size() < 30:
  var score = -1.0; var chosen = samples[0]
  for c in samples:
   var d = distance(c,colors[nearest(c,colors)])
   if d > score: score=d; chosen=c
  colors.append(chosen)
 for iteration in range(7):
  var sums: Array[Vector3] = []; sums.resize(30); sums.fill(Vector3.ZERO)
  var counts: Array[int] = []; counts.resize(30); counts.fill(0)
  for c in samples:
   var n = nearest(c,colors); sums[n] += Vector3(c.r,c.g,c.b); counts[n] += 1
  for i in range(30):
   if counts[i] == 0: continue
   var mean = sums[i]/float(counts[i]); var target = Color(mean.x,mean.y,mean.z)
   var best = 1.0e9
   for c in samples:
    var d = distance(c,target)
    if d < best: best=d; colors[i]=c
 var result = PackedColorArray([Color(0,0,0,0),Color.BLACK]); result.append_array(colors)
 return result
func paint(x: int,y: int,source_x: int,source_y: int) -> void:
 if x < 8 or y < 8 or x >=56 or y >=56: return
 if pixels[y][x] == 0: return
 var c = ref.get_pixel(source_x,source_y)
 if warm(c): pixels[y][x] = nearest(c,palette,2)
func line(points: Array, source: Vector2i) -> void:
 for i in range(points.size()-1):
  var a = Vector2(points[i][0],points[i][1]); var b = Vector2(points[i+1][0],points[i+1][1])
  var count = int(max(abs(a.x-b.x),abs(a.y-b.y)))
  for j in range(count+1):
   var p = a.lerp(b,float(j)/max(1,count)); paint(roundi(p.x),roundi(p.y),source.x,source.y)
func transfer() -> void:
 pixels=[]
 for y in range(64):
  var row=[]; row.resize(64); row.fill(0); pixels.append(row)
 for y in range(destination.position.y,destination.end.y):
  for x in range(destination.position.x,destination.end.x):
   var samples = PackedColorArray()
   for sy in range(3):
    for sx in range(3):
     var rx = crop.position.x+int((x-destination.position.x+(sx+0.5)/3.0)*crop.size.x/destination.size.x)
     var ry = crop.position.y+int((y-destination.position.y+(sy+0.5)/3.0)*crop.size.y/destination.size.y)
     var c=ref.get_pixel(rx,ry)
     if warm(c): samples.append(c)
   if samples.size() < 4: continue
   # Local medoid selects an actual reference color, avoiding blurred average colors.
   var chosen=samples[0]; var best=1.0e9
   for c in samples:
    var score=0.0
    for other in samples: score += distance(c,other)
    if score<best: best=score; chosen=c
   pixels[y][x]=nearest(chosen,palette,2)
func retouch(id: String) -> void:
 match id:
  "grilled-mushroom":
   # Deliberate single-pixel rib fans and broken stem fibers preserve the cap overlap.
   for path in [[[15,27],[21,29],[25,30]],[[17,25],[23,28],[26,30]],[[22,25],[25,28]],[[37,26],[34,29]],[[43,29],[37,30]],[[44,32],[38,32]]]: line(path,Vector2i(169,391))
   for path in [[[28,31],[27,35],[26,39]],[[30,31],[29,36],[28,42]],[[32,33],[31,38],[30,45]],[[29,43],[28,47]],[[19,46],[20,50]],[[41,47],[39,50]]]: line(path,Vector2i(265,462))
   line([[29,14],[31,12],[34,11]],Vector2i(286,238))
   line([[34,19],[37,17],[40,15]],Vector2i(344,284))
   line([[15,41],[17,39]],Vector2i(128,530))
  "roasted-potato":
   # Split follows the long diagonal opening, with irregular pale flesh and toasted skin.
   line([[24,43],[26,39],[30,36],[34,32]],Vector2i(829,487))
   line([[32,28],[35,26],[39,22],[40,19]],Vector2i(959,333))
   line([[28,34],[30,33],[32,34]],Vector2i(834,433))
   line([[19,28],[20,25],[22,23]],Vector2i(714,371))
   line([[43,37],[45,35]],Vector2i(1010,492))
  "meat-skewer":
   # Uneven char bands and tiny juice glints follow each reference meat face.
   line([[24,32],[27,34],[30,35]],Vector2i(1423,449))
   line([[33,23],[36,25],[39,26]],Vector2i(1516,345))
   line([[39,15],[42,17],[45,18]],Vector2i(1600,230))
   for path in [[[22,32],[23,33]],[[25,35],[26,36]],[[32,24],[33,25]],[[36,25],[37,26]],[[40,14],[41,15]],[[43,17],[44,18]]]: line(path,Vector2i(1555,224))
   line([[14,51],[18,46],[21,42]],Vector2i(1306,635))
 # Remove isolated warm specks and fill one-pixel enclosed holes in the material.
 var original = pixels.duplicate(true)
 for y in range(9,55):
  for x in range(9,55):
   var neighbors=[]
   for d in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
    if original[y+d.y][x+d.x] > 0: neighbors.append(original[y+d.y][x+d.x])
   if original[y][x] > 0 and neighbors.is_empty(): pixels[y][x]=0
   elif original[y][x] == 0 and neighbors.size()==4: pixels[y][x]=neighbors[0]
 # Strict one-pixel black silhouette only; interior char remains the extracted reference colors.
 original = pixels.duplicate(true)
 for y in range(8,56):
  for x in range(8,56):
   if original[y][x] == 0: continue
   for d in [Vector2i.LEFT,Vector2i.RIGHT,Vector2i.UP,Vector2i.DOWN]:
    if original[y+d.y][x+d.x] == 0: pixels[y][x]=1; break
func author() -> void:
 ref=Image.load_from_file(ProjectSettings.globalize_path("res://../art-studies/cooking-food-v1/concept-v1.png"))
 if ref==null: push_error("Reference missing"); quit(1); return
 DirAccess.make_dir_recursive_absolute(BASE)
 var preview=Image.create(960,300,false,Image.FORMAT_RGBA8); preview.fill(Color("fff5df"))
 var enlarged=Image.create(1536,512,false,Image.FORMAT_RGBA8); enlarged.fill(Color("182033"))
 for y in range(150,300):
  for x in range(960): preview.set_pixel(x,y,Color("26364d"))
 for i in range(3):
  var id: String=IDS[i]; crop=CROPS[i]
  var size=Vector2i(roundi(crop.size.x*48.0/crop.size.y),48) if crop.size.y>crop.size.x else Vector2i(48,roundi(crop.size.y*48.0/crop.size.x))
  destination=Rect2i(Vector2i((64-size.x)/2,(64-size.y)/2),size)
  palette=extract_palette(); transfer(); retouch(id)
  var project=PixelPenProject.new(); project.initialized(Vector2i(64,64),id+" - approved reference pixel study")
  PixelPen.state.current_project=project; project.palette.color_index=palette
  var layer: IndexedColorImage=project.active_frame.layers[0]; layer.label="Reference colors and retouched material pixel clusters"
  for y in range(64):
   for x in range(64):
    if pixels[y][x]>0: layer.set_index_on_color_map(x,y,pixels[y][x])
  var path=BASE+id+".pxpen"; project.file_path=path
  if ProjectPacker.save(project,path)!=OK: push_error("Save failed"); quit(1); return
  project=ProjectPacker.load_project(path)
  if project==null: push_error("Reopen failed"); quit(1); return
  PixelPen.state.current_project=project
  var img: Image=project.get_image(project.animation_timeline[0].frame); img.convert(Image.FORMAT_RGBA8)
  img.save_png(OUT+id+".png")
  for bg in range(2):
   for target_size in [64,40]:
    var copy: Image=img.duplicate(); copy.resize(target_size,target_size,Image.INTERPOLATE_NEAREST)
    copy.resize(target_size*2,target_size*2,Image.INTERPOLATE_NEAREST)
    preview.blend_rect(copy,Rect2i(0,0,copy.get_width(),copy.get_height()),Vector2i(i*320+(12 if target_size==64 else 180),bg*150+10+(0 if target_size==64 else 24)))
  var big: Image=img.duplicate(); big.resize(512,512,Image.INTERPOLATE_NEAREST)
  enlarged.blend_rect(big,Rect2i(0,0,512,512),Vector2i(i*512,0))
  print("PIXELPEN_ITEM_EXPORTED ",id," palette=",palette.size())
 preview.save_png(BASE+"preview.png"); enlarged.save_png(BASE+"detail-8x.png")
 PixelPen.state.current_project=null; PixelPen.state.free(); PixelPen.state=null; quit()
