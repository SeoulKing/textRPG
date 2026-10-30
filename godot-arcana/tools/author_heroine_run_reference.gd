extends SceneTree
## Convert approved motion study into editable indexed PixelPen corrections.
const ROOT="D:/BANG/project/textRPG/"
const SOURCE=ROOT+"godot-arcana/art/source/heroine/run-stride-v11/"
const TARGET=ROOT+"godot-arcana/art/source/heroine/run-reference-v14/"
const STUDY=ROOT+"art-studies/arcana-hero/white-bob-heroine/run-motion-reference/generated-keyposes-v1.png"

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
	var output=TARGET+"pixelpen/run_e.pxpen"
	if FileAccess.file_exists(output): push_error("Preserve existing editable output");quit(1);return
	for dir in ["pixelpen","native-frames/run_e","preview"]: DirAccess.make_dir_recursive_absolute(TARGET+dir)
	var project=ProjectPacker.load_project(SOURCE+"pixelpen/run_e.pxpen")
	var study=Image.load_from_file(STUDY)
	if project==null or study==null: push_error("Missing PixelPen or study source");quit(1);return
	var colors: PackedColorArray=project.palette.color_index
	var board=Image.create(768,272,false,Image.FORMAT_RGBA8)
	board.fill(Color("8292a7"))
	var metadata=[]
	for frame in range(8):
		var cell=study.get_region(Rect2i((frame%4)*384,int(frame/4)*512,384,512))
		var base=0
		var min_x=384
		var max_x=0
		for y in range(370,490):
			for x in range(30,354):
				if foreground(cell.get_pixel(x,y)):
					base=maxi(base,y);min_x=mini(min_x,x);max_x=maxi(max_x,x)
		# Align body axis, not bounding-box centre (which moves with the stride).
		var cx=190.0
		var lift=[0,1,2,3,0,1,2,3][frame]
		var bottom=115-lift
		var layer=project.animation_timeline[frame].frame.layers[0]
		var old: PackedByteArray=layer.colormap.get_data().duplicate()
		var pixels=PackedByteArray();pixels.resize(96*136);pixels.fill(0)
		var before=project.get_image(project.animation_timeline[frame].frame)
		before.convert(Image.FORMAT_RGBA8)
		board.blend_rect(before,Rect2i(0,0,96,136),Vector2i(frame*96,0))
		for y in range(90,123):
			for x in range(16,85):
				var sx=roundi(cx+(x-48)/0.21)
				var sy=roundi(base+(y-bottom)/0.21)
				if sx<0 or sx>=384 or sy<315 or sy>=490: continue
				var c=cell.get_pixel(sx,sy)
				if foreground(c): pixels[y*96+x]=nearest(c,colors)
		# Original costume owns the occlusion edge; motion study owns the legs.
		for x in range(96):
			var hem=88
			for y in range(84,101):
				var v=old[y*96+x]
				if (v>=1 and v<=9) or v in [14,29,30]: hem=y+1
			for y in range(hem+1):
				if old[y*96+x]!=0: pixels[y*96+x]=old[y*96+x]
		for i in range(pixels.size()):
			layer.set_index_on_color_map(i%96,int(i/96),pixels[i])
		metadata.append({"frame":frame,"reference_ground_y":base,"target_foot_y":bottom,"scale":0.21})
	project.file_path=output
	if ProjectPacker.save(project,output)!=OK: push_error("PixelPen save failed");quit(1);return
	project=ProjectPacker.load_project(output)
	if project==null: push_error("PixelPen reopen failed");quit(1);return
	for frame in range(8):
		var image=project.get_image(project.animation_timeline[frame].frame)
		image.convert(Image.FORMAT_RGBA8)
		image.save_png(TARGET+"native-frames/run_e/frame-%02d.png"%frame)
		board.blend_rect(image,Rect2i(0,0,96,136),Vector2i(frame*96,136))
	board.resize(1536,544,Image.INTERPOLATE_NEAREST)
	board.save_png(TARGET+"preview/reference-transfer.png")
	var file=FileAccess.open(TARGET+"reference-registration.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"study":STUDY,"frames":metadata,"method":"PixelPen indexed layer corrections from motion study; upper body retained"},"  "))
	print("Saved and reopened reference-based PixelPen run_e, 8 frames")
	PixelPen.state.free();PixelPen.state=null
	quit()
