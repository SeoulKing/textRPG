extends SceneTree
## First authoring only. Paint indexed layers with PixelPen; never overwrite sources.
const ROOT = "D:/BANG/project/textRPG/"
const SOURCE = ROOT + "godot-arcana/art/source/heroine/run-stride-v11/"
const TARGET = ROOT + "godot-arcana/art/source/heroine/run-grounded-v13/"
var pixels: PackedByteArray
var reference: PackedByteArray

func _initialize() -> void:
	call_deferred("run")

func put(x: int, y: int, value: int, far: bool = false) -> void:
	if x < 0 or y < 0 or x >= 96 or y >= 136 or value == 0:
		return
	if far:
		value = {13:16,16:18,25:13,32:13}.get(value,value)
	pixels[y*96+x] = value

func segment(a: Vector2, b: Vector2, width: float, far: bool) -> void:
	var axis = b-a
	var length = axis.length()
	var along = axis/length
	var across = Vector2(along.y,-along.x)
	for y in range(maxi(0,int(minf(a.y,b.y)-width)), mini(136,int(maxf(a.y,b.y)+width+1))):
		for x in range(maxi(0,int(minf(a.x,b.x)-width)), mini(96,int(maxf(a.x,b.x)+width+1))):
			var delta = Vector2(x,y)-a
			var v = delta.dot(along)
			var u = delta.dot(across)
			if v < -1.0 or v > length+1.0 or absf(u) > width/2.0:
				continue
			# Sample the actual standing stocking cross-section: 11 native pixels.
			# Retain its dark edge, broad midtone and subtle material variation.
			var sx = clampi(41+roundi((u/width+0.5)*10.0),41,51)
			var sy = clampi(97+roundi(clampf(v/length,0.0,1.0)*6.0),97,103)
			var value = int(reference[sy*96+sx])
			if value == 0:
				value = 16
			if absf(u) > width/2.0-0.7:
				value = 20
			put(x,y,value,far)

func joint(center: Vector2, radius: float, far: bool) -> void:
	for y in range(int(center.y-radius)-1,int(center.y+radius)+2):
		for x in range(int(center.x-radius)-1,int(center.x+radius)+2):
			var distance = Vector2(x,y).distance_to(center)
			if distance <= radius:
				put(x,y,20 if distance>radius-0.8 else 16,far)

func boot(anchor: Vector2, angle: float, far: bool) -> void:
	# Exact standing boot patch, including the broad toe, gold cuff and heel.
	# Inverse rotation uses nearest indexed pixels; no new colours or smoothing.
	for y in range(maxi(0,int(anchor.y)-20),mini(136,int(anchor.y)+24)):
		for x in range(maxi(0,int(anchor.x)-24),mini(96,int(anchor.x)+24)):
			var local = (Vector2(x,y)-anchor).rotated(-angle)+Vector2(46,105)
			var sx = roundi(local.x)
			var sy = roundi(local.y)
			if sx >= 41 and sx <= 63 and sy >= 105 and sy <= 115:
				put(x,y,int(reference[sy*96+sx]),far)

func run() -> void:
	var output = TARGET+"pixelpen/run_e.pxpen"
	if FileAccess.file_exists(output):
		push_error("Preserve the existing candidate; use a new candidate directory.");quit(1);return
	for folder in ["pixelpen","native-frames/run_e","preview"]:
		DirAccess.make_dir_recursive_absolute(TARGET+folder)
	var idle = ProjectPacker.load_project(SOURCE+"pixelpen/idle_e.pxpen")
	var project = ProjectPacker.load_project(SOURCE+"pixelpen/run_e.pxpen")
	if idle == null or project == null:
		push_error("PixelPen source failed to load");quit(1);return
	reference = idle.animation_timeline[0].frame.layers[0].colormap.get_data().duplicate()
	var idle_image = idle.get_image(idle.animation_timeline[0].frame)
	idle_image.convert(Image.FORMAT_RGBA8)
	var board = Image.create(768,408,false,Image.FORMAT_RGBA8)
	board.fill(Color("8292a7"))
	# Cuff targets: contact, weight-bearing, toe-off, flight and recovery.
	var cuffs = [Vector2(57,105),Vector2(49,105),Vector2(39,102),Vector2(35,95),Vector2(40,92),Vector2(49,94),Vector2(57,98),Vector2(61,102)]
	var changes = 0
	for frame in range(8):
		var layer = project.animation_timeline[frame].frame.layers[0]
		var original: PackedByteArray = layer.colormap.get_data().duplicate()
		var old_image = project.get_image(project.animation_timeline[frame].frame)
		old_image.convert(Image.FORMAT_RGBA8)
		board.blend_rect(idle_image,Rect2i(0,0,96,136),Vector2i(frame*96,0))
		board.blend_rect(old_image,Rect2i(0,0,96,136),Vector2i(frame*96,136))
		pixels = PackedByteArray();pixels.resize(96*136);pixels.fill(0)
		for limb in [0,1]:
			var phase = (frame+limb*4)%8
			var far = limb == 0
			var hip = Vector2(46 if far else 49,91)
			var cuff: Vector2 = cuffs[phase]
			var delta = cuff-hip
			var distance = minf(delta.length(),23.8)
			var axis = delta.normalized()
			# Equal 12px thigh and shin; bend knee toward the running direction.
			var normal = Vector2(axis.y,-axis.x)
			var knee = hip+axis*distance*0.5+normal*sqrt(maxf(0.0,144.0-distance*distance*0.25))
			segment(hip,knee,11.0,far)
			joint(knee,5.0,far)
			segment(knee,cuff+Vector2(0,1),10.0,far)
			var calf = cuff-knee
			var boot_angle = clampf(calf.angle()-PI*0.5,-0.4,1.25)
			# Contact foot is flatter; the cuff still shares exactly the calf endpoint.
			if phase in [0,1]:
				boot_angle = 0.0
			joint(cuff,4.0,far)
			boot(cuff,boot_angle,far)
		# Preserve the existing dress and its per-column occlusion edge.
		for x in range(96):
			var hem = 88
			for y in range(84,101):
				var value = original[y*96+x]
				if (value>=1 and value<=9) or value in [14,29,30]:
					hem=y+1
			for y in range(hem+1):
				if original[y*96+x] != 0:
					pixels[y*96+x]=original[y*96+x]
		for i in range(pixels.size()):
			if pixels[i]!=original[i]:
				layer.set_index_on_color_map(i%96,int(i/96),pixels[i])
				changes+=1
	project.file_path=output
	if ProjectPacker.save(project,output)!=OK:
		push_error("PixelPen save failed");quit(1);return
	project=ProjectPacker.load_project(output)
	if project==null:
		push_error("PixelPen reload failed");quit(1);return
	for frame in range(8):
		var result=project.get_image(project.animation_timeline[frame].frame)
		result.convert(Image.FORMAT_RGBA8)
		result.save_png(TARGET+"native-frames/run_e/frame-%02d.png"%frame)
		board.blend_rect(result,Rect2i(0,0,96,136),Vector2i(frame*96,272))
	board.resize(1536,816,Image.INTERPOLATE_NEAREST)
	board.save_png(TARGET+"preview/idle-before-after.png")
	idle_image.resize(576,816,Image.INTERPOLATE_NEAREST)
	idle_image.save_png(TARGET+"preview/idle-reference-6x.png")
	print("PixelPen saved/reopened run_e: 8 frames, ",changes," indexed edits. Idle stocking width 11; shin width 10; shared cuff pivot (46,105); connected knees and 12px leg segments.")
	PixelPen.state.free();PixelPen.state=null
	quit()
