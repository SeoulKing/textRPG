import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { GameActionSchema } from "./game/schemas";
import type { GameService } from "./game/service";

const MessageSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  action: GameActionSchema.refine(action => action.type === "arcana_combat" && !!action.spatial),
});

// Reuse the HTTP action service and its per-game mutation lock. Never run
// simulation or award rewards independently in the transport layer.
export function registerArcanaCombatSocket(app: FastifyInstance, service: GameService) {
  app.get<{ Params: { gameId: string } }>("/api/games/:gameId/combat-ws", {
    websocket: true,
    preValidation: async (request, reply) => {
      const origin = request.headers.origin;
      if (origin) {
        try {
          if (new URL(origin).host !== request.headers.host) return reply.code(403).send({ error: "invalid_origin" });
        } catch { return reply.code(403).send({ error: "invalid_origin" }); }
      }
    },
  }, (socket, request) => {
    let outstanding = 0;
    let lastId = 0;
    let alive = true;
    const send = (value: unknown) => {
      if (socket.readyState === 1 && socket.bufferedAmount < 1024 * 1024) socket.send(JSON.stringify(value));
      else if (socket.readyState === 1) socket.close(1013, "Slow consumer");
    };
    const heartbeat = setInterval(() => {
      if (!alive) { socket.terminate(); return; }
      alive = false;
      if (socket.readyState === 1) socket.ping();
    }, 30000);
    heartbeat.unref();
    socket.on("pong", () => { alive = true; });
    socket.on("close", () => clearInterval(heartbeat));
    socket.on("error", error => request.log.warn({ err: error }, "combat websocket"));
    // Attach synchronously: messages must not be lost during asynchronous setup.
    socket.on("message", (raw, binary) => {
      let value: unknown;
      try { value = binary ? null : JSON.parse(raw.toString()); } catch { value = null; }
      const parsed = MessageSchema.safeParse(value);
      if (!parsed.success || parsed.data.id <= lastId) { socket.close(1008, "Invalid combat input"); return; }
      if (outstanding >= 8) { socket.close(1013, "Too many pending inputs"); return; }
      const { id, action } = parsed.data;
      lastId = id;
      outstanding++;
      // Enqueue immediately in the shared per-game lock, including across
      // reconnects and HTTP finish/save requests. A socket-local queue would
      // let a new connection overtake old accepted inputs.
      void service.performAction(request.params.gameId, action).then(result => {
        send({ id, result });
      }, error => {
        send({ id, result: { error: "action_failed", message: error instanceof Error ? error.message : "전투 입력을 처리하지 못했습니다." } });
      }).catch(error => {
        request.log.error({ err: error }, "combat websocket response");
        socket.close(1011, "Combat transport failed");
      }).finally(() => { outstanding--; });
    });
    send({ ready: true, protocol: 1 });
  });
}
