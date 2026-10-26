import { PassThrough } from "node:stream";
import type { FastifyReply } from "fastify";
import type { GameService } from "./game/service";
import type { GameAction } from "./game/schemas";
import type { ActionTiming } from "./game/action-observation";

export function sendActionStream(reply: FastifyReply, service: GameService, gameId: string, action: GameAction, requestId: string) {
  const stream = new PassThrough();
  const send = (value: unknown) => {
    if (!stream.destroyed && !stream.writableEnded) stream.write(JSON.stringify(value) + "\n");
  };
  reply.type("application/x-ndjson; charset=utf-8").header("Cache-Control", "no-store, no-transform")
    .header("X-Accel-Buffering", "no").header("X-Action-Receipt", "persistent").send(stream);
  send({ type: "accepted", requestId });
  let timing: ActionTiming | undefined;
  void service.performAction(gameId, action, { requestId, onParagraph: send, onTiming: value => { timing = value; } })
    .then(snapshot => send({ type: "complete", snapshot, timing }))
    .catch(error => send({ type: "error", message: error instanceof Error ? error.message : "행동을 처리하지 못했습니다." }))
    .finally(() => {
      reply.log.info({ gameId, actionType: action.type, timing }, "game action latency");
      if (!stream.destroyed) stream.end();
    });
  return reply;
}
