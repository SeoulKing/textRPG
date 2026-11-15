from math import cos, pi, sin


def lounge_mesh(name, vertices, faces, mat):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    attach(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def lounge_rings(name, rings, mat, *, caps=True):
    stride = len(rings[0])
    faces = []
    if caps:
        faces.extend([tuple(reversed(range(stride))), tuple(range((len(rings) - 1) * stride, len(rings) * stride))])
    for ring in range(len(rings) - 1):
        for i in range(stride):
            first = ring * stride
            next_point = (i + 1) % stride
            faces.append((first + i, first + next_point, first + next_point + stride, first + i + stride))
    return lounge_mesh(name, [point for ring in rings for point in ring], faces, mat)


def lounge_lathe(name, loc, profile, mat, oval=1.0, steps=32, caps=True):
    x, y, z = loc
    rings = [[(x + radius * cos(2 * pi * i / steps), y + oval * radius * sin(2 * pi * i / steps), z + height)
              for i in range(steps)] for radius, height in profile]
    return lounge_rings(name, rings, mat, caps=caps)


def lounge_welt(name, center, width, depth, radius, mat, vertical=False):
    x, y, z = center
    corners = [(1, 1), (-1, 1), (-1, -1), (1, -1)]
    points = []
    for i, (sx, sy) in enumerate(corners):
        for j in range(6):
            angle = (i + j / 5) * pi / 2
            u = sx * (width / 2 - radius) + cos(angle) * radius
            v = sy * (depth / 2 - radius) + sin(angle) * radius
            points.append((x + u, y - .016, z + v) if vertical else (x + u, y + v, z))
    # Keep the continuous welt above the bevel at gameplay pixel density.
    path(name, points, .018, mat, cyclic=True)


def lounge_pillow(name, center, width, height, angle, mat, welt, embroidery=None):
    x, y, z = center

    def point(u, v, depth):
        dx = u * cos(angle) - v * sin(angle)
        dz = u * sin(angle) + v * cos(angle)
        return x + dx, y + depth + .23 * v, z + dz

    def pillow_edge(a):
        def square_round(value):
            return (1 if value >= 0 else -1) * abs(value) ** .58
        return .5 * width * square_round(cos(a)), .5 * height * square_round(sin(a))

    edge = [pillow_edge(-2 * pi * i / 32) for i in range(32)]
    rings = []
    for scale, depth in [(.25, -.125), (.65, -.114), (.91, -.071), (1, 0), (.91, .071), (.65, .114), (.25, .125)]:
        rings.append([point(scale * u, scale * v, depth) for u, v in edge])
    lounge_rings(name, rings, mat)
    path(f'{name} / stitched edge', [point(u, v, -.008) for u, v in edge], .016, welt, cyclic=True)
    if embroidery:
        for u in (-.075, .075):
            for v in (-.061, .061):
                motif = [point(u + du, v + dv, -.126) for du, dv in ((0, -.046), (.041, 0), (0, .046), (-.041, 0))]
                path(f'{name} / woven diamond', motif, .0045, embroidery, cyclic=True)


def lounge_arm(x, y_front, y_back, width, arm_dark, piping):
    box('Upholstered side', (x, (y_front + y_back) / 2, .49), (width * .77, y_back - y_front, .53), arm_dark, .12)
    profiles = [(-.013, .53), (0, .85), (.04, 1.0), (.12, 1.0), (.31, .9), (.58, .81), (.82, .74), (.99, .65), (1.02, .49)]
    rings = []
    for along, scale in profiles:
        ring = []
        for i in range(32):
            angle = -2 * pi * i / 32
            ring.append((x + .5 * width * scale * cos(angle),
                         y_front + along * (y_back - y_front),
                         .78 + .196 * scale * sin(angle) - .055 * max(along, 0)))
        rings.append(ring)
    lounge_rings('Rolled arm upholstery', rings, plum)
    path('Rolled arm piping', rings[2], .018, piping, cyclic=True)
    end_y = y_front - .026
    path('Arm scroll seam', [(x + (.019 + .007 * i) * cos(i * .32), end_y,
                             .78 + (.019 + .007 * i) * sin(i * .32)) for i in range(18)], .006, piping)


def lounge_foot(x, y):
    lounge_lathe('Turned oak foot', (x, y, 0), [(.086, .025), (.094, .037), (.093, .077),
                 (.069, .107), (.080, .151), (.094, .170), (.093, .204)], dark_wood, steps=16)


def lounge_throw(blue_binding):
    # Cross-section follows the back, the seat and the front of the center cushion.
    profile = [(.035, 1.33), (-.075, 1.38), (-.21, 1.365), (-.308, 1.32),
               (-.370, 1.24), (-.400, 1.12), (-.427, .96), (-.450, .79),
               (-.52, .682), (-.70, .659), (-.93, .659), (-1.19, .657),
               (-1.336, .633), (-1.391, .548), (-1.417, .419), (-1.434, .296)]

    def point(u, v, offset=0):
        start = min(int(v), len(profile) - 2)
        t = v - start
        y1, z1 = profile[start]
        y2, z2 = profile[start + 1]
        y = y1 + (y2 - y1) * t
        z = z1 + (z2 - z1) * t
        fold = cos(u * 9.2 + .20 * v) * .016 + sin(u * 21.0 - .23 * v) * .009
        return (-3.91 + u * (.47 + .015 * cos(v * .45)) + .025 * sin(v * .6),
                y - fold * .72 - offset, z + fold * .75 + offset)

    across = 13
    along = 31
    vertices = [point(i / (across - 1) - .5, j / (along - 1) * (len(profile) - 1))
                for j in range(along) for i in range(across)]
    faces = [(j * across + i, j * across + i + 1, (j + 1) * across + i + 1, (j + 1) * across + i)
             for j in range(along - 1) for i in range(across - 1)]
    cloth = lounge_mesh('Indigo throw / folded cloth', vertices, faces, blue)
    thickness = cloth.modifiers.new('Woven cloth thickness', 'SOLIDIFY')
    thickness.thickness = .013
    last = len(profile) - 1
    for u in (-.46, -.37, .37, .46):
        path('Throw / woven border', [point(u, last * j / 30, .019) for j in range(31)], .014,
             gold if abs(u) > .4 else blue_binding)
    for v in (1.7, 3.6, 6.0, 9.0, 11.15, 13.55):
        for u in (-.14, .14):
            path('Throw / gold embroidery', [point(u, v - .52, .013), point(u + .085, v, .013),
                 point(u, v + .52, .013), point(u - .085, v, .013)], .006, gold, cyclic=True)
    path('Throw / gold fringe binding', [point(i / 20 - .5, last, .012) for i in range(21)], .008, gold)
    for i in range(16):
        x, y, z = point(i / 16 - .465, last, .008)
        path('Throw / tassel', [(x, y, z), (x + .006, y - .021, z - .04), (x + .008 * cos(i), y - .028, z - .078)], .007, gold)


def lounge_sofa(arm_dark, piping, blue_binding, linen_welt):
    group('Lounge | L-shaped settee', (-4.62, -.62, 0))
    box('Oak settee frame', (-4.62, -.625, .236), (3.82, 1.47, .195), dark_wood, .063)
    box('Oak chaise frame', (-5.97, -1.61, .235), (1.16, .75, .194), dark_wood, .060)
    box('Chaise front apron', (-5.94, -1.979, .260), (1.17, .047, .124), wood, .021)
    box('Sofa front apron', (-4.07, -1.366, .265), (2.67, .040, .115), wood, .018)
    for x, y in [(-6.34, -1.83), (-5.50, -1.83), (-6.34, -.015), (-2.91, -.015), (-2.91, -1.22), (-4.42, -1.22)]:
        lounge_foot(x, y)
    box('Upholstered deck', (-4.61, -.616, .403), (3.68, 1.36, .286), arm_dark, .12)
    box('Upholstered chaise deck', (-5.95, -1.618, .405), (1.16, .78, .290), arm_dark, .097)
    box('Upholstered back', (-4.62, .015, .88), (3.81, .38, .91), arm_dark, .16)
    for i, x in enumerate((-5.875, -4.625, -3.378)):
        box(f'Back cushion {i + 1}', (x, -.175, .958), (1.23, .45, .815), plum if i == 1 else plum_light, .185)
        lounge_welt('Back cushion seam', (x, -.393, .963), 1.04, .626, .114, piping, vertical=True)
    for x, y, width, depth in [(-5.899, -1.238, 1.11, 1.479), (-4.677, -.933, 1.271, .916), (-3.447, -.933, 1.15, .916)]:
        box('Loose seat cushion', (x, y, .532), (width, depth, .238), plum_light, .104)
        lounge_welt('Seat cushion piping', (x, y, .538), width + .002, depth + .003, .105, piping)
    lounge_arm(-6.335, -1.635, .051, .422, arm_dark, piping)
    lounge_arm(-2.913, -1.336, .065, .428, arm_dark, piping)
    lounge_throw(blue_binding)
    lounge_pillow('Cream cushion / left', (-5.988, -.591, .916), .445, .445, -.24, linen, linen_welt, gold)
    lounge_pillow('Blue cushion', (-5.523, -.612, .889), .363, .344, .27, blue, gold, gold)
    lounge_pillow('Cream cushion / right', (-3.192, -.586, .908), .428, .426, .232, linen, linen_welt, gold)
    finish_group()


def lounge_chair(arm_dark, piping, linen_welt):
    x, y = -2.19, -2.63
    group('Lounge | Armchair', (x, y, 0))
    for dx in (-.451, .451):
        for dy in (-.382, .392):
            lounge_foot(x + dx, y + dy)
    box('Carved oak frame', (x, y, .232), (1.145, 1.08, .193), dark_wood, .058)
    box('Front apron', (x, y - .53, .235), (.984, .066, .124), wood, .022)
    box('Upholstered deck', (x, y, .386), (1.146, 1.065, .273), arm_dark, .11)
    box('Shaped back', (x, y + .419, .872), (1.075, .36, .875), plum, .17)
    box('Soft back cushion', (x, y + .255, .859), (.873, .40, .749), plum_light, .162)
    lounge_welt('Back cushion seam', (x, y + .061, .864), .728, .558, .11, piping, vertical=True)
    box('Loose seat cushion', (x, y - .126, .527), (.78, .813, .219), plum_light, .102)
    lounge_welt('Seat cushion piping', (x, y - .126, .530), .783, .816, .101, piping)
    for dx in (-.462, .462):
        lounge_arm(x + dx, y - .49, y + .443, .315, arm_dark, piping)
    lounge_pillow('Cream reading cushion', (x + .024, y - .051, .864), .408, .392, .18, linen, linen_welt, gold)
    finish_group()


def lounge_cup(x, y, z, porcelain, cobalt, tea):
    lounge_lathe('Saucer', (x, y, z), [(.046, 0), (.105, .007), (.120, .022), (.119, .035),
                 (.109, .043), (.090, .029), (.054, .026), (.018, .026)], porcelain)
    lounge_lathe('Saucer cobalt rim', (x, y, z), [(.119, .035), (.116, .040), (.109, .043)], cobalt, caps=False)
    lounge_lathe('Porcelain cup', (x, y, z + .028), [(.042, 0), (.044, .013), (.051, .020), (.059, .040),
                 (.070, .075), (.070, .086), (.064, .091), (.057, .082), (.049, .058),
                 (.038, .023), (.016, .018)], porcelain)
    lounge_lathe('Cup painted cobalt rim', (x, y, z + .028), [(.070, .084), (.067, .090), (.063, .090)], cobalt, caps=False)
    cyl('Amber tea', (x, y, z + .095), .054, .006, tea)
    path('Porcelain cup handle', [(x + .06, y, z + .097), (x + .092, y, z + .103),
         (x + .11, y, z + .080), (x + .089, y, z + .053), (x + .053, y, z + .052)], .009, porcelain)


def lounge_teapot(x, y, z, porcelain, cobalt):
    lounge_lathe('Porcelain tea pot', (x, y, z), [(.092, 0), (.106, .012), (.121, .038), (.149, .087),
                 (.151, .130), (.136, .176), (.115, .204), (.093, .219), (.095, .229)], porcelain)
    lounge_lathe('Tea pot / painted base', (x, y, z), [(.108, .016), (.117, .030)], cobalt, caps=False)
    lounge_lathe('Tea pot / domed lid', (x, y, z), [(.096, .220), (.103, .235), (.097, .245),
                 (.075, .254), (.051, .264), (.017, .267)], porcelain)
    ball('Tea pot / cobalt finial', (x, y, z + .285), (.050, .050, .047), cobalt)
    path('Tea pot / curled handle', [(x - .116, y, z + .177), (x - .181, y, z + .230),
         (x - .234, y, z + .197), (x - .233, y, z + .138), (x - .183, y, z + .085),
         (x - .123, y, z + .077)], .022, porcelain)
    centers = [(.113, .092, .050), (.175, .125, .045), (.213, .167, .034),
               (.246, .217, .026), (.284, .248, .026), (.298, .251, .031), (.295, .245, .020)]
    rings = [[(x + dx - radius * .62 * sin(a), y + radius * cos(a), z + dz + radius * .79 * sin(a))
              for a in (2 * pi * i / 20 for i in range(20))] for dx, dz, radius in centers]
    lounge_rings('Tea pot / tapered pouring spout', rings, porcelain, caps=False)
    for dx in (-.063, .01, .072):
        fy = y - (.151 - abs(dx) * .21)
        path('Tea pot / painted leaf', [(x + dx - .016, fy, z + .100), (x + dx + .007, fy - .007, z + .116),
             (x + dx + .013, fy, z + .146), (x + dx - .01, fy, z + .131)], .007, cobalt, cyclic=True)


def lounge_tea_table(porcelain, cobalt, tea):
    x, y = -4.49, -3.125
    group('Lounge | Tea table', (x, y, 0))
    oval = .63
    for dx, dy in [(-.615, -.258), (.615, -.258), (-.615, .258), (.615, .258)]:
        path('Tea table / bent oak leg', [(x + dx * 1.07, y + dy * 1.12, .072), (x + dx, y + dy, .152),
             (x + dx * .87, y + dy * .78, .26), (x + dx, y + dy, .377), (x + dx * 1.03, y + dy, .451)], .061, dark_wood)
        ball('Tea table / carved foot', (x + dx * 1.07, y + dy * 1.12, .045), (.173, .145, .089), dark_wood)
    lounge_lathe('Tea table / lower apron', (x, y, 0), [(.797, .397), (.830, .413), (.861, .469), (.862, .491)], dark_wood, oval, 48)
    lounge_lathe('Tea table / solid oak top', (x, y, 0), [(.889, .478), (.932, .493), (.943, .513),
                 (.938, .539), (.905, .559), (.884, .561)], wood, oval, 56)
    path('Tea table / rim inlay', [(x + .866 * cos(2 * pi * i / 64), y + .866 * oval * sin(2 * pi * i / 64), .563)
         for i in range(64)], .005, trim, cyclic=True)
    group('Lounge | Tea service', (x, y, .565))
    lounge_cup(x - .354, y - .113, .565, porcelain, cobalt, tea)
    lounge_cup(x + .017, y - .277, .565, porcelain, cobalt, tea)
    lounge_teapot(x + .368, y + .081, .565, porcelain, cobalt)
    vx, vy, vz = x - .251, y + .248, .561
    lounge_lathe('Flower vase', (vx, vy, vz), [(.068, .002), (.092, .035), (.094, .090),
                 (.068, .151), (.056, .166), (.061, .194), (.059, .202), (.044, .202),
                 (.039, .182), (.045, .155)], cobalt)
    stem = material('Lounge / foliage green', '#48633d', .87)
    for i, (dx, dy, dz) in enumerate([(-.109, -.039, .297), (.078, .055, .344), (.010, -.064, .353),
                                       (-.061, .038, .402), (.118, -.030, .288)]):
        fx, fy, fz = vx + dx, vy + dy, vz + dz
        path('Flower / stem', [(vx, vy, vz + .157), (vx + dx * .45, vy + dy * .5, vz + .235), (fx, fy, fz)], .009, stem)
        ball('Flower / leaf', (vx + dx * .65, vy + dy * .5, vz + dz * .72), (.079, .030, .023), stem, i * .8)
        for petal in range(5):
            a = petal * 2 * pi / 5
            ball('Flower / ivory petal', (fx + .024 * cos(a), fy + .024 * sin(a), fz + .004),
                 (.042, .025, .019), cream, a)
        ball('Flower / pollen', (fx, fy, fz + .015), (.028, .028, .020), gold)
    finish_group()
    finish_group()


def build_inn_lounge():
    arm_dark = material('Lounge / aubergine upholstery shadows', '#47253e', .88)
    piping = material('Lounge / mulberry piping', '#84516e', .8)
    linen_welt = material('Lounge / linen piping', '#B58A52', .84)
    blue_binding = material('Lounge / faded blue binding', '#6e8caa', .84)
    porcelain = material('Lounge / glazed ivory porcelain', '#e8d9c2', .25)
    cobalt = material('Lounge / cobalt glaze', '#344e84', .28)
    tea = material('Lounge / brewed tea', '#894019', .24)
    lounge_sofa(arm_dark, piping, blue_binding, linen_welt)
    lounge_chair(arm_dark, piping, linen_welt)
    lounge_tea_table(porcelain, cobalt, tea)


build_inn_lounge()
