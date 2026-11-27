"""Compose a presentation sheet from a Blender render and its site layout."""

import argparse
from functools import cache
import json
import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


HERE = Path(__file__).resolve().parent
WIDTH, HEIGHT = 2400, 1500
PAPER = "#F4F0E6"
INK = "#233746"
SECONDARY = "#475B63"
COPPER = "#8A422B"
RULE = "#ABAAA0"
ROAD = "#FFF8E6"
LANE = "#F3D394"
WATER = "#95BABA"
GRID = "#DDD8CA"
GROUND = "#E8E3D7"
LOWER_TERRACE = "#ECD1BA"
UPPER_TERRACE = "#CEAA8D"


def terrace_color(elevation, highest):
    if elevation <= 0:
        return GROUND
    return UPPER_TERRACE if elevation == highest else LOWER_TERRACE


def elevation_label(height):
    return f"{height:+.1f}" if height else "±0.0"


def stair_steps(stair):
    return stair.get("steps", max(1, round((stair["high"] - stair["low"]) / 0.2)))


def section_cut(layout):
    x_min, _, x_max, _ = layout["bounds"]
    terraces = layout["terraces"]
    stairs = layout["stairs"]
    edges = {x_min, x_max}
    for feature in terraces + stairs:
        edges.update((feature["rect"][0], feature["rect"][2]))
    edges = sorted(edges)

    def overlaps(feature, x):
        return feature["rect"][0] < x < feature["rect"][2]

    def score(x):
        levels = {terrace["height"] for terrace in terraces if overlaps(terrace, x)}
        stairs_crossed = sum(overlaps(stair, x) for stair in stairs)
        return len(levels), stairs_crossed, -abs(x)

    return max(((a + b) / 2 for a, b in zip(edges, edges[1:])), key=score)


def terrain_profile(layout, x):
    _, z_min, _, z_max = layout["bounds"]
    heights = [
        (t["rect"][1], t["rect"][3], t["height"])
        for t in layout["terraces"] if t["rect"][0] < x < t["rect"][2]
    ]
    for stair in layout["stairs"]:
        west, north, east, south = stair["rect"]
        if not west < x < east:
            continue
        count = stair_steps(stair)
        tread = (south - north) / count
        rise = (stair["high"] - stair["low"]) / count
        for step in range(count):
            height = stair["high"] if step == count - 1 else stair["low"] + (step + 1) * rise
            heights.append((south - (step + 1) * tread, south - step * tread, height))
    edges = {z_min, z_max}
    for north, south, _ in heights:
        edges.update((north, south))
    edges = sorted(edges, reverse=True)
    spans = []
    for south, north in zip(edges, edges[1:]):
        middle = (south + north) / 2
        height = max((height for a, b, height in heights if a < middle < b), default=0)
        if spans and spans[-1][2] == height:
            spans[-1] = (spans[-1][0], north, height)
        else:
            spans.append((south, north, height))
    return spans


def wrapped_lines(draw, text, font, available):
    line = ""
    for word in text.split():
        candidate = f"{line} {word}" if line else word
        if draw.textlength(candidate, font=font) <= available:
            line = candidate
            continue
        if line:
            yield line
        line = ""
        for letter in word:
            if line and draw.textlength(line + letter, font=font) > available:
                yield line
                line = ""
            line += letter
    if line:
        yield line


class Blueprint:
    def __init__(self, layout, regular, bold):
        self.layout = layout
        self.regular = regular
        self.bold = bold
        self.highest = max((t["height"] for t in layout["terraces"]), default=0)
        self.cut_x = section_cut(layout)
        self.image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
        self.draw = ImageDraw.Draw(self.image)

    @cache
    def font(self, size, bold=False):
        return ImageFont.truetype(self.bold if bold else self.regular, size)

    def text(self, position, label, size, fill=INK, bold=False, anchor="lt"):
        self.draw.text(position, label, font=self.font(size, bold), fill=fill, anchor=anchor)

    def line(self, points, fill=RULE, width=1):
        self.draw.line(points, fill=fill, width=width)

    def marker(self, x, y, number, radius=16):
        self.draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=INK, outline=PAPER, width=2)
        self.text((x, y), str(number), 19, PAPER, True, "mm")

    def header(self):
        self.text((64, 50), "ARCANA  /  CITY CENTRE", 24, COPPER, True)
        self.text((61, 95), "계단식 분수광장", 66, bold=True)
        self.text((65, 173), "북극성 분수와 상점가에서 북쪽 주거 골목까지", 27, SECONDARY)
        self.text((2336, 58), "도시 설계 시안", 27, bold=True, anchor="rt")
        self.text((2336, 95), "고저차 · 건물 배치 · 보행 동선", 23, SECONDARY, anchor="rt")
        self.line(((64, 222), (2336, 222)), INK, 2)

    def axonometric(self, render):
        self.text((64, 251), "입체 조감도", 32, bold=True)
        self.text((1539, 263), "직교 투영 · Blender", 21, SECONDARY, anchor="rt")
        x, y, w, h = 64, 304, 1476, 880
        with Image.open(render) as source:
            fitted = ImageOps.contain(source.convert("RGBA"), (w, h), Image.Resampling.LANCZOS)
        self.draw.rectangle((x, y, x + w, y + h), fill="#E7E4DA", outline=RULE, width=2)
        self.image.paste(fitted, (x + (w - fitted.width) // 2, y + (h - fitted.height) // 2), fitted)
        self.draw.rectangle((x, y, x + w, y + h), outline=RULE, width=2)

    def plan(self):
        self.text((1585, 251), "배치 평면도", 32, bold=True)
        x_min, z_min, x_max, z_max = self.layout["bounds"]
        dimensions = f"{x_max - x_min:g} × {z_max - z_min:g}칸"
        self.text((2336, 263), dimensions, 21, SECONDARY, anchor="rt")
        scale = 520 / max(x_max - x_min, z_max - z_min)
        width, height = (x_max - x_min) * scale, (z_max - z_min) * scale
        left, top = round(1950 - width / 2), round(581 - height / 2)
        map_image = Image.new("RGB", (round(width) + 1, round(height) + 1), GROUND)
        plot = ImageDraw.Draw(map_image)

        def point(world):
            return (world[0] - x_min) * scale, (world[1] - z_min) * scale

        def rect(world):
            return (*point(world[:2]), *point(world[2:]))

        boundary = rect(self.layout["bounds"])
        for terrace in sorted(self.layout["terraces"], key=lambda t: t["height"]):
            color = terrace_color(terrace["height"], self.highest)
            plot.rectangle(rect(terrace["rect"]), fill=color, outline="#9E775F")
        for x in range(math.ceil(x_min), math.floor(x_max), 4):
            plot.line((point((x, z_min)), point((x, z_max))), fill=GRID)
        for z in range(math.ceil(z_min), math.floor(z_max), 4):
            plot.line((point((x_min, z)), point((x_max, z))), fill=GRID)
        for surface in self.layout.get("paved_areas", []):
            shape = [point(p) for p in surface["points"]]
            plot.polygon(shape, fill="#F1E9D4", outline="#C3B79C", width=2)
        for fill, roads in [(ROAD, self.layout["roads"]), (LANE, self.layout.get("lanes", []))]:
            for road in roads:
                path = [point(p) for p in road["points"]]
                width = max(1, round(road["width"] * scale))
                plot.line(path, fill=fill, width=width, joint="curve")
                radius = width / 2
                for x, y in path:
                    plot.ellipse((x - radius, y - radius, x + radius, y + radius), fill=fill)
        for stair in self.layout["stairs"]:
            box = rect(stair["rect"])
            plot.rectangle(box, fill="#BC896A", outline=COPPER, width=2)
            step_count = stair_steps(stair)
            for step in range(1, step_count):
                y = box[1] + (box[3] - box[1]) * step / step_count
                plot.line(((box[0], y), (box[2], y)), fill=PAPER, width=2)
            x = (box[0] + box[2]) / 2
            plot.line(((x, box[3] - 4), (x, box[1] + 6)), fill=INK, width=2)
            plot.polygon(((x, box[1] + 4), (x - 4, box[1] + 11), (x + 4, box[1] + 11)), fill=INK)
        for building in self.layout["buildings"]:
            plot.rectangle(rect(building["rect"]), fill=building["color"], outline=INK, width=2)
        for feature in self.layout["water"]:
            x, y = point(feature["center"])
            r = feature["radius"] * scale
            plot.ellipse((x - r, y - r, x + r, y + r), fill=WATER, outline=INK, width=2)
        plot.rectangle(boundary, outline=INK, width=2)
        self.image.paste(map_image, (left, top))

        cut, y = point((self.cut_x, z_min))
        cut, y = cut + left, y + top
        end_y = point((self.cut_x, z_max))[1] + top
        for dash in range(round(y), round(end_y), 12):
            self.line(((cut, dash), (cut, min(dash + 6, end_y))), COPPER, 2)
        self.text((cut, y - 8), "A′", 18, COPPER, True, "mb")
        self.text((cut, end_y + 9), "A", 18, COPPER, True, "mt")
        for note in self.layout["notes"]:
            x, y = point(note["point"])
            self.marker(x + left, y + top, note["number"])

        self.text((2281, 342), "N", 21, bold=True, anchor="mt")
        self.draw.polygon(((2281, 370), (2272, 388), (2290, 388)), fill=INK)
        self.line(((2281, 388), (2281, 409)), INK, 2)
        self.draw.rectangle((2251, 772, 2251 + scale * 8, 778), fill=INK)
        self.text((2251, 785), "8칸", 18, SECONDARY)

        legend = [(ROAD, "기존 길"), (LANE, "새 골목"), (WATER, "물"), (LOWER_TERRACE, "낮은 단"), (UPPER_TERRACE, "윗단")]
        for index, (fill, label) in enumerate(legend):
            x = 1605 + index * 146
            self.draw.rectangle((x, 871, x + 21, 892), fill=fill, outline=RULE)
            self.text((x + 30, 871), label, 20, SECONDARY)

    def section(self):
        self.line(((1585, 920), (2336, 920)))
        self.text((1585, 943), "지형·계단 단면  A–A′", 30, bold=True)
        self.text((2336, 953), "높이 확대", 20, SECONDARY, anchor="rt")
        _, z_min, _, z_max = self.layout["bounds"]
        left, right = 1610, 2310
        floor = 1115
        section_height = 91 / max(self.highest, 1)

        def point(z, height):
            return left + (z_max - z) / (z_max - z_min) * (right - left), floor - height * section_height

        spans = terrain_profile(self.layout, self.cut_x)
        profile = []
        for south, north, height in spans:
            start, end = point(south, height), point(north, height)
            self.draw.rectangle((*start, end[0], floor + 24), fill=terrace_color(height, self.highest))
            profile.extend((start, end))
        self.line(profile, INK, 3)
        self.line(((left, floor + 24), (right, floor + 24)), INK, 2)
        levels = {0, *(t["height"] for t in self.layout["terraces"])}
        for height in sorted(levels):
            at_level = [(south, north) for south, north, level in spans if height == level]
            if not at_level:
                continue
            south, north = max(at_level, key=lambda span: span[0] - span[1])
            x, y = point((south + north) / 2, height)
            self.text((x, y - 9), elevation_label(height), 21, COPPER, True, "mb")
        self.text((left, 1153), "남 · 광장 진입층", 19, SECONDARY)
        self.text((right, 1153), "북 · 주거 골목", 19, SECONDARY, anchor="rt")

    def notes(self):
        self.line(((64, 1217), (2336, 1217)), INK, 2)
        notes = self.layout["notes"]
        if not notes:
            return
        block_width = (2336 - 64) / len(notes)
        for index, note in enumerate(notes):
            x = round(64 + index * block_width)
            if index:
                self.line(((x, 1252), (x, 1440)))
                x += 24
            self.marker(x + 16, 1269, note["number"])
            self.text((x + 45, 1256), note["title"], 25, bold=True)
            width = block_width - 47
            for index, line in enumerate(wrapped_lines(self.draw, note["text"], self.font(23), width)):
                self.text((x, 1311 + index * 32), line, 23, SECONDARY)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    fonts = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
    parser.add_argument("render", type=Path, help="Blender axonometric render PNG")
    parser.add_argument("--layout", type=Path, default=HERE / "layout.json")
    parser.add_argument("--output", type=Path, default=HERE / "blueprint.png")
    parser.add_argument("--font", type=Path, default=fonts / "malgun.ttf")
    parser.add_argument("--bold-font", type=Path, default=fonts / "malgunbd.ttf")
    args = parser.parse_args()

    layout = json.loads(args.layout.read_text(encoding="utf-8"))
    sheet = Blueprint(layout, str(args.font), str(args.bold_font))
    sheet.header()
    sheet.axonometric(args.render)
    sheet.plan()
    sheet.section()
    sheet.notes()
    sheet.image.save(args.output)


if __name__ == "__main__":
    main()
