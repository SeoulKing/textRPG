/* Compose existing limestone art and edited celestial SVG at native pixel density. */
const fs=require('node:fs/promises'),path=require('node:path'),cp=require('node:child_process'),sharp=require('sharp');
const root=path.resolve(__dirname,'..'),base=path.join(root,'art-studies/regions/arcana-city-center/source/plaza-mood-v1');
async function main(){
 let recipe=await fs.readFile(path.join(root,'scripts/build-arcana-magic-ground.py'),'utf8');
 recipe=recipe.replace("ROOT=Path(__file__).resolve().parents[1]","ROOT=Path("+JSON.stringify(root.replaceAll('\\','/'))+")");
 recipe=recipe.replace("SOURCE=REGION/'source/magic-ground-v1'","SOURCE=REGION/'source/plaza-mood-v1/ground'");
 recipe=recipe.replace("OUT=ROOT/'godot-arcana/art/export/regions/arcana-city-center'","OUT=SOURCE");
 const stoneStart=recipe.indexOf('add(f\'<rect width="');
 const stoneEnd=recipe.indexOf('CX,CZ=36,28.925');
 if(stoneStart<0||stoneEnd<=stoneStart)throw Error('Original floor recipe structure changed');
 // Keep the existing celestial vector shapes; use the already-authored small-stone raster below.
 recipe=recipe.slice(0,stoneStart)+recipe.slice(stoneEnd);
 recipe=recipe.replace("circle(CX,CZ,r,color,width)","circle(CX,CZ,r*.76,color,width)");
 recipe=recipe.replace("r=6.74","r=6.74*.76");
 recipe=recipe.replace("pts.append((CX+cos(base+da)*r,CZ+sin(base+da)*r))","pts.append((CX+cos(base+da)*r*.76,CZ+sin(base+da)*r*.76))");
 recipe=recipe.replace("CX+cos(a)*7.7,CZ+sin(a)*7.7","CX+cos(a)*7.7*.76,CZ+sin(a)*7.7*.76");
 recipe=recipe.replace("join=sqrt(7.85**2-2.55**2)","join=sqrt((7.85*.76)**2-2.55**2)");
 const gardens=JSON.parse(await fs.readFile(path.join(base,'composition.json'),'utf8')).gardens;
 recipe=recipe.replace("plan=json.loads((REGION/'layout.json').read_text(encoding='utf-8'))","plan={'gardens':"+JSON.stringify(gardens)+"}");
 recipe=recipe.replace("detail_pass=add_inlay_details(globals())","detail_pass={'pass':'compact-square','ringScale':0.76,'preserved':'separate approved fountain mosaic'}");
 recipe=recipe.replace("(REGION/'magic-ground-v1.json')","(SOURCE/'ground-registration.json')");
 recipe="import sys\nsys.path.insert(0,"+JSON.stringify(path.join(root,'scripts').replaceAll('\\','/'))+")\n"+recipe;
 const derived=path.join(base,'ground-recipe.py');
 await fs.writeFile(derived,recipe);
 const made=cp.spawnSync('python',[derived],{cwd:root,encoding:'utf8',windowsHide:true});
 if(made.status!==0)throw Error(made.stderr||made.stdout);
 const folder=path.join(base,'ground');
 const stone=path.join(root,'art-studies/regions/arcana-city-center/source/painted-ground-v1/paving-master.png');
 const texture=await fs.readFile(stone);
 const fullStone=await sharp({create:{width:4608,height:3072,channels:4,background:'#e5d4b5'}}).composite([{input:texture,tile:true}]).png().toBuffer();
 for(const [side,left] of [['left',0],['right',2304]]){
  const underlay=await sharp(fullStone).extract({left,top:0,width:2304,height:3072}).png().toBuffer();
  const inlay=await sharp(path.join(folder,'magic-ground-'+side+'.svg')).png().toBuffer();
  await sharp(underlay).composite([{input:inlay}]).png().toFile(path.join(folder,'ground-'+side+'.png'));
  await sharp(inlay).png().toFile(path.join(folder,'ornament-'+side+'.png'));
 }
 console.log('Composed existing limestone and compact celestial inlays at native 64px/unit.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
