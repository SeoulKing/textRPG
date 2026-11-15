// Narrow resource connection; never regenerate authored placements.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
async function main(){
 const file=path.join(root,'godot-arcana/scenes/native_2d/plaza.tscn');
 let scene=await fs.readFile(file,'utf8');
 const backup=path.join(root,'art-studies/stone-floor-detail-v1/before-application.tscn');
 try{await fs.access(backup);}catch{await fs.writeFile(backup,scene);}
 const eol=scene.includes('\r\n')?'\r\n':'\n';
 scene=scene.replace(/^\[ext_resource type="Shader"[^\r\n]*id="ground_shader"\]/m,'[ext_resource type="Shader" path="res://art/resources/native_2d_stone_ground.gdshader" id="ground_shader"]');
 const jobs=[['stone_floor','stone-pattern','stone_pattern'],['stone_mask_left','ornament-mask-left','ornament_mask_left'],['stone_mask_right','ornament-mask-right','ornament_mask_right']];
 for(const [id,fileName,param] of jobs){
  if(scene.includes('id="'+id+'"'))continue;
  const index=scene.indexOf('[sub_resource');
  scene=scene.slice(0,index)+'[ext_resource type="Texture2D" path="res://art/export/stone-floor-v1/'+fileName+'.res" id="'+id+'"]'+eol+eol+scene.slice(index);
  scene=scene.replace(/load_steps=(\d+)/,(m,n)=>'load_steps='+(Number(n)+1));
  const anchor='shader_parameter/city_ground_paint = ExtResource("ground_left")';
  if(!scene.includes(anchor))throw Error('Current floor material changed');
  scene=scene.replace(anchor,anchor+eol+'shader_parameter/'+param+' = ExtResource("'+id+'")');
 }
 scene=scene.replace('metadata/source_art = "Existing 3D city painted floor and fountain mosaic"','metadata/source_art = "Approved detailed stone tile pattern; current celestial inlay and fountain mosaic"');
 await fs.writeFile(file,scene);
 console.log('Connected native stone tile pattern and exact inlay masks to the current saved plaza.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
