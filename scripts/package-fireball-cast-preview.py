"""Present already-rendered offline game frames as a small review animation."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parent.parent
folder=root/'godot-arcana/art/reference/fireball-cast-v1'
frames=[Image.open(folder/f'cast-{i:02}.png').convert('RGB').crop((240,260,768,590)) for i in range(14)]
frames[0].save(folder/'cast-preview.gif',save_all=True,append_images=frames[1:]+[frames[-1]],duration=[50]*14+[350],loop=0,disposal=2)
print(folder/'cast-preview.gif')
