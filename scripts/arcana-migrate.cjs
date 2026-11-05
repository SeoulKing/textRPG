#!/usr/bin/env node
/* Run with the world service stopped; never claim a save from a browser game ID. */
require("../.server-dist/load-env");
const crypto=require("node:crypto");
const {FileGameRepository}=require("../.server-dist/game/repository");
const {PostgresGameRepository}=require("../.server-dist/game/postgres-repository");
const {OnlineStore}=require("../.server-dist/online/store");
const root=require("node:path").resolve(__dirname,"..");
async function main() {
  const [gameId,accountId,replaceFlag]=process.argv.slice(2);
  if(!gameId || !accountId)throw new Error("Usage: node scripts/arcana-migrate.cjs GAME_ID ACCOUNT_ID [--replace-character]");
  const database=process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  const repository=database?new PostgresGameRepository(database,root):new FileGameRepository(root);
  await repository.init();
  const store=new OnlineStore(database,root,repository);
  try {
    await store.init();
    if(!await store.acquireWorld())throw new Error("Stop the active world service before migrating saves.");
    const game=await repository.loadGame(gameId);
    if(!game.state.flags.in_magic_world)throw new Error("This command only imports Arcana saves.");
    await store.transaction(async tx=>{
      const account=await tx.get("account",accountId);
      if(!account || account.mergedInto)throw new Error("A current registered account is required.");
      const owned=await tx.get("game-owner",gameId);
      if(owned && owned.ownerId!==accountId)throw new Error("The save already belongs to another principal.");
      if(account.characterId && replaceFlag!=="--replace-character")throw new Error("A character already exists. Explicit --replace-character archives it.");
      if(account.characterId) {
        const current=await tx.get("character",account.characterId);
        if(current?.gameId===gameId)throw new Error("The save is already imported.");
        if(current)await tx.put("character",current.id,{...current,archived:true});
      }
      const character={id:crypto.randomUUID(),ownerId:accountId,gameId,name:null,createdAt:Date.now()};
      game.state.arcanaCombat.battle=null;game.state.flags.arcana_online=true;
      game.state.activeClock={ownerId:null,heartbeatAt:0,sequence:0,paused:true};
      await tx.saveGame(game);
      await tx.put("character",character.id,character);
      await tx.put("game-owner",gameId,{ownerId:accountId,characterId:character.id,gameId});
      await tx.put("account",accountId,{...account,characterId:character.id,choices:undefined});
      await tx.put("migration",gameId,{accountId,at:Date.now()});
      console.log("Imported character:",character.id);
    });
  } finally {await store.close();}
}
main().then(()=>process.exit(0),error=>{console.error(error.message);process.exit(1);});
