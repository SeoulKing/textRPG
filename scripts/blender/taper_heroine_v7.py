"""Taper and curl actual rear hair tips without regenerating the head."""
import bpy,sys,math,numpy as np
from pathlib import Path
R=Path(sys.argv[sys.argv.index('--')+1]);P=R/'art-studies/arcana-hero/white-bob-heroine/blender-v7';bpy.ops.wm.open_mainfile(filepath=str(P/'heroine-v7-head.blend'));root=bpy.data.objects['V7 MASTER']
if root.get('v7_tips_tapered'):raise RuntimeError('Tips already edited; preserve saved source')
for o in bpy.data.collections['V7 editable head'].objects:
 if not o.name.startswith('V7 CC0 bob strip'):continue
 k=int(o.name.split()[-1]);bottom=min(v.co.z for v in o.data.vertices);tip=[v.co.copy() for v in o.data.vertices if v.co.z<bottom+.045];cx=float(np.mean([v.x for v in tip]));cy=float(np.mean([v.y for v in tip]));sign=1 if cx>0 else -1
 for v in o.data.vertices:
  t=max(0,min(1,(bottom+.135-v.co.z)/.135));q=t*t;v.co.x=cx+(v.co.x-cx)*(1-.92*q)-sign*.025*q;v.co.y=cy+(v.co.y-cy)*(1-.92*q)-.025*q;v.co.z+=q*(.075*(abs(k-9.5)/9.5)**2+.012*math.sin(k*2.7))
 o.data.update()
root['v7_tips_tapered']=True;bpy.ops.wm.save_as_mainfile(filepath=str(P/'heroine-v7-head.blend'));print('V7_REAR_TIPS_TAPERED',flush=True)
