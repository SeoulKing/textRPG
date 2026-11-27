import crypto from "node:crypto";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { GameRepository } from "../game/repository";
import type { GameService } from "../game/service";
import { OnlineStore, type OnlineTransaction } from "./store";

export class OnlineError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
export type Principal = { id: string; accountId: string | null; sessionId: string; expires: number };
export type Account = { id: string; createdAt: number; characterId: string | null; mergedInto?: string; choices?: string[] };
export type Identity = { key: string; provider: string; subject: string; accountId: string; email: string | null; verified: boolean };
export type Character = { id: string; ownerId: string; gameId: string; name: string | null; createdAt: number; archived?: boolean; blockedUntil?: number };
type Session = Principal & { revoked?: boolean };
export const cookieName = "arcana_session";
// Login stays optional during development; set false to enable the registered-account policy.
export const developmentAccess = () => process.env.ARCANA_DEVELOPMENT_ACCESS !== "false";
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
export function cookies(request: FastifyRequest) {
  const result: Record<string,string> = {};
  for (const part of (request.headers.cookie || "").split(";")) {
    const at = part.indexOf("=");
    if (at < 0) continue;
    try { result[part.slice(0,at).trim()] = decodeURIComponent(part.slice(at+1).trim()); } catch { /* ignore malformed cookies */ }
  }
  return result;
}
export function setCookie(reply: FastifyReply, name: string, value: string, seconds: number) {
  const cookie = name+"="+encodeURIComponent(value)+"; Path=/; HttpOnly; SameSite=Lax; Max-Age="+seconds+(process.env.NODE_ENV === "production" ? "; Secure" : "");
  const old = reply.getHeader("set-cookie");
  reply.header("set-cookie", [...(Array.isArray(old) ? old : old ? [String(old)] : []),cookie]);
}
export function nativeDevelopment(request: FastifyRequest) {
  return process.env.NODE_ENV !== "production" && ["127.0.0.1","::1","::ffff:127.0.0.1"].includes(request.ip) && request.headers["x-arcana-native"] === "1";
}
export class OnlineAccounts {
  onRevoke: (sessionId: string) => Promise<void> = async () => {};
  onCharactersChanged: (ids: string[]) => Promise<void> = async () => {};
  constructor(public store: OnlineStore, private repository: GameRepository, private games: GameService) {}
  async current(request: FastifyRequest): Promise<Principal | null> {
    const bearer = nativeDevelopment(request) && request.headers.authorization?.startsWith("Bearer ") ? request.headers.authorization.slice(7) : "";
    const token = cookies(request)[cookieName] || bearer;
    if (!token) return null;
    return this.store.transaction(async tx => {
      const session = await tx.get<Session>("session",hashToken(token));
      if (!session || session.revoked || session.expires <= Date.now()) return null;
      if (session.accountId) {
        let account = await tx.get<Account>("account",session.accountId);
        while (account?.mergedInto) account = await tx.get<Account>("account",account.mergedInto);
        if (!account) return null;
        return {...session,id:account.id,accountId:account.id};
      }
      return session;
    });
  }
  async require(request: FastifyRequest) {
    const principal = await this.current(request);
    if (!principal) throw new OnlineError("auth_required","접속이 만료되었습니다. 다시 입장해 주세요.",401);
    return principal;
  }
  async issue(request: FastifyRequest, reply: FastifyReply, accountId: string | null = null, guestId?: string) {
    const token = crypto.randomBytes(32).toString("base64url"), sessionId = hashToken(token);
    const seconds = (accountId ? 30 : 7)*86400;
    const principal: Session = {id:accountId || guestId || crypto.randomUUID(),accountId,sessionId,expires:Date.now()+seconds*1000};
    await this.store.transaction(tx => tx.put("session",sessionId,principal));
    setCookie(reply,cookieName,token,seconds);
    return {principal,...(nativeDevelopment(request) ? {sessionToken:token} : {})};
  }
  async guest(request: FastifyRequest, reply: FastifyReply) {
    const current = await this.current(request);
    if (current) return {principal:current};
    return this.issue(request,reply);
  }
  async logout(request: FastifyRequest, reply: FastifyReply) {
    const current = await this.current(request);
    if (current) {
      await this.store.transaction(async tx => {
        const session = await tx.get<Session>("session",current.sessionId);
        if (session) await tx.put("session",current.sessionId,{...session,revoked:true});
      });
      await this.onRevoke(current.sessionId);
    }
    setCookie(reply,cookieName,"",0);
    setCookie(reply,"textrpg_auth","",0);
    return {ok:true};
  }
  async account(principal: Principal) {
    return principal.accountId ? this.store.transaction(tx => tx.get<Account>("account",principal.accountId!)) : null;
  }
  async character(principal: Principal) {
    return this.store.transaction(async tx => {
      const owner = principal.accountId ? await tx.get<Account>("account",principal.accountId) : null;
      const id = owner?.characterId || (await tx.get<{characterId:string}>("guest",principal.id))?.characterId;
      const character = id ? await tx.get<Character>("character",id) : null;
      return character && !character.archived ? character : null;
    });
  }
  async ensureCharacter(principal: Principal) {
    const existing = await this.character(principal);
    if (existing) return existing;
    const account = await this.account(principal);
    if (account?.choices?.length) throw new OnlineError("character_choice_required","기존 캐릭터 중 이어갈 캐릭터를 선택해 주세요.");
    const snapshot = await this.games.createGame("arcana");
    return this.store.transaction(async tx => {
      const owner = principal.accountId ? await tx.get<Account>("account",principal.accountId) : null;
      const linked = owner?.characterId || (await tx.get<{characterId:string}>("guest",principal.id))?.characterId;
      if (linked) return (await tx.get<Character>("character",linked))!;
      const character: Character = {id:crypto.randomUUID(),ownerId:principal.id,gameId:snapshot.gameId,name:null,createdAt:Date.now()};
      await tx.put("character",character.id,character);
      await tx.put("game-owner",character.gameId,{ownerId:principal.id,characterId:character.id,gameId:character.gameId});
      if (owner) await tx.put("account",owner.id,{...owner,characterId:character.id});
      else await tx.put("guest",principal.id,{characterId:character.id,expires:principal.expires});
      return character;
    });
  }
  async register(principal: Principal, value: unknown) {
    if (!principal.accountId && !developmentAccess()) throw new OnlineError("login_required","이름을 등록하려면 로그인해 주세요.",401);
    const name = typeof value === "string" ? value.normalize("NFC") : "";
    if (!/^[가-힣a-zA-Z0-9]{2,12}$/.test(name) || /^(admin|administrator|운영자|관리자)$/i.test(name)) throw new OnlineError("invalid_name","이름은 한글·영문·숫자 2~12자로 정해 주세요.",400);
    const character = await this.ensureCharacter(principal);
    const saved = await this.store.transaction(async tx => {
      const current = (await tx.get<Character>("character",character.id))!;
      const key = name.toLowerCase(), taken = await tx.get<{id:string}>("name",key);
      if (taken && taken.id !== current.id) throw new OnlineError("name_taken","이미 사용 중인 이름입니다.");
      if (current.name) await tx.remove("name",current.name.toLowerCase());
      current.name = name;
      await tx.put("name",key,{id:current.id});
      await tx.put("character",current.id,current);
      return current;
    });
    await this.onCharactersChanged([character.id]);
    return saved;
  }
  async bindGame(gameId: string, principal: Principal) {
    await this.store.transaction(tx => tx.put("game-owner",gameId,{ownerId:principal.id,gameId}));
  }
  async authorize(gameId: string, principal: Principal) {
    const owner = await this.store.transaction(tx => tx.get<{ownerId:string;characterId?:string}>("game-owner",gameId));
    if (!owner || owner.ownerId !== principal.id) throw new OnlineError("game_not_found","접근할 수 있는 저장을 찾지 못했습니다.",404);
    if (owner.characterId) {
      const character = await this.store.transaction(tx => tx.get<Character>("character",owner.characterId!));
      if (!character || character.archived) throw new OnlineError("game_not_found","보관된 저장에는 직접 접근할 수 없습니다.",404);
      if ((character.blockedUntil || 0)>Date.now()) throw new OnlineError("access_restricted","접속이 제한된 캐릭터입니다.",403);
    }
    return owner;
  }
  async migrateLegacy(accountId: string, legacyUserId: string) {
    const record = await this.repository.loadManualGameForUser(legacyUserId);
    if (!record) return;
    try { record.session=await this.repository.loadGame(record.session.id); } catch { /* The owned manual snapshot remains a recoverable source. */ }
    await this.store.transaction(async tx => {
      if (await tx.get("legacy-import",legacyUserId)) return;
      const owner = await tx.get<{ownerId:string}>("game-owner",record.session.id);
      if (owner && owner.ownerId !== accountId) return;
      await tx.put("game-owner",record.session.id,{ownerId:accountId,gameId:record.session.id});
      if (record.session.state.flags.in_magic_world) {
        const account = (await tx.get<Account>("account",accountId))!;
        if (!account.characterId) {
          const character: Character = {id:crypto.randomUUID(),ownerId:accountId,gameId:record.session.id,name:null,createdAt:Date.now()};
          await tx.put("character",character.id,character);
          await tx.put("account",accountId,{...account,characterId:character.id});
          await tx.put("game-owner",character.gameId,{ownerId:accountId,characterId:character.id,gameId:character.gameId});
          record.session.state.arcanaCombat.battle = null;
          record.session.state.flags.arcana_online = true;
          await tx.saveGame(record.session);
        }
      }
      await tx.put("legacy-import",legacyUserId,{at:Date.now(),accountId});
    });
  }
  async resolveIdentity(input: Omit<Identity,"key"|"accountId">, current: Principal | null, linking: boolean) {
    const changed: string[] = [];
    const legacy=input.provider==="kakao" ? await this.repository.loadManualGameForUser("kakao:"+input.subject) : null;
    const accountId = await this.store.transaction(async tx => {
      const key = input.provider+":"+input.subject;
      const identity = await tx.get<Identity>("identity",key);
      let account = identity ? await tx.get<Account>("account",identity.accountId) : null;
      while (account?.mergedInto) account = await tx.get<Account>("account",account.mergedInto);
      const matching = input.verified && input.email ? (await tx.list<Identity>("identity")).filter(i=>i.key!==key && i.provider!==input.provider && i.verified && i.email===input.email) : [];
      const matched = matching[0] ? await tx.get<Account>("account",matching[0].accountId) : null;
      const target = linking && current?.accountId ? await tx.get<Account>("account",current.accountId) : matched;
      if (target && account && account.id !== target.id) {
        const choices = [...new Set([...(target.choices || []),...(account.choices || []),target.characterId,account.characterId].filter((id):id is string=>!!id))];
        for (const charId of choices) {
          const character = await tx.get<Character>("character",charId);
          if (character) {
            character.ownerId = target.id;
            character.archived = choices.length>1;
            await tx.put("character",charId,character);
            await tx.put("game-owner",character.gameId,{ownerId:target.id,characterId:charId,gameId:character.gameId});
            changed.push(charId);
          }
        }
        for (const owned of await tx.list<{ownerId:string;gameId:string}>("game-owner")) if (owned.ownerId===account.id && owned.gameId) await tx.put("game-owner",owned.gameId,{...owned,ownerId:target.id});
        for (const item of await tx.list<Identity>("identity")) if (item.accountId===account.id) await tx.put("identity",item.key,{...item,accountId:target.id});
        await tx.put("account",account.id,{...account,mergedInto:target.id,characterId:null});
        account = {...target,characterId:choices.length===1?choices[0]:null,choices:choices.length>1?choices:undefined};
      } else account = target || account;
      if (!account) account = {id:crypto.randomUUID(),createdAt:Date.now(),characterId:null};
      if (!account.characterId && !account.choices?.length && current && !current.accountId && !legacy?.session.state.flags.in_magic_world) {
        const guest = await tx.get<{characterId:string}>("guest",current.id);
        const character = guest ? await tx.get<Character>("character",guest.characterId) : null;
        if (character) {
          character.ownerId=account.id;
          await tx.put("character",character.id,character);
          await tx.put("game-owner",character.gameId,{ownerId:account.id,characterId:character.id,gameId:character.gameId});
          await tx.remove("guest",current.id);
          account.characterId=character.id;
          changed.push(character.id);
        }
      }
      await tx.put("account",account.id,account);
      await tx.put("identity",key,{...input,key,accountId:account.id});
      return account.id;
    });
    await this.onCharactersChanged(changed);
    if (input.provider==="kakao") await this.migrateLegacy(accountId,"kakao:"+input.subject);
    return accountId;
  }
  async selectCharacter(principal: Principal, characterId: string) {
    await this.store.transaction(async tx => {
      const account = principal.accountId ? await tx.get<Account>("account",principal.accountId) : null;
      if (!account?.choices?.includes(characterId)) throw new OnlineError("invalid_character_choice","선택 가능한 캐릭터가 아닙니다.",400);
      for (const id of account.choices) {
        const character = (await tx.get<Character>("character",id))!;
        await tx.put("character",id,{...character,archived:id!==characterId});
      }
      await tx.put("account",account.id,{...account,characterId,choices:undefined});
    });
    await this.onCharactersChanged([]);
  }
  async choices(principal: Principal) {
    const account = await this.account(principal);
    return this.store.transaction(async tx => {
      const characters = await Promise.all((account?.choices || []).map(id=>tx.get<Character>("character",id)));
      return characters.filter(Boolean).map(c=>({id:c!.id,name:c!.name || "이름 미등록",createdAt:c!.createdAt}));
    });
  }
}
