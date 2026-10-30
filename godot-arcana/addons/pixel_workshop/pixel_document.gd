@tool
extends RefCounted
## Palette indices, shared layers, integer pose sampling, then persistent pixel patches.
const SOURCE = "res://art/source/monsters/slime.pixel.json"
const ATLAS = "res://art/export/monsters/slime.png"
const FRAMES = "res://art/export/monsters/slime.tres"
const COLUMNS = 16

static func read_source() -> Dictionary:
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(SOURCE))
	return parsed if parsed is Dictionary else {}

static func layer_image(data: Dictionary, layer: String) -> Image:
	var size = data.size
	var image = Image.create(int(size[0]),int(size[1]),false,Image.FORMAT_RGBA8)
	var rows: Array = data.layers[layer]
	for y in range(image.get_height()):
		for x in range(image.get_width()):
			image.set_pixel(x,y,Color(data.palette[rows[y][x]]))
	return image

static func frame_image(data: Dictionary, animation: String, frame: int, patches: bool = true, lighting: int = 0) -> Image:
	var spec: Dictionary = data.animations[animation]
	var t = float(frame)/float(spec.count if spec.loop else maxi(1,int(spec.count)-1))
	var keys: Array = spec.keys
	var a: Dictionary = keys[0]
	var b: Dictionary = keys[-1]
	for i in range(1,keys.size()):
		if t <= float(keys[i].t):
			a = keys[i-1]
			b = keys[i]
			break
	var u = clampf((t-float(a.t))/maxf(.0001,float(b.t)-float(a.t)),0,1)
	u = u*u*(3.0-2.0*u)
	var sx = lerpf(float(a.scale[0]),float(b.scale[0]),u)
	var sy = lerpf(float(a.scale[1]),float(b.scale[1]),u)
	var lift = lerpf(float(a.lift),float(b.lift),u)
	var lean = lerpf(float(a.lean),float(b.lean),u)
	var dissolve = lerpf(float(a.dissolve),float(b.dissolve),u)
	var face = str(a.face if u < .5 else b.face)
	if animation == "idle" and frame in [20,21]: face = "blink"
	var size = Vector2i(int(data.size[0]),int(data.size[1]))
	var foot = Vector2(float(data.foot[0]),float(data.foot[1]))
	var image = Image.create(size.x,size.y,false,Image.FORMAT_RGBA8)
	var layers: Array = ["body","crest","shine","face_"+face]
	if lighting > 0: layers.erase("shine")
	for y in range(size.y):
		for x in range(size.x):
			var source_y = int(round((float(y)-foot.y+lift)/sy+foot.y))
			var source_x = int(round((float(x)-foot.x-lean*(foot.y-float(y))/50.0)/sx+foot.x))
			if source_x < 0 or source_y < 0 or source_x >= size.x or source_y >= size.y: continue
			var color = "."
			for layer in layers:
				var symbol: String = data.layers[layer][source_y][source_x]
				if symbol != ".": color = symbol
			# Stable ordered dissolve; no random redraw or translucent edge pixels.
			if dissolve > 0 and float((x*3+y*5)%17)/17.0 < dissolve: color = "."
			if lighting == 2:
				# Data: +X right, +Y up, +Z toward camera.
				var nx = (float(source_x)-31.5)/27.0
				var ny = (55.0-float(source_y))/21.0
				if data.layers.crest[source_y][source_x] != ".":
					nx = (float(source_x)-32.0)/7.5
					ny = (30.0-float(source_y))/7.0
				var nz = sqrt(maxf(.06,1.0-nx*nx-ny*ny))
				# Inverse transpose of the color pose scale and shear.
				var normal = Vector3(nx/sx,(ny-lean*nx/(50.0*sx))/sy,nz).normalized()
				var gloss = 0.0 if color in [".","o"] else .75*(1.0-dissolve)
				image.set_pixel(x,y,Color(normal.x*.5+.5,normal.y*.5+.5,normal.z*.5+.5,gloss))
			else:
				image.set_pixel(x,y,Color(data.palette[color]))
	var patch_key = animation+"/"+str(frame)
	if patches and data.patches.has(patch_key):
		for point in data.patches[patch_key]:
			var xy = point.split(",")
			var px = int(xy[0])
			var py = int(xy[1])
			var symbol: String = data.patches[patch_key][point]
			if lighting == 2:
				var surface = image.get_pixel(px,py)
				surface.a = 0.0 if symbol in [".","o"] else surface.a
				image.set_pixel(px,py,surface)
			else:
				image.set_pixel(px,py,Color(data.palette[symbol]))
	return image

static func bake(data: Dictionary) -> Error:
	var width = int(data.size[0])
	var height = int(data.size[1])
	var total = 0
	for spec in data.animations.values(): total += int(spec.count)
	var atlas = Image.create(width*COLUMNS,height*ceili(float(total)/COLUMNS),false,Image.FORMAT_RGBA8)
	var text = "[gd_resource type=\"SpriteFrames\" load_steps=%d format=3]\n\n" % (total+2)
	text += "[ext_resource type=\"Texture2D\" path=\"%s\" id=\"1\"]\n\n" % ATLAS
	var blocks: Array[String] = []
	var index = 0
	for animation in data.animations:
		var spec: Dictionary = data.animations[animation]
		var frames: Array[String] = []
		for f in range(int(spec.count)):
			var point = Vector2i(index%COLUMNS*width,int(index/COLUMNS)*height)
			atlas.blit_rect(frame_image(data,animation,f),Rect2i(0,0,width,height),point)
			text += "[sub_resource type=\"AtlasTexture\" id=\"Frame_%d\"]\natlas = ExtResource(\"1\")\nregion = Rect2(%d, %d, %d, %d)\n\n" % [index,point.x,point.y,width,height]
			frames.append('{"duration": 1.0, "texture": SubResource("Frame_%d")}' % index)
			index += 1
		blocks.append('{"frames": [%s], "loop": %s, "name": &"%s", "speed": %s}' % [", ".join(frames),str(spec.loop),animation,str(spec.fps)])
	text += "[resource]\nanimations = [%s]\n" % ",\n".join(blocks)
	var error = atlas.save_png(ATLAS)
	if error != OK: return error
	var file = FileAccess.open(FRAMES,FileAccess.WRITE)
	if file == null: return FileAccess.get_open_error()
	file.store_string(text)
	return bake_lighting(data)


# Rebuild lighting without rewriting the original color assets.
static func bake_lighting(data: Dictionary) -> Error:
	var width = int(data.size[0])
	var height = int(data.size[1])
	var total = 0
	for spec in data.animations.values(): total += int(spec.count)
	for mode in [1,2]:
		var atlas = Image.create(width*COLUMNS,height*ceili(float(total)/COLUMNS),false,Image.FORMAT_RGBA8)
		var index = 0
		for animation in data.animations:
			for frame in range(int(data.animations[animation].count)):
				var point = Vector2i(index%COLUMNS*width,int(index/COLUMNS)*height)
				atlas.blit_rect(frame_image(data,animation,frame,true,mode),Rect2i(0,0,width,height),point)
				index += 1
		# Embedded lossless data avoids import channel conversion.
		var path = "res://art/export/monsters/slime-lit.res" if mode == 1 else "res://art/export/monsters/slime-surface.res"
		var error = ResourceSaver.save(ImageTexture.create_from_image(atlas),path)
		if error != OK: return error
	return OK
