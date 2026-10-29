import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthController } from "../auth";
import { OnlineAccounts, OnlineError, nativeDevelopment } from "./accounts";
import { ArcanaWorld } from "./world";
const PointSchema=z.object({x:z.number().finite().min(-10000).max(10000),y:z.number().finite().min(-10000).max(10000)});
const InputSchema=z.object({placeRevision:z.number().int().nonnegative().optional(),developerSpeed:z.boolean().optional(),sequence:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),position:PointSchema.optional(),direction:PointSchema.optional(),bench:z.enum(["","approach","sit","seated","stand"]).optional(),gait:z.number().finite().min(0).max(1e9).optional(),floor:z.number().int().min(0).max(2).optional(),command:z.enum(["spatial_sync","fireball","flame_wave","flame_guard","meteor","giant_fireball","flame_barrage","dodge","teleport","potion"]).optional(),aim:PointSchema.optional(),target:PointSchema.optional()});
export function registerOnlineRoutes(app:FastifyInstance,accounts:OnlineAccounts,auth:AuthController,world:ArcanaWorld) {
  const limits=new Map<string,{start:number;count:number}>();
  const configuredOrigins=(process.env.ALLOWED_ORIGINS || process.env.PUBLIC_BASE_URL || "").split(",").map(v=>v.trim()).filter(Boolean);
  const allowed=(origin:string)=>configuredOrigins.includes(origin) || (process.env.NODE_ENV!=="production" && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin));
  app.addHook("onRequest",async(request,reply)=>{
    const pathname=request.url.split("?")[0];
    if(!pathname.startsWith("/api/"))return;
    const origin=request.headers.origin;
    if(origin && !allowed(origin))return reply.code(403).send({error:"invalid_origin",message:"허용되지 않은 접속 주소입니다."});
    if(!["GET","HEAD","OPTIONS"].includes(request.method) && request.headers["sec-fetch-site"]==="cross-site")return reply.code(403).send({error:"invalid_origin",message:"게임 화면에서 다시 요청해 주세요."});
    const category=/\/auth\/guest|\/games$|\/account\/|\/auth\/.*\/start/.test(pathname)?"identity":"api";
    const key=request.ip+":"+category,now=Date.now(),entry=limits.get(key);
    const count=!entry || now-entry.start>=60000?{start:now,count:0}:entry;
    count.count++;limits.set(key,count);
    if(limits.size>10000)for(const [id,v] of limits)if(now-v.start>=60000)limits.delete(id);
    if(count.count>(category==="identity"?30:300))return reply.code(429).header("retry-after","60").send({error:"rate_limited",message:"요청이 많습니다. 잠시 후 다시 시도해 주세요."});
  });
  app.addHook("preValidation",async(request)=>{
    const match=request.url.split("?")[0].match(/^\/api\/(?:state-world\/)?games\/([^/]+)/);
    if(match) {
      const owner=await accounts.authorize(decodeURIComponent(match[1]),await accounts.require(request));
      if(owner.characterId && (pathnameFor(request.url).endsWith("/combat-ws") || pathnameFor(request.url).startsWith("/api/state-world/")))throw new OnlineError("world_transport_required","아르카나 세계 연결을 사용해 주세요.",403);
    }
  });
  app.get("/api/auth/google/start",(request,reply)=>auth.start(request,reply,"google"));
  app.get("/api/auth/google/callback",(request,reply)=>auth.callback(request,reply,"google"));
  app.post("/api/auth/guest",async(request,reply)=>{
    const issued=await accounts.guest(request,reply);
    return {ok:true,...("sessionToken" in issued?{sessionToken:issued.sessionToken}:{})};
  });
  app.get("/api/account/character",async request=>{
    const principal=await accounts.require(request);
    return {character:await accounts.character(principal),choices:await accounts.choices(principal)};
  });
  app.post("/api/account/register",async request=>{
    const body=z.object({name:z.string()}).parse(request.body);
    return {character:await accounts.register(await accounts.require(request),body.name)};
  });
  app.post("/api/account/select-character",async request=>{
    const body=z.object({characterId:z.string().uuid()}).parse(request.body);
    await accounts.selectCharacter(await accounts.require(request),body.characterId);
    return {ok:true};
  });
  app.post("/api/arcana/join",async request=>{
    const body=z.object({controller:z.string().min(8).max(100),takeover:z.boolean().default(false)}).parse(request.body);
    return world.join(await accounts.require(request),body.controller,body.takeover);
  });
  app.post("/api/arcana/leave",async request=>world.leave(await accounts.require(request)));
  app.post("/api/arcana/admin",async request=>{
    const principal=await accounts.require(request);
    if(!principal.accountId || !(process.env.ARCANA_ADMIN_ACCOUNT_IDS || "").split(",").includes(principal.accountId))throw new OnlineError("forbidden","운영자 권한이 필요합니다.",403);
    const body=z.object({characterId:z.string().uuid(),seconds:z.number().int().min(0).max(31536000).default(0)}).parse(request.body);
    await world.admin(body.characterId,body.seconds);return {ok:true};
  });
  app.get("/api/arcana/worlds/main/ws",{
    websocket:true,
    preValidation:async(request)=>{
      if(request.headers.origin ? !allowed(request.headers.origin) : !nativeDevelopment(request))throw new OnlineError("invalid_origin","허용되지 않은 접속입니다.",403);
      await accounts.require(request);
    },
  },(socket,request)=>{
    const query=z.object({controller:z.string().min(8).max(100),protocol:z.literal("3")}).safeParse(request.query);
    if(!query.success){socket.close(1008,"Invalid controller");return;}
    let id="",outstanding=0,window=Date.now(),messages=0,closed=false;
    const send=(value:unknown)=>{if(socket.readyState!==1)return;if(socket.bufferedAmount>1024*1024){socket.close(1013,"Slow connection");return;}socket.send(JSON.stringify(value));};
    const connection={sessionId:"",controller:query.data.controller,send,close:(code:number,reason:string)=>socket.close(code,reason)};
    const ready=accounts.require(request).then(async principal=>{
      connection.sessionId=principal.sessionId;
      id=await world.attach(principal,query.data.controller,connection);
      if(closed)world.disconnect(id,connection);
    });
    ready.catch(error=>{send({error:error instanceof OnlineError?error.code:"connection_failed",message:error instanceof Error?error.message:"연결하지 못했습니다."});socket.close(1008,"Join required");});
    socket.on("message",(raw,binary)=>{
      if(Date.now()-window>=1000){window=Date.now();messages=0;}
      if(binary || ++messages>40 || outstanding>=8){socket.close(1008,"Input limit");return;}
      let packet:unknown;try{packet=JSON.parse(raw.toString());}catch{socket.close(1008,"Invalid JSON");return;}
      const parsed=z.object({id:z.number().int().positive(),input:InputSchema}).safeParse(packet);
      if(!parsed.success){socket.close(1008,"Invalid input");return;}
      outstanding++;
      void ready.then(()=>world.command(id,connection,parsed.data.input)).then(result=>send({id:parsed.data.id,result}),error=>send({id:parsed.data.id,result:{error:error instanceof OnlineError?error.code:"command_failed",message:error instanceof Error?error.message:"입력을 처리하지 못했습니다."}})).finally(()=>outstanding--);
    });
    const heartbeat=setInterval(()=>{if(socket.readyState===1)socket.ping();},15000);heartbeat.unref();
    socket.on("close",()=>{closed=true;clearInterval(heartbeat);if(id)world.disconnect(id,connection);});
    socket.on("error",error=>request.log.warn({err:error},"world websocket"));
  });
}

function pathnameFor(url:string) {return url.split("?")[0];}
