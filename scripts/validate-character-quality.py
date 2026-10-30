"""Production checks for the tree-matched heroine; reads art, emits QA previews."""
from pathlib import Path
import json,hashlib,math
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[1]
ART=ROOT/'art-studies/arcana-reference-v1'
EXPORT=ROOT/'godot-arcana/art/export/reference'
QA=ROOT/'godot-arcana/art/reference/natural-walk'
manifest=json.loads((ART/'manifest.json').read_text())
shader=(ROOT/'godot-arcana/art/resources/heroine_layered.gdshader').read_text(encoding='utf8')
assert all(name not in shader for name in ['head_cell','torso_cell','body_uv']), 'Mixed facing/body splice returned'
rig_audit=json.loads((QA/'native-rig-audit.json').read_text())
assert rig_audit['pose_count']==352 and len(rig_audit['skeletons'])==8
assert manifest['frameSize']==[96,136]
assert manifest['atlasGrid']==[16,22]
assert manifest['clips']['walk']['count']==24
palette={tuple(c) for c in manifest['palette']}
visible_files=['body','hair','dress','shawl','boots-taupe','blouse','skirt','boots-navy','arms-front','arms-back','arms-bare']
for name in visible_files:
    arr=np.array(Image.open(EXPORT/f'hero-{name}.png').convert('RGBA'))
    assert arr.shape==(2992,1536,4),(name,arr.shape)
    assert set(np.unique(arr[:,:,3])).issubset({0,255}),name
    rgb=arr[:,:,:3][arr[:,:,3]>0].astype(np.uint32)
    values=np.unique((rgb[:,0]<<16)|(rgb[:,1]<<8)|rgb[:,2])
    used={(int(c)>>16,(int(c)>>8)&255,int(c)&255) for c in values}
    assert used.issubset(palette),(name,used-palette)
packed=np.array(Image.open(EXPORT/'hero-occlusion.png').convert('RGBA'))
assert set(np.unique(packed)).issubset({0,255})
for channel,kind in enumerate(['dress','top','bottom','feet']):
    mask=np.array(Image.open(EXPORT/f'hero-{kind}-mask.png').convert('RGBA'))[:,:,3]
    assert np.array_equal(mask,packed[:,:,channel]),kind
atlas=Image.open(EXPORT/'hero-original.png').convert('RGBA')
unique=[]
bounds=[]
for d in range(8):
    hashes=[]
    for f in range(44):
        i=d*36+f if f<36 else 288+d*8+f-36;x=i%16*96;y=i//16*136
        frame=atlas.crop((x,y,x+96,y+136))
        b=frame.getbbox()
        assert b and b[0]>0 and b[1]>0 and b[2]<96 and b[3]<136,(d,f,b)
        bounds.append(b)
        if 4<=f<28: hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
    unique.append(len(set(hashes)))
assert min(unique)>=20,unique
# Clothing and shoe masks must not leave a detached shin/boot component.
detached=[]
for d in range(8):
    for f in range(44):
        i=d*36+f if f<36 else 288+d*8+f-36;x=i%16*96;y=i//16*136
        alpha=np.array(atlas.crop((x,y,x+96,y+136)))[:,:,3]>0
        seen=set()
        for yy,xx in zip(*np.where(alpha)):
            if (xx,yy) in seen: continue
            queue=[(xx,yy)];seen.add((xx,yy));points=[]
            while queue:
                u,v=queue.pop();points.append((u,v))
                for dx,dy in [(1,0),(-1,0),(0,1),(0,-1),(1,1),(-1,-1),(1,-1),(-1,1)]:
                    point=(u+dx,v+dy)
                    if 0<=point[0]<96 and 0<=point[1]<136 and point not in seen and alpha[point[1],point[0]]:
                        seen.add(point);queue.append(point)
            if len(points)>8 and min(v for u,v in points)>=94:
                detached.append([d,f,len(points),min(u for u,v in points),min(v for u,v in points),max(u for u,v in points),max(v for u,v in points)])
assert not detached,detached
# Prior scene hashes are historical: parallel scene/bench work must not be
# reclassified as our animation edits or overwritten to satisfy an old snapshot.
protected=json.loads((ART/'quality-v2-protected.json').read_text())
prior_differences=[path for path,sha in protected.items() if hashlib.sha256((ROOT/path).read_bytes()).hexdigest()!=sha]
# Actual offline GPU captures at 30Hz, including a stop after 32 moving frames.
for label in ['slow','full']:
    frames=[Image.open(QA/f'{label}-detail-{i}.png').convert('RGB') for i in range(40)]
    frames[0].save(QA/f'{label}-walk-stop.gif',save_all=True,append_images=frames[1:],duration=[30,30,40]*13+[30],loop=0)
frames=[Image.open(QA/f'after-walk-detail-{i}.png').convert('RGB') for i in range(24)]
frames[0].save(QA/'walk-cycle.gif',save_all=True,append_images=frames[1:],duration=[30,40]*12,loop=0)
# Original authored pose comparison at the same source resolution.
before=Image.open(ART/'previous-natural-walk/hero-original.png').convert('RGBA')
comparison=Image.new('RGBA',(96*8,136*4),'#718399')
for row,(sheet,d,stride) in enumerate([(before,0,28),(atlas,0,36),(before,2,28),(atlas,2,36)]):
    for col,f in enumerate(range(0,24,3)):
        i=d*stride+4+f;x=i%16*96;y=i//16*136
        crop=sheet.crop((x,y,x+96,y+136));comparison.paste(crop,(col*96,row*136),crop)
comparison.resize((1536,1088),Image.Resampling.NEAREST).save(QA/'before-after-poses.png')
report=dict(frame_size=[96,136],frames=352,walk_frames=24,stop_frames_per_foot=4,
    cycle_distance_map_units=manifest['clips']['walk']['cycleMapUnits'],
    max_map_units_per_second=48,max_tiles_per_second=3,
    full_speed_cycle_seconds=manifest['clips']['walk']['cycleMapUnits']/48,
    walk_unique_poses_by_direction=unique,packed_masks_exact=True,binary_alpha=True,
    shared_palette=True,no_clipped_frames=True,no_detached_lower_body=True,
    pipeline="Native Skeleton2D / Bone2D / Polygon2D / AnimationPlayer, single whole-body frame",
    skeleton_bones=17,native_pose_count=352,turn_frames=64,
    prior_snapshot_differences=prior_differences,
    prior_snapshot_note='Scene, models and bench were edited in separate work. This animation task does not regenerate or overwrite them.',
    appearance_and_mask_atlases_loaded=12,uncompressed_atlas_mib=12*1536*2992*4/1024**2,
    evidence='offline Godot Compatibility GPU and asset inspection; browser/mobile play not performed')
(QA/'verification.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
print(json.dumps({k:report[k] for k in ['frames','walk_unique_poses_by_direction','no_clipped_frames','uncompressed_atlas_mib']}))
