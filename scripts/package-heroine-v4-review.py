from pathlib import Path
from PIL import Image, ImageDraw
P=Path('art-studies/arcana-hero/white-bob-heroine/blender-v4')
for view in ('front','side'):
    frames=[Image.open(P/'motion'/f'run-{view}-{i}.png').convert('RGB') for i in range(48)]
    frames[0].save(P/f'run-head-{view}.gif',save_all=True,append_images=frames[1:],duration=[30,30,40]*16,loop=0,optimize=False,disposal=2)
board=Image.new('RGB',(1024,400),(39,51,69));draw=ImageDraw.Draw(board)
for row,pitch in enumerate((30,45)):
    draw.text((8,row*200+5),f'{pitch} deg camera | 128 x 176 render | 64 px / unit',fill=(225,231,240))
    for direction in range(8):
        im=Image.open(P/f'dot-{pitch}-{direction}.png').convert('RGBA')
        board.paste(im,(direction*128,row*200+24),im)
board.save(P/'dot-comparison.png')
print('Saved two 48-frame run GIFs and 16-view dot board.')
