extends SceneTree
## First authoring only; subsequent edits belong to the saved PixelPen projects.
const ROOT = "D:/BANG/project/textRPG/"
const SOURCE = ROOT + "godot-arcana/art/source/heroine/reference-bright-v10/"
const TARGET = ROOT + "godot-arcana/art/source/heroine/run-stride-v11/"
const DIRS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"]
var pixels: PackedByteArray

func _initialize() -> void:
	call_deferred("run")

func dot(x: int, y: int, color: int) -> void:
	if x >= 0 and x < 96 and y >= 0 and y < 136:
		pixels[y * 96 + x] = color

func stroke(a: Vector2, b: Vector2, radius: float, color: int) -> void:
	for y in range(maxi(0, int(minf(a.y,b.y)-radius-1)), mini(136,int(maxf(a.y,b.y)+radius+2))):
		for x in range(maxi(0,int(minf(a.x,b.x)-radius-1)), mini(96,int(maxf(a.x,b.x)+radius+2))):
			var point = Vector2(x,y)
			var t = clampf((point-a).dot(b-a)/maxf((b-a).length_squared(),1.0),0.0,1.0)
			if point.distance_to(a+(b-a)*t) <= radius:
				dot(x,y,color)

func leg(hip: Vector2, knee: Vector2, ankle: Vector2, facing: float, far: bool) -> void:
	# Original one-pixel outline, narrow stocking and small taupe boot.
	stroke(hip,knee,3.5,19)
	stroke(knee,ankle,3.0,19)
	stroke(hip+Vector2(0,-1),knee,2.5,18 if far else 16)
	stroke(knee,ankle,2.0,16 if far else 15)
	stroke(knee+Vector2(-1,0),ankle+Vector2(-1,0),0.5,15 if far else 12)
	var toe = ankle+Vector2(facing*3,2)
	stroke(ankle-Vector2(0,3),ankle,2.8,18)
	stroke(ankle,toe,2.8,18)
	stroke(ankle-Vector2(0,3),ankle,1.8,16 if far else 13)
	stroke(ankle,toe,1.6,15 if far else 12)
	stroke(ankle-Vector2(1,3),ankle+Vector2(1,-3),0.5,32)
	stroke(toe+Vector2(-1,1),toe+Vector2(1,1),0.5,16)

func run() -> void:
	for folder in ["pixelpen", "native-frames", "preview"]:
		DirAccess.make_dir_recursive_absolute(TARGET+folder)
	var comparison = Image.create(96*8,136*16,false,Image.FORMAT_RGBA8)
	comparison.fill(Color("727e92"))
	var edit_count = 0
	for row in range(8):
		var direction: String = DIRS[row]
		var path = SOURCE+"pixelpen/run_"+direction+".pxpen"
		var project = ProjectPacker.load_project(path)
		if project == null:
			push_error("Cannot load "+path);quit(1);return
		var sign_x: float = 1.0 if direction in ["e","se","ne"] else -1.0 if direction in ["w","sw","nw"] else 0.0
		var depth: float = 1.0 if direction in ["s","se","sw"] else -1.0 if direction in ["n","ne","nw"] else 0.0
		var lateral: float = 1.0 if direction in ["e","w"] else 0.72
		for frame in range(8):
			var layer = project.animation_timeline[frame].frame.layers[0]
			var original: PackedByteArray = layer.colormap.get_data().duplicate()
			var before = project.get_image(project.animation_timeline[frame].frame)
			before.convert(Image.FORMAT_RGBA8)
			comparison.blit_rect(before,Rect2i(0,0,96,136),Vector2i(frame*96,row*272))
			pixels = PackedByteArray();pixels.resize(96*136);pixels.fill(0)
			# Eight distinct limb poses: contact, compression, toe-off, flight.
			# Opposite leg is half a cycle ahead; preserve the original torso/skirt.
			var ankles = [Vector2(10,112),Vector2(3,112),Vector2(-8,111),Vector2(-12,103),Vector2(-7,101),Vector2(0,103),Vector2(8,105),Vector2(13,108)]
			var knees = [Vector2(6,101),Vector2(6,103),Vector2(-3,103),Vector2(-2,101),Vector2(5,99),Vector2(9,100),Vector2(11,101),Vector2(10,101)]
			for limb in [0,1]:
				var phase: int = (frame+limb*4)%8
				var side: float = -3.0 if limb == 0 else 3.0
				var ax: float = ankles[phase].x
				var kx: float = knees[phase].x
				var spread = side*(1.0-absf(sign_x)*0.55)
				var hip = Vector2(48+spread,91)
				var ankle = Vector2(48+spread+sign_x*ax*lateral,ankles[phase].y+depth*ax*0.22)
				ankle.y = minf(ankle.y,112.0)
				var knee = Vector2(48+spread+sign_x*kx*lateral,knees[phase].y+depth*kx*0.2)
				if sign_x == 0:
					ankle.x += side*absf(ax)*0.12
					knee.x += side*0.4
				leg(hip,knee,ankle,sign_x if sign_x != 0 else signf(side)*0.4,limb==0)
			# Follow each column's actual dress hem, keeping its outline intact.
			# Skin/hair/torso are byte-identical; no detached-head or row shear edits.
			for x in range(96):
				var hem = 88
				for y in range(84,101):
					var value = original[y*96+x]
					if (value >= 1 and value <= 9) or value in [14,29,30]:
						hem = y+1
				for y in range(136):
					if y <= hem and original[y*96+x] != 0:
						pixels[y*96+x] = original[y*96+x]
			for y in range(136):
				for x in range(96):
					var index = y*96+x
					if pixels[index] != original[index]:
						layer.set_index_on_color_map(x,y,pixels[index])
						edit_count += 1
		var output = TARGET+"pixelpen/run_"+direction+".pxpen"
		if FileAccess.file_exists(output) and not "--revise-draft" in OS.get_cmdline_user_args():
			push_error("Refusing to overwrite an existing editable candidate: "+output);quit(1);return
		project.file_path = output
		if ProjectPacker.save(project,output) != OK:
			push_error("PixelPen save failed");quit(1);return
		project = ProjectPacker.load_project(output)
		DirAccess.make_dir_recursive_absolute(TARGET+"native-frames/run_"+direction)
		for frame in range(8):
			var result = project.get_image(project.animation_timeline[frame].frame)
			result.convert(Image.FORMAT_RGBA8)
			result.save_png(TARGET+"native-frames/run_"+direction+"/frame-%02d.png"%frame)
			comparison.blit_rect(result,Rect2i(0,0,96,136),Vector2i(frame*96,row*272+136))
		print("PixelPen saved and reopened: run_",direction)
	comparison.save_png(TARGET+"preview/before-after.png")
	var side = comparison.get_region(Rect2i(0,544,768,272))
	side.resize(1536,544,Image.INTERPOLATE_NEAREST)
	side.save_png(TARGET+"preview/side-before-after.png")
	print("Native indexed pixel edits: ",edit_count)
	PixelPen.state.free();PixelPen.state = null
	quit()
