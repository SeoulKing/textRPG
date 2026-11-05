import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { GameRepository } from "./game/repository";
import type { GameService } from "./game/service";
import { OnlineAccounts, OnlineError, cookies, setCookie, hashToken, developmentAccess, type Principal } from "./online/accounts";

type Provider = "kakao" | "google";
type Intent = { state: string; provider: Provider; expires: number; principal: Principal | null; linking: boolean; nonce: string; verifier: string; redirect: string };
const providers = {
  kakao: {authorize:"https://kauth.kakao.com/oauth/authorize",token:"https://kauth.kakao.com/oauth/token"},
  google: {authorize:"https://accounts.google.com/o/oauth2/v2/auth",token:"https://oauth2.googleapis.com/token"},
};
let googleKeys: {expires:number; keys: (crypto.JsonWebKey & {kid:string})[]} | undefined;
const clientId = (provider: Provider) => provider==="google" ? process.env.GOOGLE_CLIENT_ID || "" : process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || "";
const secret = (provider: Provider) => provider==="google" ? process.env.GOOGLE_CLIENT_SECRET || "" : process.env.KAKAO_CLIENT_SECRET || "";
async function jsonFetch(url: string, options: RequestInit = {}) {
  const response = await fetch(url,{...options,signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new OnlineError("provider_unavailable","로그인 서비스에 연결하지 못했습니다. 다시 시도해 주세요.",502);
  return await response.json() as Record<string,any>;
}
async function googleIdentity(idToken: string, nonce: string) {
  const [head,body,sig,...extra] = idToken.split(".");
  if (!head || !body || !sig || extra.length) throw new Error("Invalid ID token");
  const header = JSON.parse(Buffer.from(head,"base64url").toString("utf8"));
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new Error("Invalid ID token algorithm");
  if (!googleKeys || googleKeys.expires<Date.now() || !googleKeys.keys.some(key=>key.kid===header.kid)) {
    const value = await jsonFetch("https://www.googleapis.com/oauth2/v3/certs");
    googleKeys = {expires:Date.now()+3600000,keys:value.keys};
  }
  const jwk = googleKeys!.keys.find(key=>key.kid===header.kid);
  if (!jwk || !crypto.verify("RSA-SHA256",Buffer.from(head+"."+body),crypto.createPublicKey({key:jwk,format:"jwk"}),Buffer.from(sig,"base64url"))) throw new Error("Invalid ID token signature");
  const value = JSON.parse(Buffer.from(body,"base64url").toString("utf8"));
  if (!["https://accounts.google.com","accounts.google.com"].includes(value.iss) || value.aud!==clientId("google") || value.nonce!==nonce || typeof value.exp!=="number" || value.exp*1000<=Date.now() || typeof value.sub!=="string" || value.iat*1000>Date.now()+60000) throw new Error("Invalid ID token claims");
  return {provider:"google",subject:value.sub,email:typeof value.email==="string"?value.email:null,verified:value.email_verified===true};
}
export class AuthController {
  constructor(public accounts: OnlineAccounts, private games: GameService, private repository: GameRepository) {}
  private async legacy(request: FastifyRequest, reply?: FastifyReply) {
    if (!reply) return null;
    const token = cookies(request).textrpg_auth;
    const authSecret = process.env.AUTH_SECRET || process.env.KAKAO_CLIENT_SECRET || (process.env.NODE_ENV!=="production" ? "textrpg-local-dev-auth-secret" : "");
    if (!token || !authSecret) return null;
    const [body,signature] = token.split(".");
    if (!body || !signature) return null;
    const expected=crypto.createHmac("sha256",authSecret).update(body).digest("base64url");
    if (signature.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) return null;
    let value: {userId:string;exp:number};
    try { value=JSON.parse(Buffer.from(body,"base64url").toString("utf8")); } catch { return null; }
    if (!value.userId || value.exp<Date.now()) return null;
    const old = await this.repository.loadAuthUser(value.userId);
    if (!old) return null;
    const id = await this.accounts.resolveIdentity({provider:old.provider,subject:old.providerUserId,email:null,verified:false},null,false);
    const result = await this.accounts.issue(request,reply,id);
    setCookie(reply,"textrpg_auth","",0);
    return result.principal;
  }
  async currentUser(request: FastifyRequest) {
    const principal=await this.accounts.current(request);
    if (!principal?.accountId) return null;
    const character=await this.accounts.character(principal);
    return {id:principal.id,nickname:character?.name || "이름 미등록",provider:"social",email:null};
  }
  async status(request: FastifyRequest, reply?: FastifyReply) {
    const principal=await this.accounts.current(request) || await this.legacy(request,reply);
    const character=principal?await this.accounts.character(principal):null;
    return {
      kakaoConfigured:!!clientId("kakao"),googleConfigured:!!clientId("google"),developmentAccess:developmentAccess(),
      user:principal?.accountId?{id:principal.id,nickname:character?.name || "이름 미등록",provider:"social",email:null}:null,
      guest:!!principal && !principal.accountId,
      character:character?{id:character.id,name:character.name,gameId:character.gameId}:null,
      characterChoices:principal?await this.accounts.choices(principal):[],
      linkedProviders:principal?.accountId?await this.accounts.store.transaction(async tx=>(await tx.list<{accountId:string;provider:string}>("identity")).filter(i=>i.accountId===principal.accountId).map(i=>i.provider)):[],
      saveInfo:principal?.accountId?await this.games.getManualSaveForUser(principal.id):null,
    };
  }
  async startKakaoLogin(request: FastifyRequest, reply: FastifyReply) { return this.start(request,reply,"kakao"); }
  async handleKakaoCallback(request: FastifyRequest, reply: FastifyReply) { return this.callback(request,reply,"kakao"); }
  async start(request: FastifyRequest, reply: FastifyReply, provider: Provider) {
    if (!clientId(provider)) throw new OnlineError("login_not_configured","아직 준비되지 않은 로그인 방식입니다.",503);
    const principal=await this.accounts.current(request);
    const linking=(request.query as {link?:string}).link==="1";
    if (linking && !principal?.accountId) throw new OnlineError("login_required","먼저 현재 계정으로 로그인해 주세요.",401);
    const base=process.env.PUBLIC_BASE_URL?.replace(/\/$/,"") || (process.env.NODE_ENV==="production"?"https://":"http://")+request.headers.host;
    const state=crypto.randomBytes(32).toString("base64url"),nonce=crypto.randomBytes(32).toString("base64url"),verifier=crypto.randomBytes(48).toString("base64url");
    const intent:Intent={state:hashToken(state),provider,expires:Date.now()+600000,principal,linking,nonce,verifier,redirect:process.env[provider.toUpperCase()+"_REDIRECT_URI"] || base+"/api/auth/"+provider+"/callback"};
    await this.accounts.store.transaction(tx=>tx.put("oauth",intent.state,intent));
    setCookie(reply,"arcana_oauth",state,600);
    const url=new URL(providers[provider].authorize);
    for (const [key,value] of Object.entries({client_id:clientId(provider),redirect_uri:intent.redirect,response_type:"code",state})) url.searchParams.set(key,value);
    if (provider==="google") {
      url.searchParams.set("scope","openid email");
      url.searchParams.set("nonce",nonce);
      url.searchParams.set("code_challenge",hashBase64(verifier));
      url.searchParams.set("code_challenge_method","S256");
    }
    url.searchParams.set("prompt","select_account");
    return reply.redirect(url.toString());
  }
  async callback(request: FastifyRequest, reply: FastifyReply, provider: Provider) {
    const query=request.query as {code?:string;state?:string;error?:string};
    const cookie=cookies(request).arcana_oauth;
    setCookie(reply,"arcana_oauth","",0);
    if (query.error || !query.code || !query.state || query.state!==cookie) return reply.redirect("/account.html?login=cancelled");
    const intent=await this.accounts.store.transaction(async tx=>{
      const found=await tx.get<Intent>("oauth",hashToken(query.state!));
      await tx.remove("oauth",hashToken(query.state!));
      return found;
    });
    if (!intent || intent.provider!==provider || intent.expires<Date.now()) return reply.redirect("/account.html?login=expired");
    try {
      const current=await this.accounts.current(request);
      if (intent.linking && (!current || current.sessionId!==intent.principal?.sessionId)) throw new Error("Account linking session changed");
      const body=new URLSearchParams({grant_type:"authorization_code",client_id:clientId(provider),redirect_uri:intent.redirect,code:query.code});
      if (secret(provider)) body.set("client_secret",secret(provider));
      if (provider==="google") body.set("code_verifier",intent.verifier);
      const tokens=await jsonFetch(providers[provider].token,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body});
      let identity: {provider:string;subject:string;email:string|null;verified:boolean};
      if (provider==="google") identity=await googleIdentity(tokens.id_token,intent.nonce);
      else {
        if (typeof tokens.access_token!=="string") throw new Error("Missing access token");
        const me=await jsonFetch("https://kapi.kakao.com/v2/user/me",{headers:{Authorization:"Bearer "+tokens.access_token}});
        if (me.id===null || me.id===undefined) throw new Error("Missing Kakao subject");
        identity={provider,subject:String(me.id),email:typeof me.kakao_account?.email==="string"?me.kakao_account.email:null,verified:me.kakao_account?.is_email_valid===true && me.kakao_account?.is_email_verified===true};
      }
      const accountId=await this.accounts.resolveIdentity(identity,current, intent.linking);
      // Rotate the login token; a promoted guest keeps the same character, never its bearer.
      if (current) await this.accounts.logout(request,reply);
      await this.accounts.issue(request,reply,accountId);
      return reply.redirect("/account.html?login=success");
    } catch (error) {
      request.log.warn({provider,error:error instanceof Error?error.name:"Error"},"social login failed");
      return reply.redirect("/account.html?login=failed");
    }
  }
  async logout(request: FastifyRequest, reply: FastifyReply) { return this.accounts.logout(request,reply); }
  async requireUser(request: FastifyRequest, reply: FastifyReply) {
    const user=await this.currentUser(request);
    if (!user) reply.code(401);
    return user;
  }
}
function hashBase64(value:string) {return crypto.createHash("sha256").update(value).digest("base64url");}
