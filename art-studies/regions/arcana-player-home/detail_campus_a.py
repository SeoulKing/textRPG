"""Add the lived-in details to the A home without changing its layout or pivots."""

import math
import bpy
import bmesh
from mathutils import Matrix, Vector

if not bpy.data.filepath.replace("\\", "/").endswith("/player-home-campus-a.blend"):
    raise RuntimeError("Open the Library Lane home source first.")
if bpy.data.collections.get("Kitchen | daily use details"):
    raise RuntimeError("The detail collections are already in this home.")

materials = bpy.data.materials
oak = materials["Oak | honey"]
dark = materials["Oak | dark carved frames"]
trim = materials["Oak | polished trim"]
linen = materials["Textile | flax linen"]
blue = materials["Textile | lapis blue"]
gold = materials["Textile | antique gold"]
brass = materials["Brass | aged and polished"]
ivory = materials["Porcelain | warm ivory"]
iron = materials["Iron | blackened"]
clay = materials["Library Lane | fired clay"]
copper = materials["Library Lane | kettle copper"]
plaster = materials["Library Lane | cream lime plaster"]
moss = materials["Library Lane | leaf"]
slate = materials["Library Lane | blue slate"]


def palette(name, hex_code):
    mat = materials.new(name)
    mat.use_nodes = True
    srgb = [int(hex_code[i:i+2], 16) / 255 for i in (0, 2, 4)]
    color = tuple(v / 12.92 if v < .04045 else ((v + .055) / 1.055) ** 2.4 for v in srgb)
    mat.diffuse_color = (*color, 1)
    shader = next(node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = .75
    return mat


leather = palette("Library Lane | russet satchel", "764736")
dark_leather = palette("Library Lane | old leather straps", "4F362C")
tea = palette("Library Lane | tea amber", "905B39")
bread = palette("Library Lane | flour-dusted bread", "CB9051")
crumb = palette("Library Lane | bread crumb", "E4BF80")
jam = palette("Library Lane | berry preserve", "963B4A")


def detail_group(owner, title):
    group = bpy.data.collections.new(title)
    bpy.data.collections[owner].children.link(group)
    return group


def corner(group, name, x, z, y, w, d, h, mat, bevel=.025):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((w, d, h, 1))), verts=list(bm.verts))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = (x, -z, y)
    mesh.materials.append(mat)
    if bevel:
        softened = obj.modifiers.new("Worn edges", "BEVEL")
        softened.width = bevel
        softened.segments = 2
        obj.modifiers.new("Corner normals", "WEIGHTED_NORMAL")
    return obj


def oval(group, name, x, z, y, w, d, h, mat):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=.5)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal(Vector((w, d, h, 1))), verts=list(bm.verts))
    for face in bm.faces:
        face.smooth = True
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    obj.location = (x, -z, y)
    mesh.materials.append(mat)
    return obj


def line(group, name, points, mat, width, closed=False):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.bevel_depth = width
    data.bevel_resolution = 1
    spline = data.splines.new("POLY")
    spline.points.add(len(points)-1)
    spline.use_cyclic_u = closed
    for knot, (x, z, y) in zip(spline.points, points):
        knot.co = (x, -z, y, 1.0)
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    group.objects.link(obj)
    return obj


def lathe(group, name, x, z, y, profile, mat, count=18):
    vertices = [(x+r*math.cos(i*math.tau/count), -z+r*math.sin(i*math.tau/count), y+h)
        for h,r in profile for i in range(count)]
    faces = [(j*count+i, j*count+(i+1)%count, (j+1)*count+(i+1)%count,(j+1)*count+i)
        for j in range(len(profile)-1) for i in range(count)]
    faces.extend([tuple(reversed(range(count))), tuple(range((len(profile)-1)*count, len(profile)*count))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = len(face.vertices) == 4
    obj = bpy.data.objects.new(name, mesh)
    group.objects.link(obj)
    return obj


def ring(group, name, x, z, y, radius, mat, width=.011):
    line(group, name, [(x+radius*math.cos(i*math.tau/18), z+radius*math.sin(i*math.tau/18), y)
        for i in range(18)], mat, width, True)


def cup(group, x, z, y, mat=ivory):
    lathe(group, "Stoneware cup", x,z,y, [(0,.081),(.02,.098),(.13,.107),(.18,.115),(.18,.097),(.155,.094),(.027,.065)], mat)
    ring(group, "Glazed rim", x,z,y+.178,.106,blue)
    oval(group, "Tea surface", x,z,y+.135,.175,.175,.015,tea)
    line(group, "Loop handle", [(x+.103,z,y+.156),(x+.159,z,y+.153),(x+.178,z,y+.108),
         (x+.15,z,y+.055),(x+.098,z,y+.057)], mat, .018)


def book(group, name, x,z,y,w,d,h,cover,angle=0.0):
    for label, height, size, mat in (
            (" cover", y+h*0.18,(w,d,h*.30),cover),
            (" pages", y+h*.55,(w-.032,d-.021,h*.65),ivory),
            (" cover", y+h*.91,(w,d,h*.23),cover)):
        item=corner(group, name+label, x,z,height,*size,mat,.012)
        item.rotation_euler.z=angle


kettle = detail_group("kitchen-hearth", "Kitchen | kettle and range details")
line(kettle, "Kettle bail handle",
    [(3.88-.268*math.cos(i*math.pi/12),12.62,1.585+.335*math.sin(i*math.pi/12)) for i in range(13)], iron,.024)
oval(kettle, "Kettle knob", 3.88,12.62,1.798,.116,.116,.108,dark)
ring(kettle, "Kettle copper foot rim",3.88,12.62,1.316,.171,brass,.014)
line(kettle, "Firebox latch",[(4.645,12.21,.51),(4.722,12.21,.51),(4.722,12.29,.51)],brass,.034)
for depth in (12.26,12.43,12.60,12.77):
    corner(kettle,"Iron vent",4.553,depth,.86,.062,.091,.027,slate,.005)

kitchen = detail_group("kitchen-counter", "Kitchen | daily use details")
cup(kitchen,3.74,7.92,1.166)
cup(kitchen,3.80,7.55,1.166,blue)
# Sink rim and drain sit on the ceramic basin within the cabinet footprint.
for z in (8.463,9.251):
    corner(kitchen,"Sink enamel rim",3.80,z,1.203,.94,.066,.04,ivory,.025)
for x in (3.352,4.248):
    corner(kitchen,"Sink enamel rim",x,8.858,1.203,.064,.79,.04,ivory,.025)
lathe(kitchen,"Sink brass drain",3.87,8.92,1.195,[(0,.058),(.009,.058),(.013,.040)],brass)
for z in (8.58,9.14):
    lathe(kitchen,"Faucet tap",3.35,z,1.182,[(0,.055),(.041,.054),(.10,.029),(.124,.062),(.149,.064)],brass)
# A clean towel hangs from the handle on the east face.
line(kitchen,"Towel bar",[(4.60,9.54,.89),(4.67,9.54,.89),(4.67,9.94,.89),(4.60,9.94,.89)],brass,.023)
corner(kitchen,"Folded linen towel",4.684,9.75,.665,.055,.35,.42,linen,.015)
for z in (9.64,9.68):
    corner(kitchen,"Indigo towel stripe",4.715,z,.666,.008,.028,.405,blue,.004)
# Bread and a knife at the empty end of the worktop.
corner(kitchen,"Dark end board",3.80,11.28,1.192,.69,.43,.050,oak,.035)
oval(kitchen,"Small loaf of bread",3.75,11.22,1.28,.48,.27,.19,bread)
for x in (3.62,3.72,3.82):
    line(kitchen,"Scored loaf",[(x-.024,11.14,1.334),(x,11.22,1.373),(x+.028,11.28,1.347)],crumb,.013)
corner(kitchen,"Knife handle",4.06,11.26,1.235,.094,.164,.045,dark,.018)
corner(kitchen,"Knife blade",4.06,11.40,1.228,.071,.149,.023,slate,.008)

shelf = detail_group("kitchen-shelf", "Kitchen | labelled pantry jars")
for x,z,base,contents in ((5.66,4.92,.846,jam),(6.32,4.94,.846,tea),(7.32,4.94,.846,moss)):
    lathe(shelf,"Preserve jar",x,z,base,[(0,.122),(.035,.134),(.216,.139),(.25,.099),(.272,.101)],contents)
    lathe(shelf,"Lidded brass preserve top",x,z,base+.268,[(0,.112),(.04,.112)],brass)
    corner(shelf,"Paper pantry label",x,z+.138,base+.137,.124,.017,.090,linen,.008)

work = detail_group("living-worktable", "Living room | study and tea")
lathe(work,"Porcelain saucer",14.86,12.62,1.099,[(0,.133),(.015,.151),(.041,.171),(.049,.158),(.025,.076)],ivory)
cup(work,14.86,12.62,1.139)
# Open notebook with imperfect pressed pages and a blue bookmark.
corner(work,"Open notebook spine",13.16,12.57,1.112,.61,.42,.044,blue,.025)
for x in (13.012,13.309):
    corner(work,"Notebook paper leaf",x,12.568,1.145,.278,.385,.032,ivory,.020)
    for z in (12.47,12.52,12.57,12.62):
        line(work,"Notebook ink strokes",[(x-.090,z,1.164),(x+.065,z,1.164)],slate,.004)
line(work,"Ribbon bookmark",[(13.15,12.49,1.172),(13.15,12.74,1.160),(13.153,12.83,1.111)],gold,.014)
corner(work,"Ink bottle foot",13.94,12.64,1.145,.16,.15,.097,blue,.024)
lathe(work,"Ink bottle neck and stopper",13.94,12.64,1.183,[(0,.055),(.070,.052),(.091,.062)],copper)
line(work,"Brass-nib pen",[(13.55,12.69,1.123),(13.72,12.49,1.123),(13.74,12.47,1.125)],brass,.015)

chair = detail_group("living-sofa", "Living room | folded armchair throw")
# Cloth drapes onto the existing left arm. The long tail follows the side of the chair.
cross_section = [(18.13, .855), (18.04, .866), (17.993, .806), (17.98, .615), (17.99, .465)]
vertices = [(x,-z,y) for z in (12.98,13.14,13.31,13.49) for x,y in cross_section]
faces = [(i*5+j,i*5+j+1,(i+1)*5+j+1,(i+1)*5+j) for i in range(3) for j in range(4)]
mesh = bpy.data.meshes.new("Linen throw folded surface")
mesh.from_pydata(vertices, [], faces)
mesh.materials.append(linen)
throw = bpy.data.objects.new("Folded linen armchair throw",mesh)
chair.objects.link(throw)
fabric = throw.modifiers.new("Woven cloth thickness","SOLIDIFY")
fabric.thickness=.032
for z in (13.03,13.42):
    line(chair,"Woven indigo stripe", [(x-.021,z,y+.014) for x,y in cross_section],blue,.013)
for i in range(8):
    z=13.00+i*.067
    line(chair,"Short tassel",[(17.974,z,.475),(17.979,z,.417)],linen,.009)

bed = detail_group("bedroom-bed", "Bedroom | embroidered quilt and satchel")
# Clustered eight-point stitching fits into the alternating existing quilt patches.
verts, faces = [], []
for ix in range(5):
    for iz in range(6):
        if (ix+iz*2) % 4 != 1:
            continue
        x,z=18+ix*.33,5.78+iz*.30
        offset=len(verts)
        for index in range(16):
            a=index*math.tau/16
            size=.102 if index%4==0 else .072 if index%2==0 else .027
            verts.append((x+math.cos(a)*size,-z+math.sin(a)*size,.888))
        faces.append(tuple(range(offset,offset+16)))
fabric = bpy.data.meshes.new("Navy quilt ivory star embroidery")
fabric.from_pydata(verts,[],faces)
fabric.materials.append(ivory)
thread = bpy.data.objects.new("Star stitches across the quilt",fabric)
bed.objects.link(thread)
for x in (17.84,19.47):
    line(bed,"Quilt gold edge piping",[(x,5.79,.867),(x,7.38,.867)],gold,.012)
for i in range(17):
    x=17.91+i*.094
    line(bed,"Indigo binding stitch",[(x,7.397,.887),(x+.026,7.405,.887)],ivory,.008)
# A school satchel rests on the bottom quarter of the mattress with the straps on top.
bag_x,bag_z=18.72,7.09
corner(bed,"Student leather satchel",bag_x,bag_z,1.020,.64,.38,.247,leather,.064)
corner(bed,"Soft leather satchel flap",bag_x,bag_z+.016,1.136,.65,.376,.091,dark_leather,.038)
line(bed,"Satchel grab handle",[(bag_x-.165,bag_z,1.167),(bag_x-.123,bag_z,1.254),
     (bag_x+.122,bag_z,1.254),(bag_x+.17,bag_z,1.165)],leather,.035)
for dx in (-.167,.167):
    x=bag_x+dx
    corner(bed,"Satchel fastening strap",x,bag_z+.192,1.044,.077,.038,.165,trim,.016)
    line(bed,"Satchel brass buckle",[(x-.047,bag_z+.219,.996),(x+.047,bag_z+.219,.996),
        (x+.047,bag_z+.219,1.058),(x-.047,bag_z+.219,1.058)],brass,.012,True)

lamp = detail_group("bedroom-lamp", "Bedroom | book at the bedside")
book(lamp,"Small night reading book",16.43,5.10,.937,.33,.27,.062,moss,-.13)
line(lamp,"Strip of night-book ribbon",[(16.51,5.20,.984),(16.50,5.26,.947)],gold,.012)

upper = detail_group("upper-walls", "House | joinery and academy details")
# The wall banner and hooks follow the upper wall visibility switch.
bar_z=4.16
line(upper,"Small brass banner rail",[(14.17,bar_z,2.17),(14.88,bar_z,2.17)],brass,.025)
for x in (14.18,14.87):
    oval(upper,"Banner rod finial",x,bar_z,2.17,.093,.094,.094,brass)
vertices=[(14.22,-4.185,2.145),(14.83,-4.185,2.145),(14.83,-4.194,1.61),
          (14.525,-4.206,1.475),(14.22,-4.195,1.61)]
mesh=bpy.data.meshes.new("Threadbound navy wall pennant")
mesh.from_pydata(vertices,[],[(0,1,2,3,4)])
mesh.materials.append(blue)
banner=bpy.data.objects.new("Small academy pennant",mesh)
upper.objects.link(banner)
banner.modifiers.new("Woven banner thickness","SOLIDIFY").thickness=.022
line(upper,"Woven outer band",[(14.25,4.218,2.107),(14.80,4.218,2.107),(14.80,4.220,1.634),
   (14.525,4.227,1.505),(14.25,4.222,1.635)],gold,.012,True)
for dx,dy in ((0,0),(-.125,.145),(.127,.129),(.105,-.15)):
    x,y=14.525+dx,1.79+dy
    line(upper,"Pennant embroidered star",[(x-.032,4.234,y),(x+.032,4.234,y)],gold,.010)
    line(upper,"Pennant embroidered star",[(x,4.234,y-.034),(x,4.234,y+.034)],gold,.010)
# Brass window catches and door joinery stay with their corresponding walls.
for x,z in ((6.65,4.193),(16.44,4.193),(6.30,16.973),(17.50,16.973)):
    center_y=1.87 if z<10 else 1.61
    corner(upper,"Window sash brass catch",x+.065,z,center_y-.043,.131,.052,.039,brass,.012)
    oval(upper,"Sash brass latch stud",x+.10,z+.018,center_y-.045,.041,.047,.036,copper)
for y in (.41,1.84):
    corner(upper,"Recessed indigo door hinge",11.112,16.416,y,.081,.201,.084,iron,.016)

# Store this as an additive pass over the saved source; part pivots are unchanged.
bpy.context.view_layer.update()
print("Library Lane detail pass:", sum(len(group.objects) for group in (
    kettle,kitchen,shelf,work,chair,bed,lamp,upper)), "new editable objects")
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, compress=True)
