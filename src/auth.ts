import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { GameRepository } from "./game/repository";
import type { GameService } from "./game/service";

const AUTH_COOKIE_NAME = "textrpg_auth";
const OAUTH_STATE_COOKIE_NAME = "textrpg_oauth_state";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_ME_URL = "https://kapi.kakao.com/v2/user/me";

type SignedSession = {
  userId: string;
  exp: number;
};

type KakaoTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type KakaoUserResponse = {
  id?: number | string;
  properties?: {
    nickname?: string;
  };
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
    };
  };
};

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function base64UrlEncode(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), "=");
  return Buffer.from(padded.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString("utf8");
}

function authSecret() {
  return process.env.AUTH_SECRET || process.env.KAKAO_CLIENT_SECRET || "textrpg-local-dev-auth-secret";
}

function sign(value: string) {
  return base64UrlEncode(crypto.createHmac("sha256", authSecret()).update(value).digest());
}

function timingSafeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function signSession(userId: string) {
  const payload: SignedSession = {
    userId,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

function verifySession(token: string | undefined) {
  if (!token) {
    return null;
  }
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature || !timingSafeEqual(sign(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as Partial<SignedSession>;
    if (!payload.userId || typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null;
    }
    return payload.userId;
  } catch {
    return null;
  }
}

function parseCookies(request: FastifyRequest) {
  const header = request.headers.cookie;
  const pairs = typeof header === "string" ? header.split(";") : [];
  return Object.fromEntries(
    pairs.flatMap((pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex < 0) {
        return [];
      }
      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      return key ? [[key, decodeURIComponent(value)]] : [];
    }),
  );
}

function isSecureRequest(request: FastifyRequest) {
  return headerValue(request.headers["x-forwarded-proto"]) === "https" || process.env.NODE_ENV === "production";
}

function cookieHeader(name: string, value: string, request: FastifyRequest, maxAgeSeconds: number) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecureRequest(request)) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearCookieHeader(name: string, request: FastifyRequest) {
  return cookieHeader(name, "", request, 0);
}

function publicBaseUrl(request: FastifyRequest) {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const proto = headerValue(request.headers["x-forwarded-proto"]) || (process.env.NODE_ENV === "production" ? "https" : "http");
  const host = headerValue(request.headers["x-forwarded-host"]) || request.headers.host || `127.0.0.1:${process.env.PORT || 3000}`;
  return `${proto}://${host}`;
}

function kakaoRedirectUri(request: FastifyRequest) {
  return process.env.KAKAO_REDIRECT_URI || `${publicBaseUrl(request)}/api/auth/kakao/callback`;
}

function kakaoClientId() {
  return process.env.KAKAO_REST_API_KEY || process.env.KAKAO_CLIENT_ID || "";
}

function kakaoConfigured() {
  return Boolean(kakaoClientId());
}

function homeRedirect(reply: FastifyReply, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return reply.redirect(`/?${params.toString()}`);
}

async function requestKakaoToken(request: FastifyRequest, code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: kakaoClientId(),
    redirect_uri: kakaoRedirectUri(request),
    code,
  });
  if (process.env.KAKAO_CLIENT_SECRET) {
    body.set("client_secret", process.env.KAKAO_CLIENT_SECRET);
  }

  const response = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
    },
    body,
  });
  const payload = await response.json().catch(() => ({})) as KakaoTokenResponse & { error?: string; error_description?: string };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "카카오 토큰을 발급받지 못했습니다.");
  }
  return payload.access_token;
}

async function requestKakaoUser(accessToken: string) {
  const response = await fetch(KAKAO_USER_ME_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = await response.json().catch(() => ({})) as KakaoUserResponse & { msg?: string };
  if (!response.ok || payload.id === undefined || payload.id === null) {
    throw new Error(payload.msg || "카카오 사용자 정보를 가져오지 못했습니다.");
  }
  return payload;
}

export class AuthController {
  constructor(
    private readonly repository: GameRepository,
    private readonly gameService: GameService,
  ) {}

  async currentUser(request: FastifyRequest) {
    const userId = verifySession(parseCookies(request)[AUTH_COOKIE_NAME]);
    return userId ? this.repository.loadAuthUser(userId) : null;
  }

  async status(request: FastifyRequest) {
    const user = await this.currentUser(request);
    return {
      kakaoConfigured: kakaoConfigured(),
      user: user ? {
        id: user.id,
        provider: user.provider,
        nickname: user.nickname,
        email: user.email,
      } : null,
      saveInfo: user ? await this.gameService.getManualSaveForUser(user.id) : null,
    };
  }

  async startKakaoLogin(request: FastifyRequest, reply: FastifyReply) {
    if (!kakaoConfigured()) {
      reply.code(503);
      return {
        error: "kakao_not_configured",
        message: "KAKAO_REST_API_KEY 환경변수가 필요합니다.",
      };
    }

    const state = crypto.randomBytes(24).toString("hex");
    const url = new URL(KAKAO_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", kakaoClientId());
    url.searchParams.set("redirect_uri", kakaoRedirectUri(request));
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");

    reply.header("Set-Cookie", cookieHeader(OAUTH_STATE_COOKIE_NAME, state, request, 60 * 10));
    return reply.redirect(url.toString());
  }

  async handleKakaoCallback(request: FastifyRequest, reply: FastifyReply) {
    const query = request.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
    };
    const expectedState = parseCookies(request)[OAUTH_STATE_COOKIE_NAME];
    if (query.error) {
      reply.header("Set-Cookie", clearCookieHeader(OAUTH_STATE_COOKIE_NAME, request));
      return homeRedirect(reply, { login: "cancelled" });
    }
    if (!query.code || !query.state || !expectedState || query.state !== expectedState) {
      reply.header("Set-Cookie", clearCookieHeader(OAUTH_STATE_COOKIE_NAME, request));
      return homeRedirect(reply, { login: "invalid" });
    }

    try {
      const accessToken = await requestKakaoToken(request, query.code);
      const kakaoUser = await requestKakaoUser(accessToken);
      const kakaoUserId = String(kakaoUser.id);
      const user = await this.repository.upsertAuthUser({
        id: `kakao:${kakaoUserId}`,
        provider: "kakao",
        providerUserId: kakaoUserId,
        nickname: kakaoUser.kakao_account?.profile?.nickname || kakaoUser.properties?.nickname || null,
        email: kakaoUser.kakao_account?.email || null,
      });
      reply.header("Set-Cookie", [
        cookieHeader(AUTH_COOKIE_NAME, signSession(user.id), request, SESSION_MAX_AGE_SECONDS),
        clearCookieHeader(OAUTH_STATE_COOKIE_NAME, request),
      ]);
      return homeRedirect(reply, { login: "success" });
    } catch (error) {
      request.log.error(error);
      reply.header("Set-Cookie", clearCookieHeader(OAUTH_STATE_COOKIE_NAME, request));
      return homeRedirect(reply, { login: "failed" });
    }
  }

  async logout(request: FastifyRequest, reply: FastifyReply) {
    reply.header("Set-Cookie", clearCookieHeader(AUTH_COOKIE_NAME, request));
    return { ok: true };
  }

  async requireUser(request: FastifyRequest, reply: FastifyReply) {
    const user = await this.currentUser(request);
    if (!user) {
      reply.code(401);
      return null;
    }
    return user;
  }
}
