// Extract the existing vector ornament coverage without guessing from its colors.
const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
async function main(){
 const scene=await fs.readFile(path.join(root,'godot-arcana/scenes/native_2d/plaza.tscn'),'utf8');
 for(const side of ['left','right']){
  const match=scene.match(new RegExp('path="res://([^"]+)" id="ground_'+side+'"'));
  if(!match)throw Error('Current ground path missing');
  const texture=path.join(root,'godot-arcana',match[1]);
  const svgPath=texture.endsWith('.svg')?texture:path.join(path.dirname(texture),'magic-ground-'+side+'.svg');
  const svg=await fs.readFile(svgPath,'utf8'),first=svg.indexOf('<circle ');
  if(first<0)throw Error('No separate celestial vector geometry');
  const header=svg.slice(0,svg.indexOf('<rect '));
  // All original ground stone polygons precede the first celestial circle.
  const body=svg.slice(first).replace(/#[0-9a-fA-F]{6}/g,'#ffffff');
  const mask=header+body;
  const study=path.join(root,'art-studies/stone-floor-detail-v1');
  await fs.writeFile(path.join(study,'ornament-mask-'+side+'.svg'),mask);
  await sharp(Buffer.from(mask)).png().toFile(path.join(root,'godot-arcana/art/export/stone-floor-v1/ornament-mask-'+side+'.png'));
 }
 console.log('Exact original celestial geometry extracted to separate alpha masks.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
