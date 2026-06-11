import path from "node:path";
import fs from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import type { ClientMsg } from "@bridge/shared";
import { AccessToken } from "livekit-server-sdk";
import { RoomManager, getScenarioLibrary, type Outbox } from "./rooms.js";

// Carga .env simple, buscando en cwd y hasta 3 niveles hacia arriba (dev local / producción)
for (let dir = process.cwd(), i = 0; i < 4; i++, dir = path.dirname(dir)) {
  try {
    const envFile = fs.readFileSync(path.join(dir, ".env"), "utf8");
    for (const line of envFile.split("\n")) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
    break;
  } catch { /* seguir buscando */ }
}

const PORT = Number(process.env.PORT ?? 3001);
const PUBLIC_DIR = path.resolve(process.cwd(), "public");

async function main(): Promise<void> {
  const manager = new RoomManager();
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });
  await app.register(websocket);

  app.get("/api/health", async () => ({ ok: true, rooms: manager.roomCount }));

  app.get("/api/scenarios", async () =>
    getScenarioLibrary().map(({ id, name, description }) => ({ id, name, description })),
  );

  app.post("/api/rooms", async () => {
    const room = manager.create();
    return { code: room.code };
  });

  app.post<{ Params: { code: string }; Body: { resumeKey?: string } }>(
    "/api/rooms/:code/voice",
    async (req, reply) => {
      const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
      if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
        return reply.code(503).send({ error: "Voz no configurada" });
      }
      const room = manager.get(req.params.code);
      if (!room) return reply.code(404).send({ error: "Sala no encontrada" });
      const player = req.body?.resumeKey ? room.authByResumeKey(req.body.resumeKey) : null;
      if (!player) return reply.code(401).send({ error: "No autorizado" });
      const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: player.id,
        name: player.name,
        ttl: "6h",
      });
      at.addGrant({ roomJoin: true, room: room.code, canPublish: true, canSubscribe: true });
      return { token: await at.toJwt(), url: LIVEKIT_URL };
    },
  );

  app.get<{ Params: { code: string } }>("/api/rooms/:code", async (req, reply) => {
    const room = manager.get(req.params.code);
    if (!room) return reply.code(404).send({ error: "Sala no encontrada" });
    return room.snapshot();
  });

  app.get<{ Params: { code: string }; Querystring: { name?: string; resume?: string } }>(
    "/ws/rooms/:code",
    { websocket: true },
    (socket, req) => {
      const room = manager.get(req.params.code);
      const name = req.query.name ?? "";
      const resume = req.query.resume;
      if (!room) {
        socket.send(JSON.stringify({ t: "error", code: "not_found", message: "Sala no encontrada" }));
        socket.close();
        return;
      }
      const outbox: Outbox = {
        send: (msg) => socket.readyState === 1 && socket.send(JSON.stringify(msg)),
        close: () => socket.close(),
      };
      let res = resume ? room.resume(resume, outbox) : null;
      if (!res || !res.ok) res = room.join(name, outbox);
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
      // Heartbeat: evita que el proxy corte la conexión por inactividad
      const heartbeat = setInterval(() => {
        if (socket.readyState === 1) socket.ping();
      }, 25_000);
      socket.on("close", () => {
        clearInterval(heartbeat);
        room.disconnect(playerId);
      });
    },
  );

  // En producción servimos el build del cliente web desde ./public
  if (fs.existsSync(PUBLIC_DIR)) {
    await app.register(fastifyStatic, { root: PUBLIC_DIR });
    app.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith("/api") || req.raw.url?.startsWith("/ws")) {
        return reply.code(404).send({ error: "No encontrado" });
      }
      return reply.sendFile("index.html");
    });
  }

  setInterval(() => manager.pruneAll(), 60_000).unref();

  await app.listen({ port: PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
