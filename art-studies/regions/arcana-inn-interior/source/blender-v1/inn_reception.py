"""Editable reception fixtures for the Arcana inn Blender scene."""

import math

import bpy
from mathutils import Vector


def build_inn_reception():
    walnut = material("Reception | polished walnut", "#6C3C24", .42)
    oak_edge = material("Reception | waxed oak edges", "#A86E3D", .47)
    tapestry = material("Reception | indigo linen", "#222D58", .9)
    parchment = material("Reception | parchment", "#E3C28A", .83)
    page = material("Reception | paper edges", "#BD9760", .82)
    ink = material("Reception | ink", "#654631", .9)
    green = material("Reception | notice illustration", "#526535", .91)
    leaf_green = material("Reception | olive foliage", "#526A35", .77)
    flower_gold = material("Reception | flower centers", "#DBA34D", .72)
    glaze = material("Reception | blue ceramic glaze", "#3F5C77", .28)
    leather = material("Reception | russet travel leather", "#774327", .56)
    glass_light = glow("Reception | lamp flame behind frosted panes", "#FFB957", 4.0)

    def mesh(name, anchor, verts, faces, mat):
        data = bpy.data.meshes.new(name)
        data.from_pydata(verts, [], faces)
        data.update()
        obj = bpy.data.objects.new(name, data)
        anchor.users_collection[0].objects.link(obj)
        obj.parent = anchor
        obj.data.materials.append(mat)
        return obj

    def diamond(name, x, y, z, w, h, r, mat):
        path(name, [(x, y, z + h), (x + w, y, z), (x, y, z - h),
                    (x - w, y, z)], r, mat, True)

    def oval(name, x, y, z, rx, rz, r, mat):
        points = [(x + math.cos(a * math.tau / 24) * rx, y,
                   z + math.sin(a * math.tau / 24) * rz) for a in range(24)]
        path(name, points, r, mat, True)

    def pottery(name, anchor, x, y, z, profile, mat):
        steps = 24
        verts = [(x + math.cos(i * math.tau / steps) * r,
                  y + math.sin(i * math.tau / steps) * r, z + h)
                 for r, h in profile for i in range(steps)]
        faces = [(j * steps + i, j * steps + (i + 1) % steps,
                  (j + 1) * steps + (i + 1) % steps, (j + 1) * steps + i)
                 for j in range(len(profile) - 1) for i in range(steps)]
        obj = mesh(name, anchor, verts, faces, mat)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True

    def guestbook(anchor, x, y, z):
        for direction in (-1, 1):
            cover = [(x, y - .21, z + .023), (x + direction * .30, y - .23, z + .012),
                     (x + direction * .31, y + .23, z + .049), (x, y + .21, z + .067)]
            obj = mesh("Guestbook | leather binding", anchor, cover, [(0, 1, 2, 3)], leather)
            solidify = obj.modifiers.new("Cover thickness", "SOLIDIFY")
            solidify.thickness = .022
            for offset, mat in [(.028, page), (.047, parchment)]:
                leaf = [(x + direction * .012, y - .18, z + offset + .02),
                        (x + direction * .15, y - .20, z + offset + .046),
                        (x + direction * .273, y - .20, z + offset + .018),
                        (x + direction * .28, y + .20, z + offset + .057),
                        (x + direction * .15, y + .202, z + offset + .08),
                        (x + direction * .012, y + .185, z + offset + .052)]
                book_faces = [(0, 1, 4, 5), (1, 2, 3, 4)]
                if direction < 0:
                    book_faces = [face[::-1] for face in book_faces]
                obj = mesh("Guestbook | curled pages", anchor, leaf, book_faces, mat)
                if mat == page:
                    solidify = obj.modifiers.new("Page block", "SOLIDIFY")
                    solidify.thickness = .034
            for row in range(5):
                line_y = y + .112 - row * .05
                line_z = z + .121 - row * .0045
                path("Guestbook | handwritten line", [(x + direction * .046, line_y, line_z - .012),
                     (x + direction * .15, line_y, line_z + .003),
                     (x + direction * (.21 + .017 * (row % 3)), line_y, line_z - .015)], .003, ink)
        path("Guestbook | blue ribbon bookmark", [(x - .012, y - .04, z + .096),
             (x - .027, y - .23, z + .068), (x + .021, y - .27, z + .008)], .011, tapestry)

    def counter_lamp(x, y, z):
        cyl("Reception lantern | brass foot", (x, y, z + .028), .152, .056, brass, 24, .012)
        cyl("Reception lantern | stem", (x, y, z + .085), .058, .115, brass, 16, .006)
        cyl("Reception lantern | lower ring", (x, y, z + .145), .127, .041, brass, 6, .006)
        cyl("Reception lantern | amber glass", (x, y, z + .285), .109, .273, glass_light, 6)
        for i in range(6):
            theta = i * math.tau / 6
            offset = (math.cos(theta), math.sin(theta))
            path("Reception lantern | upright", [(x + offset[0] * .123, y + offset[1] * .123, z + .143),
                 (x + offset[0] * .126, y + offset[1] * .126, z + .425)], .012, brass)
        cyl("Reception lantern | crown", (x, y, z + .423), .139, .046, brass, 6, .01)
        ball("Reception lantern | hood", (x, y, z + .462), (.241, .241, .123), brass)
        oval("Reception lantern | carrying ring", x, y, z + .536, .033, .038, .008, brass)
        point("Reception lantern | local light", (x, y - .15, z + .36), (1.0, .55, .25), 41, .20)

    def counter_textile(anchor, x, front, z):
        rows = [(.36, front + .31, z + .01), (.36, front + .035, z + .01),
                (.36, front - .049, z - .034), (.35, front - .061, z - .23),
                (.35, front - .062, z - .55), (.325, front - .067, z - .83),
                (.325, front - .073, z - .923)]
        verts = [(x + side * w, y + (0.008 if side == 0 else 0),
                  h - (.14 if index == len(rows) - 1 and side == 0 else 0))
                 for index, (w, y, h) in enumerate(rows) for side in (-1, 0, 1)]
        faces = [(index * 3 + side, (index + 1) * 3 + side,
                  (index + 1) * 3 + side + 1, index * 3 + side + 1)
                 for index in range(len(rows) - 1) for side in range(2)]
        obj = mesh("Counter runner | draped indigo linen", anchor, verts, faces, tapestry)
        solidify = obj.modifiers.new("Woven cloth thickness", "SOLIDIFY")
        solidify.thickness = .014
        for side in (-1, 1):
            edge = [(x + side * (w - .039), y - .007, h + .009) for w, y, h in rows]
            edge.append((x, front - .082, z - 1.026))
            path("Counter runner | woven border", edge, .009, gold)
        y = front - .076
        diamond("Counter runner | central embroidery", x, y, z - .63, .116, .156, .01, gold)
        diamond("Counter runner | central gold lozenge", x, y - .006, z - .63, .047, .064, .009, brass)
        for side in (-1, 1):
            for vertical in (-1, 1):
                path("Counter runner | embroidery sprig", [(x + side * .05, y, z - .63),
                     (x + side * .19, y, z - .63 + vertical * .051),
                     (x + side * .151, y, z - .63 + vertical * .102)], .009, gold)
        for i in range(13):
            u = (i - 6) / 6
            h = z - 1.063 + .14 * abs(u)
            path("Counter runner | gold fringe", [(x + u * .316, front - .078, h + .015),
                 (x + u * .329, front - .081, h - .049)], .01, gold)

    anchor = group("Reception counter")
    x, y, front = 3.8, 2.0, 1.47
    box("Counter | oak carcass", (x, y, .58), (3.43, .94, 1.095), walnut, .043)
    box("Counter | dark plinth", (x, y, .07), (3.56, .99, .135), dark_wood, .028)
    box("Counter | base bead", (x, y, .155), (3.51, .97, .045), oak_edge, .01)
    box("Counter | underside cove", (x, y, 1.085), (3.56, 1.01, .09), dark_wood, .024)
    box("Counter | oak worktop", (x, y, 1.166), (3.65, 1.06, .145), wood, .052)
    box("Counter | front edge bead", (x, 1.491, 1.133), (3.44, .036, .033), oak_edge, .012)
    box("Counter | carved front rail", (x, 1.51, .994), (3.35, .072, .099), oak_edge, .013)
    for dx in (-1.66, -.86, .86, 1.66):
        box("Counter | pilaster", (x + dx, 1.491, .556), (.137, .152, .79), wood, .026)
        box("Counter | pilaster base", (x + dx, 1.468, .213), (.202, .176, .124), oak_edge, .022)
        box("Counter | pilaster capital", (x + dx, 1.465, .902), (.197, .171, .093), oak_edge, .017)
    for dx in (-1.26, -.45, .45, 1.26):
        panel_x = x + dx
        box("Counter | recessed field", (panel_x, 1.514, .565), (.626, .043, .643), dark_wood, .048)
        box("Counter | raised inner panel", (panel_x, 1.486, .54), (.455, .047, .482), walnut, .053)
        cut = [(panel_x - .274, 1.458, .295), (panel_x + .274, 1.458, .295),
               (panel_x + .274, 1.458, .711), (panel_x + .157, 1.458, .829),
               (panel_x - .157, 1.458, .829), (panel_x - .274, 1.458, .711)]
        path("Counter | carved arched panel outline", cut, .017, oak_edge, True)
        diamond("Counter | panel carving", panel_x, 1.458, .55, .071, .117, .009, oak_edge)
    for dx in (-1.68, 1.68):
        box("Counter | side inset", (x + dx, y, .59), (.13, .59, .63), dark_wood, .042)
        box("Counter | side raised panel", (x + dx * 1.033, y, .59), (.059, .465, .498), walnut, .035)
    counter_textile(anchor, x, front, 1.24)
    guestbook(anchor, x, 1.83, 1.263)
    counter_lamp(x - 1.28, 1.96, 1.24)
    bell_x = x + .71
    cyl("Reception bell | wood base", (bell_x, 1.83, 1.259), .103, .033, dark_wood, 24, .009)
    ball("Reception bell | brass dome", (bell_x, 1.83, 1.306), (.155, .155, .098), brass)
    ball("Reception bell | striker", (bell_x, 1.83, 1.366), (.048, .048, .04), gold)
    vase_x, vase_y, base_z = x + 1.23, 2.035, 1.239
    pottery("Reception vase | thrown ceramic", anchor, vase_x, vase_y, base_z,
            [(.02, .006), (.099, .009), (.115, .045), (.142, .103), (.136, .169),
             (.108, .215), (.071, .249), (.063, .282), (.076, .293), (.068, .305), (.047, .298),
             (.049, .275), (.057, .239), (.077, .195)], glaze)
    for level, radius in ((.073, .13), (.181, .131), (.285, .071)):
        path("Reception vase | painted band", [(vase_x + radius * math.cos(i * math.tau / 32),
             vase_y + radius * math.sin(i * math.tau / 32), base_z + level) for i in range(32)],
             .007, cream, True)
    for i in range(8):
        theta = i * 2.4
        reach = .12 + .034 * (i % 4)
        tip = (vase_x + math.cos(theta) * reach, vase_y + math.sin(theta) * reach,
               base_z + .455 + .062 * (i % 3))
        path("Vase bouquet | stem", [(vase_x, vase_y, base_z + .253), tip], .009, leaf_green)
        ball("Vase bouquet | leaf", (tip[0] - .04, tip[1], tip[2] - .105),
             (.151, .055, .041), leaf_green, theta)
        for petal in range(5):
            angle = petal * math.tau / 5 + theta
            ball("Vase bouquet | petal", (tip[0] + math.cos(angle) * .039, tip[1] + math.sin(angle) * .028,
                 tip[2] + math.sin(angle) * .028), (.066, .042, .047), cream, angle)
        ball("Vase bouquet | pollen center", (tip[0], tip[1] - .019, tip[2] + .01),
             (.046, .035, .043), flower_gold)
    finish_group()

    board = group("Quest board")
    x, y, z = .95, 5.04, 2.14
    box("Quest board | carved frame", (x, y, z), (1.58, .14, 1.22), dark_wood, .051)
    box("Quest board | tack surface", (x, y - .075, z), (1.38, .039, 1.015), leather, .024)
    for dz in (-.572, .572):
        box("Quest board | horizontal oak moulding", (x, y - .12, z + dz), (1.62, .112, .107),
            oak_edge, .021)
    for dx in (-.753, .753):
        box("Quest board | side oak moulding", (x + dx, y - .119, z), (.116, .109, 1.082), wood, .023)
        for dz in (-.542, .542):
            box("Quest board | brass corner", (x + dx, y - .183, z + dz), (.14, .049, .13), brass, .016)
    crest = [(x - .67, y - .147, z + .625), (x - .49, y - .147, z + .676),
             (x - .22, y - .147, z + .717), (x - .145, y - .147, z + .788),
             (x + .145, y - .147, z + .788), (x + .22, y - .147, z + .717),
             (x + .49, y - .147, z + .676), (x + .67, y - .147, z + .625)]
    path("Quest board | curved oak crest", crest, .043, walnut)
    diamond("Quest board | crest ornament", x, y - .188, z + .734, .062, .073, .01, brass)
    for index, (dx, dz, w, h, angle) in enumerate(((-.43, .18, .279, .36, -.11),
                                                  (.056, -.063, .48, .60, .047),
                                                  (.47, -.17, .195, .294, -.066),
                                                  (-.429, -.277, .183, .211, .129))):
        px, pz, py = x + dx, z + dz, y - .107 - index * .003
        vertices = [(px + u * math.cos(angle) - v * math.sin(angle), py,
                     pz + u * math.sin(angle) + v * math.cos(angle))
                    for u, v in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        mesh("Quest board | pinned paper", board, vertices, [(0, 1, 2, 3)], parchment)
        ball("Quest board | brass pushpin", (px - h * .37 * math.sin(angle), py - .02,
             pz + h * .37 * math.cos(angle)), (.043, .033, .043), brass)
        for line in range(3):
            left = -.34 * w
            right = (.34 - line * .055) * w
            v = (.15 - line * .15) * h if index != 1 else (-.24 - line * .069) * h
            path("Quest board | handwritten notice", [(px + u * math.cos(angle) - v * math.sin(angle),
                 py - .005, pz + u * math.sin(angle) + v * math.cos(angle)) for u in (left, right)], .004, ink)
        if index == 1:
            box("Quest board | painted tree trunk", (px, py - .011, pz - .04), (.033, .011, .115), ink, .003)
            ball("Quest board | painted tree crown", (px, py - .014, pz + .044), (.233, .017, .174), green)
            ball("Quest board | painted upper foliage", (px - .022, py - .015, pz + .123),
                 (.158, .016, .096), leaf_green)
    finish_group()

    group("Brass room-key rack")
    x, y, z = 3.75, 5.044, 2.2
    box("Key rack | framed oak backing", (x, y, z), (1.43, .135, 1.16), dark_wood, .044)
    box("Key rack | recessed walnut panel", (x, y - .072, z), (1.222, .044, .963), walnut, .04)
    for side in (-1, 1):
        box("Key rack | rounded side post", (x + side * .689, y - .107, z),
            (.081, .092, 1.092), wood, .02)
        ball("Key rack | turned finial", (x + side * .689, y - .105, z + .614), (.123, .106, .116), oak_edge)
    for dz in (-.55, .56):
        box("Key rack | frame rail", (x, y - .116, z + dz), (1.42, .11, .084), oak_edge, .02)
    path("Key rack | carved crest", [(x - .58, y - .138, z + .601), (x - .27, y - .138, z + .655),
         (x - .11, y - .138, z + .728), (x + .11, y - .138, z + .728),
         (x + .27, y - .138, z + .655), (x + .58, y - .138, z + .601)], .048, walnut)
    for row in range(2):
        dz = .29 - .51 * row
        box("Key rack | hanger rail", (x, y - .109, z + dz), (1.227, .055, .066), wood, .012)
        for column in range(5):
            kx = x + (column - 2) * .231
            kz = z + dz - .087
            ky = y - .167 - .011 * (column % 2)
            ball("Key rack | rounded hanger hook", (kx, ky + .012, kz + .074), (.044, .062, .038), brass)
            oval("Room key | ring", kx, ky, kz, .043, .045, .011, gold)
            path("Room key | shaft and teeth", [(kx, ky, kz - .043), (kx, ky, kz - .208),
                 (kx + .051, ky, kz - .208), (kx + .051, ky, kz - .183),
                 (kx + .021, ky, kz - .183)], .01, brass)
    finish_group()

    def bench(name, x, y, width):
        anchor = group(name)
        box("Bench | storage carcass", (x, y, .24), (width - .10, .59, .408), walnut, .032)
        box("Bench | foot rail", (x, y - .006, .074), (width, .644, .104), dark_wood, .016)
        box("Bench | seat frame", (x, y, .468), (width, .665, .098), wood, .021)
        box("Bench | plum seat cushion", (x, y - .023, .568), (width - .258, .55, .151), plum, .071)
        box("Bench | low paneled back", (x, y + .266, .692), (width - .148, .135, .41), walnut, .032)
        box("Bench | top crest rail", (x, y + .274, .916), (width - .14, .156, .084), wood, .027)
        for side in (-1, 1):
            px = x + side * (width / 2 - .061)
            for dy in (-.255, .275):
                post_h = .718 if dy < 0 else .955
                box("Bench | oak corner post", (px, y + dy, post_h / 2), (.131, .131, post_h), wood, .019)
                ball("Bench | turned post cap", (px, y + dy, post_h + .025), (.147, .147, .1), oak_edge)
            box("Bench | carved side arm", (px, y + .001, .73), (.128, .629, .09), walnut, .027)
            pillow_x = x + side * (width / 2 - .455)
            pillow = box("Bench | linen scatter pillow", (pillow_x, y + .106, .749),
                         (.392, .137, .344), linen, .065)
            pillow.rotation_euler.x = math.radians(-19)
            pillow.rotation_euler.y = side * math.radians(14)
            # Put the stitched diamond on the rotated front and center it in
            # the inn's 45-degree orthographic view of the whole cushion.
            bpy.context.view_layer.update()
            view = pillow.matrix_world.to_3x3().inverted() @ Vector((0, -1, 1))
            center = view * (-.0785 / view.y)
            points = [pillow.matrix_world @ Vector((center.x + dx, center.y, center.z + dz))
                      for dx, dz in ((0, .073), (.065, 0), (0, -.073), (-.065, 0))]
            path("Bench pillow | woven lozenge", points, .008, gold, cyclic=True)
        for col in (-1, 0, 1):
            dx = col * (width - .36) / 3
            panel_width = (width - .36) / 3 - .043
            box("Bench | drawer face", (x + dx, y - .298, .282), (panel_width, .06, .239), wood, .024)
            box("Bench | recessed drawer field", (x + dx, y - .334, .282),
                (panel_width - .075, .022, .155), walnut, .018)
            oval("Bench | drawer pull", x + dx, y - .353, .281, .052, .025, .009, brass)
        tx = x + .224
        ty = y - .362
        verts = [(tx + dx, yy, zz) for yy, zz in ((y + .032, .65), (ty + .032, .649),
                 (ty, .599), (ty - .004, .387)) for dx in (-.196, .196)]
        obj = mesh("Bench | folded blue wool", anchor, verts, [(0, 2, 3, 1), (2, 4, 5, 3), (4, 6, 7, 5)], blue)
        solidify = obj.modifiers.new("Wool thickness", "SOLIDIFY")
        solidify.thickness = .014
        for dx in (-.164, .164):
            path("Bench throw | embroidered hem", [(tx + dx, y + .032, .66), (tx + dx, ty + .033, .659),
                 (tx + dx, ty - .01, .602), (tx + dx, ty - .015, .393)], .008, gold)
        for i in range(7):
            strand_x = tx + (i - 3) * .052
            path("Bench throw | fringe", [(strand_x, ty - .013, .397),
                 (strand_x, ty - .016, .354 - .006 * (i % 2))], .009, gold)
        finish_group()

    bench("Back-wall storage bench", -.35, 4.2, 2.63)
    bench("Entry-side storage bench", 4.55, -3.52, 2.55)

    def suitcase(name, x, y, z, width, depth, height, mat):
        box(name + " | leather shell", (x, y, z + height / 2), (width, depth, height), mat, .052)
        box(name + " | leather lid", (x, y, z + height - .067), (width + .026, depth + .029, .149),
            mat, .043)
        box(name + " | lid seam", (x, y - depth / 2 - .012, z + height - .148),
            (width - .065, .016, .018), dark_wood, .005)
        for side in (-1, 1):
            sx = x + side * width * .327
            box(name + " | leather strap over top", (sx, y, z + height + .012),
                (.092, depth - .037, .031), walnut, .012)
            box(name + " | leather strap down front", (sx, y - depth / 2 - .015, z + height / 2),
                (.092, .036, height - .036), walnut, .012)
            box(name + " | brass clasp", (sx, y - depth / 2 - .037, z + height * .63),
                (.067, .026, .073), brass, .011)
        for sx in (-1, 1):
            for sy in (-1, 1):
                ball(name + " | brass top corner", (x + sx * (width / 2 - .043),
                     y + sy * (depth / 2 - .038), z + height - .022), (.099, .085, .079), brass)
                ball(name + " | brass bottom corner", (x + sx * (width / 2 - .043),
                     y + sy * (depth / 2 - .038), z + .032), (.097, .087, .076), brass)
        fy = y - depth / 2 - .03
        hz = z + height * .59
        path(name + " | turned leather handle", [(x - .122, fy, hz), (x - .089, fy - .029, hz - .059),
             (x + .089, fy - .029, hz - .059), (x + .122, fy, hz)], .018, dark_wood)

    group("Travel luggage")
    suitcase("Large travel case", 6.53, -.955, .015, 1.07, .62, .45, leather)
    suitcase("Indigo valise", 6.37, -.952, .472, .71, .47, .322, tapestry)
    box("Travel case | luggage tag", (6.68, -1.211, .683), (.11, .033, .149), parchment, .013, -.13)
    path("Travel case | luggage tag cord", [(6.62, -1.204, .79), (6.64, -1.229, .737),
         (6.683, -1.227, .738)], .009, trim)
    finish_group()


build_inn_reception()
