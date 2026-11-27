const buildFurniture = require('./build-arcana-furniture.cjs');
module.exports = async () => (await buildFurniture()).bench;
if(require.main===module) buildFurniture().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e);process.exitCode=1;});
