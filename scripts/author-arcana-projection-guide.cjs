const fs=require('node:fs/promises'),path=require('node:path'),sharp=require('sharp');
const root=path.resolve(__dirname,'..');
async function main(){
 const args=process.argv.slice(2),options={};
 for(let i=0;i<args.length;i+=2){if(!args[i]?.startsWith('--')||!args[i+1])throw Error('Use --width W --depth D --height H --out workspace/path');options[args[i].slice(2)]=args[i+1];}
 const w=Number(options.width),d=Number(options.depth),h=Number(options.height);
 if(![w,d,h].every(v=>Number.isFinite(v)&&v>0&&v<=64))throw Error('Dimensions must be positive world units up to64.');
 if(!options.out)throw Error('--out is required');
 const output=path.resolve(root,options.out);
 const relative=path.relative(root,output);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Output must stay inside this project.');
 const p=64,s=Math.SQRT1_2,margin=32,width=Math.ceil(w*p)+margin*2,height=Math.ceil((d+h)*p*s)+margin*2;
 const foot=[margin+w*p/2,margin+(d+h)*p*s];
 const point=(x,y,z)=>[Math.round(foot[0]+x*p),Math.round(foot[1]+(z-y)*p*s)];
 const pts=points=>points.map(v=>point(...v).join(',')).join(' ');
 const floor=[[-w/2,0,-d],[w/2,0,-d],[w/2,0,0],[-w/2,0,0]];
 const top=[[-w/2,h,-d],[w/2,h,-d],[w/2,h,0],[-w/2,h,0]];
 const front=[[-w/2,h,0],[w/2,h,0],[w/2,0,0],[-w/2,0,0]];
 const rows=[];
 for(let x=-w/2;x<=w/2+.001;x+=.5)rows.push('<polyline points="'+pts([[x,0,-d],[x,0,0]])+'" fill="none" stroke="#8aa3b2" stroke-width="1"/>');
 for(let z=-d;z<=.001;z+=.5)rows.push('<polyline points="'+pts([[-w/2,0,z],[w/2,0,z]])+'" fill="none" stroke="#8aa3b2" stroke-width="1"/>');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><rect width="100%" height="100%" fill="#273440"/><polygon points="'+pts(floor)+'" fill="#425665"/>'+rows.join('')+'<polygon points="'+pts(front)+'" fill="#b48863" fill-opacity=".83" stroke="#f0d4a2"/><polygon points="'+pts(top)+'" fill="#ecd3a5" stroke="#f9ecd5"/><circle cx="'+Math.round(foot[0])+'" cy="'+Math.round(foot[1])+'" r="3" fill="#83e7db"/></svg>';
 await fs.mkdir(path.dirname(output),{recursive:true});
 await fs.writeFile(output+'.svg',svg);
 await sharp(Buffer.from(svg)).png().toFile(output+'.png');
 await fs.writeFile(output+'.json',JSON.stringify({purpose:'projection reference, not finished game art',worldDimensions:{width:w,depth:d,height:h},camera:{yaw:0,pitch:45},pixelsPerUnit:p,canvas:[width,height],frontCenter:foot.map(Math.round),footprint:[-w/2,-d,w,d],equation:'u=P*X; v=P*(Z*sin(pitch)-Y*cos(pitch))'},null,2)+'\n');
 console.log(JSON.stringify({output,canvas:[width,height],frontCenter:foot.map(Math.round)}));
}
main().catch(e=>{console.error(e.message);process.exit(1)});
