"""Stone fireplace and oak library for the Arcana inn."""

import bpy
from math import cos, pi, sin, tau
from random import Random


def make_inn_hearth():
    rng = Random(362)
    stones = [
        material("Hearth limestone | ochre", "#A77854"),
        material("Hearth limestone | wheat", "#CAA078"),
        material("Hearth limestone | brown", "#967052"),
        material("Hearth limestone | sand", "#B98A61"),
        material("Hearth limestone | pale", "#D1AA81"),
    ]
    mortar = material("Hearth joints | umber", "#675146")
    soot = material("Hearth soot", "#231913")
    ash = material("Hearth ash", "#554039")
    bark = material("Firewood | bark", "#553927")
    grain = material("Firewood | end grain", "#B48152")
    ring_color = material("Firewood | growth rings", "#876040")
    group("01 • Limestone hearth", (-5.60, 4.35, 0))
    x = -5.60

    def prism(name, outline, y_front, y_back, mat, edge=0):
        vertices = [(px, y, pz) for y in (y_front, y_back) for px, pz in outline]
        count = len(outline)
        faces = [tuple(range(count)), tuple(range(2 * count - 1, count - 1, -1))]
        for index in range(count):
            following = (index + 1) % count
            faces.append((following, index, index + count, following + count))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        attach(obj)
        mesh.materials.append(mat)
        if edge:
            bevel = obj.modifiers.new("Soft stone edges", "BEVEL")
            bevel.width = edge
            bevel.segments = 2
        return obj

    box("Flagstone plinth", (x, 4.32, .09), (2.74, 1.57, .18), stones[2], .035)
    for idx in range(6):
        box("Hearth slab", (x - 1.12 + idx * .448, 3.75, .16),
            (.433, .47, .10), stones[idx % len(stones)], .025)
    box("Ash bed", (x, 4.51, .17), (1.61, 1.11, .09), ash, .02)
    box("Firebox back", (x, 4.99, .94), (1.75, .20, 1.54), soot, .02)
    for side in (-1, 1):
        box("Hearth mortar core", (x + side * 1.035, 4.64, 1.14),
            (.36, .88, 2.0), mortar, .025)
        box("Firebox stone lining", (x + side * .83, 4.65, .64),
            (.10, .69, .91), stones[2], .02)
        for row in range(3):
            box("Jamb block", (x + side * 1.04, 4.43, .32 + .242 * row),
                (.43 + rng.uniform(-.03, .03), .73, .225),
                stones[(row + side) % len(stones)], .027)
        box("Jamb cap", (x + side * 1.015, 4.48, .93),
            (.45, .83, .13), stones[4], .024)

    spring_z = .95
    for index in range(11):
        start = pi * index / 11 + .016
        end = pi * (index + 1) / 11 - .016
        thickness = 1.25 if index == 5 else 1.18
        profile = [
            (x + .795 * cos(start), spring_z + .795 * sin(start)),
            (x + thickness * cos(start), spring_z + thickness * sin(start)),
            (x + thickness * cos(end), spring_z + thickness * sin(end)),
            (x + .795 * cos(end), spring_z + .795 * sin(end)),
        ]
        prism("Arch keystone" if index == 5 else "Arch voussoir",
              profile, 4.065 if index == 5 else 4.11, 4.92,
              stones[4] if index == 5 else stones[index % 4], .027)

    for side in (-1, 1):
        inside, outside = x + side * .81, x + side * 1.23
        lower_x, upper_x = min(inside, outside), max(inside, outside)
        box("Spandrel high course", ((lower_x + upper_x) / 2, 4.73, 2.095),
            (upper_x - lower_x, .61, .16), stones[2], .02)
    box("Mantel stone lintel", (x, 4.57, 2.23), (2.50, .84, .18), stones[3], .04)
    box("Mantel chamfered underside", (x, 4.48, 2.33), (2.56, 1.00, .12),
        dark_wood, .035)
    box("Mantel oak shelf", (x, 4.42, 2.44), (2.78, 1.14, .15), wood, .036)
    box("Mantel bead molding", (x, 3.86, 2.405), (2.71, .035, .052), trim, .012)
    for side in (-1, 1):
        box("Mantel bracket", (x + side * 1.04, 4.23, 2.16),
            (.21, .37, .24), dark_wood, .042)

    box("Chimney mortar core", (x, 4.87, 3.025), (1.86, .49, 1.075), mortar, .025)
    for row in range(4):
        widths = (.50, .55, .48, .33) if row % 2 else (.33, .48, .55, .50)
        left = x - .93
        for width in widths:
            front = 4.56 + rng.uniform(-.024, .024)
            box("Chimney stone", (left + width / 2, front + .24, 2.62 + row * .254),
                (width - .023, .48, .234), rng.choice(stones), .027)
            left += width
    box("Chimney top cap", (x, 4.86, 3.575), (2.02, .64, .12), stones[3], .025)

    # Low iron andirons leave the fire visible through the arch.
    for side in (-1, 1):
        dx = side * .61
        path("Andiron foot", [(x + dx - .12, 4.095, .195), (x + dx, 4.16, .25),
                              (x + dx + .13, 4.10, .195)], .022, iron)
        cyl("Andiron upright", (x + dx, 4.15, .39), .026, .43, iron, 12)
        ball("Andiron finial", (x + dx, 4.15, .62), (.09, .09, .09), iron)
    for row in range(2):
        path("Cast grate rail", [(x - .63, 4.19, .26 + row * .15),
                                 (x + .63, 4.19, .26 + row * .15)], .024, iron)
    for index in range(7):
        path("Cast grate picket", [(x - .48 + index * .16, 4.22, .24),
                                   (x - .48 + index * .16, 4.19, .47)], .013, iron)

    def split_log(location, radius, length, tilt=0):
        px, py, pz = location
        log = cyl("Split firewood", location, radius, length, bark, 10, .008)
        log.rotation_euler = (pi / 2, 0, tilt)
        center_x = px + sin(tilt) * length / 2
        center_y = py - cos(tilt) * length / 2
        cross_x, cross_y = cos(tilt), sin(tilt)
        cut = cyl("Firewood cut end", (center_x, center_y - .009, pz),
                  radius * .88, .016, grain, 10, .006)
        cut.rotation_euler = log.rotation_euler
        for fraction in (.41, .68):
            r = radius * fraction
            points = [(center_x + cos(theta) * r * cross_x,
                       center_y - .019 + cos(theta) * r * cross_y,
                       pz + sin(theta) * r)
                      for theta in (tau * k / 14 for k in range(14))]
            path("Firewood growth ring", points, .006, ring_color, cyclic=True)

    for px, pz in ((-1.38, .12), (-1.62, .12), (-1.49, .31), (-1.27, .31), (-1.40, .51)):
        split_log((x + px, 4.55, pz), .103, .42, rng.uniform(-.09, .10))
    for px, py, angle in ((-.35, 4.46, .76), (.18, 4.43, -.57), (.31, 4.54, .59)):
        split_log((x + px, py, .29), .11, .53, angle)

    ember = glow("Fire | ember", "#F74E09", 2.2)
    flame_orange = glow("Fire | outer amber", "#FF5506", 1.1)
    flame_gold = glow("Fire | gold", "#FF9821", 2.0)
    flame_white = glow("Fire | pale heart", "#FFD15C", 3.7)
    for index in range(11):
        ball("Glowing coal", (x + rng.uniform(-.51, .51), rng.uniform(4.28, 4.65), .25),
             (rng.uniform(.06, .20), .09, .053), ember)

    def flame(px, py, base, width, height, lean, mat):
        # Asymmetric conical rings create billowing flames with real depth.
        rings = ((0, 0, .54), (.19, -.07, 1), (.43, .12, .70),
                 (.65, -.12, .41), (.83, .13, .21), (1, 0, .012))
        vertices = []
        for fraction, offset, breadth in rings:
            for side in range(8):
                angle = tau * side / 8
                vertices.append((px + width * (offset + breadth * cos(angle)) + lean * fraction,
                                 py + width * .66 * breadth * sin(angle) + .07 * fraction,
                                 base + fraction * height))
        faces = [tuple(reversed(range(8))), tuple(range(40, 48))]
        for row in range(5):
            for index in range(8):
                current = row * 8 + index
                following = row * 8 + (index + 1) % 8
                faces.append((current, following, following + 8, current + 8))
        mesh = bpy.data.meshes.new("Flame volume")
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new("Flame volume", mesh)
        attach(obj)
        mesh.materials.append(mat)
        for polygon in mesh.polygons:
            polygon.use_smooth = True

    for dx, y, width, height, lean in (
        (-.46, 4.43, .11, .53, .04), (-.28, 4.48, .14, .76, -.10),
        (-.10, 4.43, .16, 1.04, .13), (.09, 4.57, .14, .86, -.13),
        (.25, 4.48, .16, .72, .11), (.45, 4.44, .10, .52, .03),
    ):
        flame(x + dx, y, .30, width, height, lean, flame_orange)
        flame(x + dx + .015, y - .093, .30, width * .74, height * .79, lean, flame_gold)
        if height > .6:
            flame(x + dx, y - .154, .30, width * .42, height * .48, lean * .5, flame_white)
    for index in range(8):
        size = rng.uniform(.019, .035)
        ball("Rising ember", (x + rng.uniform(-.47, .46), rng.uniform(4.34, 4.48),
                              rng.uniform(.77, 1.55)), (size, size, size * 1.45), flame_gold)
    point("Firelight | hearth", (x, 4.02, .66), (1.0, .33, .095), 100, .30)
    point("Firelight | bounced on stone", (x, 3.90, .43), (1.0, .41, .13), 55, .43)

    tool_x = x + 1.45
    cyl("Hearth tool stand foot", (tool_x, 4.35, .068), .16, .104, iron, 16, .015)
    cyl("Hearth tool stand", (tool_x, 4.35, .52), .026, .92, iron, 12)
    path("Hearth tool rack", [(tool_x - .12, 4.35, .91), (tool_x + .12, 4.35, .91)], .022, iron)
    for offset in (-.11, .10):
        path("Fireplace tool", [(tool_x + offset, 4.31, .16), (tool_x + offset, 4.31, .85)],
             .016, iron)
        ball("Hearth tool handle", (tool_x + offset, 4.31, .85), (.066, .066, .13), brass)
    box("Ash shovel head", (tool_x + .10, 4.30, .18), (.11, .040, .14), iron, .021)

    dial = material("Mantel clock face", "#D8B982")
    box("Clock stepped foot", (x - .11, 4.10, 2.56), (.53, .25, .085), dark_wood, .026)
    box("Clock case", (x - .11, 4.11, 2.70), (.42, .22, .26), wood, .05)
    ball("Clock domed cap", (x - .11, 4.115, 2.80), (.42, .22, .23), wood)
    rim = cyl("Clock brass bezel", (x - .11, 3.983, 2.737), .161, .025, brass)
    rim.rotation_euler.x = pi / 2
    face = cyl("Clock dial", (x - .11, 3.966, 2.737), .136, .014, dial)
    face.rotation_euler.x = pi / 2
    path("Clock hands", [(x - .16, 3.949, 2.715), (x - .11, 3.949, 2.737),
                         (x - .097, 3.949, 2.818)], .009, iron)
    for index in range(12):
        angle = tau * index / 12
        ball("Clock hour dot", (x - .11 + cos(angle) * .111, 3.953,
                                2.737 + sin(angle) * .111), (.015, .012, .015), iron)

    for idx, base in enumerate((2.70, 2.73, 2.66)):
        book_x = x + .30 + idx * .13
        box("Mantel book pages", (book_x, 4.13, base), (.092, .18, 2 * (base - 2.515)),
            cream, .012)
        box("Mantel book spine", (book_x, 4.032, base), (.111, .05, 2 * (base - 2.50)),
            (plum, trim, blue)[idx], .015)
    cyl("Candlestick saucer", (x - .61, 4.06, 2.542), .095, .046, brass, 16, .01)
    cyl("Mantel beeswax candle", (x - .61, 4.06, 2.66), .048, .20, cream, 14, .015)
    ball("Candle flame", (x - .61, 4.06, 2.801), (.041, .042, .084), flame_gold)

    leafy = [material("Ivy | dark leaf", "#35502A"), material("Ivy | sage leaf", "#547340"),
             material("Ivy | new growth", "#748849")]
    stem = material("Ivy stem", "#4D5934")

    def ceramic(name, px, py, pz, scale, mat):
        ball(name, (px, py, pz + scale * .49), (scale, scale, scale * .95), mat)
        cyl(name + " neck", (px, py, pz + scale * .91), scale * .26, scale * .28,
            mat, 16, .02)
        cyl(name + " lip", (px, py, pz + scale * 1.05), scale * .30, scale * .08,
            mat, 16, .013)

    for side, size, pot in ((-1, .27, clay), (1, .30, blue)):
        px = x + side * .98
        py = 4.22
        ceramic("Mantel flower vase", px, py, 2.516, size, pot)
        for index in range(7):
            angle = tau * index / 7
            reach = rng.uniform(.10, .23)
            tip = (px + reach * cos(angle), py + reach * sin(angle),
                   2.52 + size + rng.uniform(.20, .35))
            path("Flower stem", [(px, py, 2.52 + size * .9), tip], .012, stem)
            ball("Flower leaf", ((tip[0] + px) / 2, (tip[1] + py) / 2,
                                 (tip[2] + 2.52 + size * .9) / 2),
                 (.13, .072, .043), leafy[index % 3], angle)
            for petal in range(5):
                around = tau * petal / 5
                ball("Cream petal", (tip[0] + .04 * cos(around), tip[1] + .04 * sin(around),
                                     tip[2]), (.063, .065, .039), cream, around)
            ball("Flower center", (tip[0], tip[1], tip[2] + .019), (.052, .052, .033), gold)
    finish_group()

    x = -2.96
    group("02 • Oak bookcase", (x, 4.60, 0))
    box("Bookcase paneled back", (x, 5.018, 1.56), (1.62, .13, 3.01), dark_wood, .025)
    for side in (-1, 1):
        dx = x + side * .794
        box("Bookcase side", (dx, 4.73, 1.55), (.134, .67, 2.93), wood, .025)
        box("Bookcase fluted stile", (dx, 4.367, 1.54), (.123, .091, 2.85), trim, .014)
        box("Bookcase foot", (dx, 4.67, .107), (.19, .63, .21), dark_wood, .031)
        box("Bookcase pilaster collar", (dx, 4.38, 2.89), (.175, .11, .18), wood, .026)

    for height in (.22, 1.075, 1.625, 2.196, 2.79):
        box("Bookcase oak shelf", (x, 4.70, height), (1.57, .68, .089), wood, .021)
        box("Bookcase shelf edge", (x, 4.35, height), (1.61, .06, .049), trim, .011)
    box("Bookcase stepped cornice", (x, 4.68, 3.04), (1.82, .80, .14), dark_wood, .035)
    box("Bookcase crown", (x, 4.68, 3.13), (1.93, .84, .09), wood, .026)
    box("Bookcase crown trim", (x, 4.265, 3.107), (1.84, .038, .049), trim, .011)

    for side in (-1, 1):
        dx = x + .362 * side
        box("Bookcase cupboard door", (dx, 4.359, .651), (.699, .106, .758), wood, .025)
        box("Bookcase recessed door panel", (dx, 4.297, .651), (.500, .024, .554),
            dark_wood, .016)
        box("Bookcase raised door panel", (dx, 4.278, .651), (.421, .037, .463), wood, .023)
        ball("Bookcase brass knob", (dx - .216 * side, 4.244, .715), (.074, .068, .074), brass)

    leather = [plum, blue, material("Book leather | copper", "#864B32"),
               material("Book leather | moss", "#445549"),
               material("Book leather | cognac", "#9C663F"),
               material("Book leather | wine", "#5D352F")]

    def books(start_x, z, widths):
        left = start_x
        for width in widths:
            height = rng.uniform(.26, .42)
            px = left + width / 2
            mat = rng.choice(leather)
            box("Bound pages", (px, 4.64, z + height / 2),
                (width * .75, .265, height * .94), cream, .009)
            box("Leather spine", (px, 4.485, z + height / 2),
                (width, .051, height), mat, .012)
            for offset in (-.032, .030):
                box("Spine foil band", (px, 4.457, z + height * .82 + offset),
                    (width * .77, .008, .008), gold, .002)
            left += width + .012

    books(x - .68, 1.123, (.13, .103, .17, .108, .082))
    books(x - .68, 1.672, (.11, .135, .11, .17, .093, .12))
    books(x - .68, 2.245, (.107, .14, .08))
    books(x + .20, 2.245, (.105, .115, .15))
    ceramic("Ocher pottery jar", x + .13, 4.62, 1.121, .25, clay)
    ceramic("Blue medicine bottle", x + .45, 4.65, 1.121, .21, blue)
    ceramic("Cream pottery jar", x - .04, 4.65, 2.24, .25, linen)

    # A tiny armillary adds a brass silhouette in the open upper bay.
    arm_x, arm_y, arm_z = x + .39, 4.62, 1.953
    cyl("Armillary foot", (arm_x, arm_y, 1.704), .139, .06, brass, 18, .012)
    cyl("Armillary spindle", (arm_x, arm_y, 1.831), .019, .211, brass, 12)
    for plane in (0, pi / 3, pi * .7):
        points = [(arm_x + cos(angle) * .173 * cos(plane),
                   arm_y + cos(angle) * .173 * sin(plane),
                   arm_z + sin(angle) * .173)
                  for angle in (tau * idx / 24 for idx in range(24))]
        path("Armillary ring", points, .012, brass, cyclic=True)
    ball("Armillary center", (arm_x, arm_y, arm_z), (.073, .073, .073), gold)

    for side, count in ((-1, 12), (1, 9)):
        dx = x + side * .77
        points = [(dx + sin(idx * .78) * .062, 4.318 + cos(idx * .85) * .019,
                   3.145 - idx * .107) for idx in range(count)]
        path("Bookcase hanging ivy", points, .012, stem)
        for idx, (px, py, pz) in enumerate(points):
            lateral = -1 if idx % 2 == 0 else 1
            path("Ivy petiole", [(px, py, pz),
                                 (px + lateral * .065, py - .034, pz - .025)], .006, stem)
            leaf = ball("Hanging ivy leaf", (px + lateral * .109, py - .045, pz - .039),
                        (.145, .059, .101), leafy[idx % 3], lateral * .29)
            leaf.rotation_euler.y = lateral * .53
    finish_group()


make_inn_hearth()
