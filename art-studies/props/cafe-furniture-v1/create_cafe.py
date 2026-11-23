import bpy, math, os
from mathutils import Vector

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(ROOT, '../../../godot-arcana/art/source/cafe-furniture-v1'))
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for c in list(bpy.data.collections):
    if c.users == 0:
        bpy.data.collections.remove(c)

def material(name, color, metallic=0, roughness=.55):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    n = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    n.inputs['Base Color'].default_value = (*color, 1)
    n.inputs['Metallic'].default_value = metallic
    n.inputs['Roughness'].default_value = roughness
    return m

wood = material('Honey oak', (.52, .205, .048))
wood_light = material('Oak highlights', (.72, .34, .085))
wood_dark = material('Oak edge', (.31, .095, .025))
iron = material('Dark wrought iron', (.12, .092, .095), .55)
gold = material('Warm brass', (.74, .39, .045), .65, .35)
blue = material('Parasol blue', (.055, .11, .31))
cream = material('Parasol ivory', (.92, .78, .50))

def group(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c

chair = group('Cafe_Chair')
table = group('Cafe_Parasol_Table')

def move_to(obj, collection, name, mat):
    obj.name = name
    for c in list(obj.users_collection): c.objects.unlink(obj)
    collection.objects.link(obj)
    if mat: obj.data.materials.append(mat)
    return obj

def cube(c, name, loc, size, mat, bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod=o.modifiers.new('Soft crafted edges', 'BEVEL'); mod.width=bevel; mod.segments=2
        mod=o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    return move_to(o,c,name,mat)

def cylinder(c, name, loc, radius, depth, mat, vertices=32, radius2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth, location=loc)
    o=bpy.context.object
    mod=o.modifiers.new('Edge bevel','BEVEL'); mod.width=.008; mod.segments=2
    o.modifiers.new('Weighted normals','WEIGHTED_NORMAL')
    return move_to(o,c,name,mat)

def bar(c, name, a, b, radius, mat, vertices=10):
    d=Vector(b)-Vector(a)
    o=cylinder(c,name,(Vector(a)+Vector(b))/2,radius,d.length,mat,vertices)
    o.rotation_euler=d.to_track_quat('Z','Y').to_euler()
    return o

def path(c, name, points, radius, mat):
    curve=bpy.data.curves.new(name,'CURVE'); curve.dimensions='3D'; curve.resolution_u=12
    curve.bevel_depth=radius; curve.bevel_resolution=2
    s=curve.splines.new('BEZIER'); s.bezier_points.add(len(points)-1)
    for p, co in zip(s.bezier_points,points):
        p.co=co; p.handle_left_type='AUTO'; p.handle_right_type='AUTO'
    obj=bpy.data.objects.new(name,curve); c.objects.link(obj); obj.data.materials.append(mat)
    return obj

def panel(c,name, verts, faces, mat):
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts, [], faces); mesh.update()
    obj=bpy.data.objects.new(name,mesh); c.objects.link(obj); obj.data.materials.append(mat)
    return obj

# Chair: origin at footprint center; front faces -Y. Dimensions ~0.86 x 0.80 x 1.42.
for x in (-.34,.34):
    for y in (-.30,.30):
        cube(chair,'Iron leg', (x,y,.29), (.09,.09,.58),iron,.018)
        cube(chair,'Brass foot', (x,y,.035), (.13,.13,.07),gold,.012)
    cube(chair,'Back upright',(x,.30,1.0),(.09,.09,.82),iron,.015)
    cube(chair,'Back post cap',(x,.30,1.42),(.13,.13,.065),gold,.012)
for x in (-.30,-.10,.10,.30):
    cube(chair,'Seat oak plank',(x,0,.60),(.19,.70,.10),wood_light,.012)
cube(chair,'Seat front apron',(0,-.32,.51),(.75,.065,.12),wood,.012)
cube(chair,'Back lower rail',(0,.30,.80),(.72,.07,.09),wood,.012)
cube(chair,'Back top rail',(0,.30,1.30),(.70,.09,.17),wood_light,.025)
path(chair,'Curved back crest',[(-.33,.30,1.36),(-.20,.30,1.43),(0,.30,1.46),(.20,.30,1.43),(.33,.30,1.36)],.045,wood_light)
for side in (-1,1):
    path(chair,'Brass back flourish',[(side*.09,.245,1.30),(side*.16,.245,1.27),(side*.24,.245,1.29),(side*.22,.245,1.32)],.008,gold)
for x in (-.22,0,.22): cube(chair,'Back oak slat',(x,.30,1.02),(.085,.06,.42),wood,.012)
for x in (-.27,.27):
    cylinder(chair,'Front brass rivet',(x,-.359,.53),.032,.018,gold,12).rotation_euler[0]=math.pi/2
# Diamond mark, flat on the front of back rail.
panel(chair,'Star inlay',[(-.065,.248,1.30),(0,.247,1.37),(.065,.248,1.30),(0,.247,1.23)],[(0,1,2,3)],gold)

# Table and parasol share one ground pivot. Diameter 1.35; canopy diameter 2.7.
cylinder(table,'Table top dark rim',(0,0,.91),.69,.12,wood_dark,48)
cylinder(table,'Round oak tabletop',(0,0,.975),.665,.05,wood_light,48)
for y in (-.45,-.225,0,.225,.45):
    half=math.sqrt(.65**2-y**2)
    bar(table,'Tabletop plank seam',(-half,y,1.001),(half,y,1.001),.0035,wood_dark,6)
cylinder(table,'Table center support',(0,0,.50),.10,.82,iron,20)
cylinder(table,'Parasol pole',(0,0,1.73),.045,2.9,iron,16)
for z in (.14,.83,1.015,1.60,3.06): cylinder(table,'Brass pole collar',(0,0,z),.082,.055,gold,20)
for i in range(4):
    a=i*math.pi/2
    def pt(r,z): return (math.cos(a)*r,math.sin(a)*r,z)
    path(table,'Curved iron pedestal foot',[pt(.08,.65),pt(.18,.40),pt(.42,.12),pt(.55,.07)],.047,iron)
    foot=cube(table,'Brass pedestal shoe',pt(.55,.045),(.20,.13,.07),gold,.012); foot.rotation_euler.z=a
for i in range(16):
    a=i*math.tau/16
    # Ring rivets on table's outer edge.
    o=cylinder(table,'Table rim rivet',(.684*math.cos(a),.684*math.sin(a),.92),.026,.016,gold,12)
    o.rotation_euler=Vector((math.cos(a),math.sin(a),0)).to_track_quat('Z','Y').to_euler()

# Canopy: eight alternating cloth wedges with a shallow curved silhouette.
N=8; SUB=8
for i in range(N):
    verts=[]
    for j in range(SUB+1):
        a=math.tau*(i+j/SUB)/N
        for radius,z in ((0.03,3.09),(.40,3.03),(.88,2.87),(1.35,2.64)):
            verts.append((radius*math.cos(a),radius*math.sin(a),z))
    faces=[]
    for j in range(SUB):
        for k in range(3): faces.append((j*4+k,(j+1)*4+k,(j+1)*4+k+1,j*4+k+1))
    o=panel(table,'Blue canopy panel' if i%2==0 else 'Ivory canopy panel',verts,faces,blue if i%2==0 else cream)
    solid=o.modifiers.new('Fabric thickness','SOLIDIFY'); solid.thickness=.012
    # Scalloped hem follows each panel edge.
    hem=[]
    for j in range(SUB+1):
        a=math.tau*(i+j/SUB)/N
        z=2.64-.11*math.sin(math.pi*j/SUB)
        hem.append((1.35*math.cos(a),1.35*math.sin(a),z))
    verts2=[]
    for j in range(SUB+1):
        a=math.tau*(i+j/SUB)/N
        verts2.extend([(1.35*math.cos(a),1.35*math.sin(a),2.64),hem[j]])
    o=panel(table,'Scalloped fabric valance',verts2,[(2*j,2*j+1,2*j+3,2*j+2) for j in range(SUB)],blue if i%2==0 else cream)
    sol=o.modifiers.new('Fabric thickness','SOLIDIFY'); sol.thickness=.012
    path(table,'Gold canopy edging',hem,.013,gold)
    a=i*math.tau/N
    bar(table,'Canopy rib',(.04*math.cos(a),.04*math.sin(a),3.08),(1.35*math.cos(a),1.35*math.sin(a),2.64),.012,gold,8)
    cylinder(table,'Canopy edge stud',(1.35*math.cos(a),1.35*math.sin(a),2.64),.034,.025,gold,12)
cylinder(table,'Finial base',(0,0,3.115),.11,.055,gold,20)
cylinder(table,'Finial gem',(0,0,3.21),.075,.16,gold,4,0)

# Keep editable source objects in two collections, each centered at the origin.
blend_path=os.path.join(ROOT,'cafe-furniture.blend')
bpy.ops.wm.save_as_mainfile(filepath=blend_path)
for c,filename in ((chair,'cafe-chair.glb'),(table,'cafe-parasol-table.glb')):
    bpy.ops.object.select_all(action='DESELECT')
    for o in c.objects: o.select_set(True)
    bpy.context.view_layer.objects.active=next(iter(c.objects))
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT,filename),export_format='GLB',use_selection=True)
print('OUTPUT',blend_path,OUT,flush=True)
