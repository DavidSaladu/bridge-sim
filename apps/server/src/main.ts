import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import type { ClientMsg } from "@bridge/shared";
import { RoomManager, type Outbox } from "./rooms.js";

const PORT = Number(process.env.PORT ?? 3001);
const manager = new RoomManager();

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(websocket);

app.get("/api/health", async () => ({ ok: true, rooms: manager.roomCount }));

app.post("/api/rooms", async () => {
  const room = manager.create();
  return { code: room.code };
});

app.get<{ Params: { code: string } }>("/api/rooms/:code", async (req, reply) => {
  const room = manager.get(req.params.code);
  if (!room) return reply.code(404).send({ error: "Sala no encontrada" });
  return room.snapshot();
});

app.get<{ Params: { code: string }; Querystring: { name?: string } }>(
  "/ws/rooms/:code",
  { websocket: true },
  (socket, req) => {
    const room = manager.get(req.params.code);
    const name = req.query.name ?? "";
    if (!room) {
      socket.send(JSON.stringify({ t: "error", code: "not_found", message: "Sala no encontrada" }));
      socket.close();
      return;
    }
    const outbox: Outbox = {
      send: (msg) => socket.readyState === 1 && socket.send(JSON.stringify(msg)),
      close: () => socket.close(),
    };
    const res = room.join(name, outbox);
    if (!res.ok) {
      socket.send(JSON.stringify({ t: "error", code: "join_failed", message: res.error }));
      socket.close();
      return;
    }
    const playerId = res.id;
    socket.on("message", (raw: Buffer) => {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      room.handleMessage(playerId, msg);
    });
    socket.on("close", () => room.disconnect(playerId));
  },
);

setInterval(() => manager.pruneAll(), 60_000).unref();

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
