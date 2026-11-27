"""Composite the Godot orthographic masks and count covered silhouette pixels."""
import argparse
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
PROJECT = next(p for p in HERE.parents if (p/"godot-arcana/project.godot").is_file())
DATA = json.loads((PROJECT/"godot-arcana/data/plaza-terraces.json").read_text("utf-8"))
NAMES = ("호박빛 집", "쑥색 집", "남빛 집", "적갈색 집")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("masks",type=Path)
    parser.add_argument("output",type=Path)
    args=parser.parse_args()
    font_path=Path("C:/Windows/Fonts/malgun.ttf")
    if not font_path.exists():
        font_path=next((PROJECT/"godot-arcana/fonts").glob("*.ttf"))
    def font(n):
        return ImageFont.truetype(str(font_path),n)
    bg, ink, soft = "#f6f1e8", "#243642", "#56645f"
    sheet=Image.new("RGB",(1170,658),bg)
    d=ImageDraw.Draw(sheet)
    d.text((26,18),"계단식 장터  /  뒷집 가림 검토",font=font(30),fill=ink)
    d.text((26,65),"본편 직교 카메라   ·   가로 45°   ·   하향 30°   ·   같은 자리에서 지붕부터 문턱까지 비교",font=font(16),fill=soft)
    for i,(home,title) in enumerate(zip(DATA["buildings"],NAMES)):
        a=np.array(Image.open(args.masks/(home["id"]+"-single.png")).convert("RGB"))
        b=np.array(Image.open(args.masks/(home["id"]+"-full.png")).convert("RGB"))
        original=(a.min(axis=2)>225)
        visible=(b.min(axis=2)>225)
        lost=original & ~visible
        total=int(original.sum())
        if not total:
            raise ValueError("No isolated silhouette for "+home["id"])
        count=int(lost.sum())
        print(f"{home['id']}: {count} / {total} occluded")
        def panel(src, mark=False):
            img=np.full_like(src,[36,47,55])
            if mark:
                surrounding=(src[:,:,0].astype(float)>a[0,0,0]+12) & ~visible
                img[surrounding]=[97,110,112]
            img[original if not mark else visible]=[240,216,172]
            if mark:
                img[lost]=[234,95,65]
            return Image.fromarray(img)
        x=26+i*281
        d.text((x,102),title,font=font(17),fill=ink)
        sheet.paste(panel(a),(x,136))
        sheet.paste(panel(b,True),(x,390))
        d.text((x,632),f"가려진 픽셀   {count:,} / {total:,}",font=font(14),fill=ink)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    sheet.save(args.output)


if __name__=="__main__":
    main()
