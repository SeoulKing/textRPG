extends SceneTree
const ROOT="D:/BANG/project/textRPG/"
const SOURCE=ROOT+"godot-arcana/art/source/heroine/run-reference-v14/"
const TARGET=ROOT+"godot-arcana/art/source/heroine/run-reference-v15/"
const STUDY=ROOT+"art-studies/arcana-hero/white-bob-heroine/run-motion-reference/generated-other-directions-v1.png"
const DIRS=["s","se","e","ne","n","nw","w","sw"]

func _initialize() -> void: call_deferred("run")
func foreground(c: Color) -> bool:
	return maxf(c.r,maxf(c.g,c.b))-minf(c.r,minf(c.g,c.b))>0.065 and c.g<0.77
func nearest(c: Color, colors: PackedColorArray) -> int:
	var best=INF
	var result=0
	for i in range(1,colors.size()):
		var p=colors[i]
		var error=pow(c.r-p.r,2)+pow(c.g-p.g,2)+pow(c.b-p.b,2)
		if error<best: best=error;result=i
	return result
func run() -> void:
	var study=Image.load_from_file(STUDY)
	if study==null: push_error("Missing motion study");quit(1);return
	for folder in ["preview","native-frames"]: DirAccess.make_dir_recursive_absolute(TARGET+folder)
	var board=Image.create(768,1088,false,Image.FORMAT_RGBA8)
	board.fill(Color("8292a7"))
	var rectangles=[Vector2i(0,274),Vector2i(274,243),Vector2i(517,250),Vector2i(773,251)]
	for direction in DIRS:
		var project=ProjectPacker.load_project(SOURCE+"pixelpen/run_"+direction+".pxpen")
		if project==null: push_error("Missing PixelPen source "+direction);quit(1);return
		var colors: PackedColorArray=project.palette.color_index
		for frame in range(8):
			if direction=="e": continue
			var layer=project.animation_timeline[frame].frame.layers[0]
			var old: PackedByteArray=layer.colormap.get_data().duplicate()
			var pixels=PackedByteArray();pixels.resize(96*136);pixels.fill(0)
			var mirror=direction in ["nw","w","sw"]
			if direction=="w":
				var approved=Image.load_from_file(SOURCE+"native-frames/run_e/frame-%02d.png"%frame)
				for y in range(84,124):
					for x in range(12,85):
						var c=approved.get_pixel(95-x,y)
						if c.a>0.5: pixels[y*96+x]=nearest(c,colors)
			else:
				var row: int={"s":0,"se":1,"sw":1,"ne":2,"nw":2,"n":3}[direction]
				var rect: Vector2i=rectangles[row]
				var cell=study.get_region(Rect2i(frame*192,rect.x,192,rect.y))
				var base=0
				for y in range(int(cell.get_height()*0.69),cell.get_height()):
					for x in range(20,174):
						if foreground(cell.get_pixel(x,y)): base=maxi(base,y)
				var bottom=115-[0,1,2,3,0,1,2,3][frame]
				for y in range(90,124):
					for x in range(12,85):
						var sx=roundi(96.0+((95-x if mirror else x)-48)/0.40)
						var sy=roundi(base+(y-bottom)/0.40)
						if sx<0 or sx>=192 or sy<int(cell.get_height()*0.58) or sy>=cell.get_height(): continue
						var c=cell.get_pixel(sx,sy)
						if foreground(c): pixels[y*96+x]=nearest(c,colors)
			for x in range(96):
				var hem=88
				for y in range(84,101):
					var value=old[y*96+x]
					if (value>=1 and value<=9) or value in [14,29,30]: hem=y+1
				for y in range(hem+1):
					if old[y*96+x]!=0: pixels[y*96+x]=old[y*96+x]
			for i in range(pixels.size()): layer.set_index_on_color_map(i%96,int(i/96),pixels[i])
		var output=TARGET+"pixelpen/run_"+direction+".pxpen"
		if direction!="e":
			project.file_path=output
			if ProjectPacker.save(project,output)!=OK: push_error("Native save failed");quit(1);return
		project=ProjectPacker.load_project(output)
		if project==null: push_error("Native reload failed");quit(1);return
		DirAccess.make_dir_recursive_absolute(TARGET+"native-frames/run_"+direction)
		for frame in range(8):
			var image=project.get_image(project.animation_timeline[frame].frame)
			image.convert(Image.FORMAT_RGBA8)
			image.save_png(TARGET+"native-frames/run_"+direction+"/frame-%02d.png"%frame)
			board.blend_rect(image,Rect2i(0,0,96,136),Vector2i(frame*96,DIRS.find(direction)*136))
		print("Saved/reopened PixelPen run_",direction)
	board.save_png(TARGET+"preview/all-directions.png")
	PixelPen.state.free();PixelPen.state=null
	quit()
