import { describe, expect, it, vi } from "vitest";
import { RoomManager, type Outbox } from "./rooms.js";
import type { ServerMsg } from "@bridge/shared";

function fakeOutbox(): Outbox & { msgs: ServerMsg[] } {
  const msgs: ServerMsg[] = [];
  return { msgs, send: (m) => msgs.push(m), close: () => {} };
}

describe("RoomManager", () => {
  it("crea salas con código de 6 caracteres único", () => {
    const mgr = new RoomManager();
    const a = mgr.create();
    const b = mgr.create();
    expect(a.code).toHaveLength(6);
    expect(a.code).not.toBe(b.code);
    expect(mgr.get(a.code.toLowerCase())).toBe(a);
  });

  it("admite hasta 6 jugadores y el primero es host", () => {
    const room = new RoomManager().create();
    const boxes = Array.from({ length: 7 }, fakeOutbox);
    const results = boxes.map((b, i) => room.join(`P${i}`, b));
    expect(results.slice(0, 6).every((r) => r.ok)).toBe(true);
    expect(results[6]?.ok).toBe(false);
    const snap = room.snapshot();
    expect(snap.players).toHaveLength(6);
    expect(snap.players[0]?.isHost).toBe(true);
    expect(snap.players.filter((p) => p.isHost)).toHaveLength(1);
  });

  it("no permite ocupar un puesto ya ocupado", () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const b2 = fakeOutbox();
    const r1 = room.join("Ana", b1);
    const r2 = room.join("Bea", b2);
    if (!r1.ok || !r2.ok) throw new Error("join failed");
    room.handleMessage(r1.id, { t: "takeStation", station: "helm" });
    room.handleMessage(r2.id, { t: "takeStation", station: "helm" });
    const err = b2.msgs.find((m) => m.t === "error");
    expect(err).toBeDefined();
    const snap = room.snapshot();
    expect(snap.players.find((p) => p.id === r1.id)?.stations).toContain("helm");
    expect(snap.players.find((p) => p.id === r2.id)?.stations).toHaveLength(0);
  });

  it("difunde el chat a todos", () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const b2 = fakeOutbox();
    const r1 = room.join("Ana", b1);
    room.join("Bea", b2);
    if (!r1.ok) throw new Error("join failed");
    room.handleMessage(r1.id, { t: "chat", text: "hola puente" });
    expect(b1.msgs.some((m) => m.t === "chat" && m.text === "hola puente")).toBe(true);
    expect(b2.msgs.some((m) => m.t === "chat" && m.text === "hola puente")).toBe(true);
  });

  it("mantiene al jugador 5 min tras desconexión y luego lo purga", () => {
    vi.useFakeTimers();
    const mgr = new RoomManager();
    const room = mgr.create();
    const r = room.join("Ana", fakeOutbox());
    if (!r.ok) throw new Error("join failed");
    room.disconnect(r.id);
    expect(room.snapshot().players[0]?.connected).toBe(false);
    expect(room.prune(Date.now() + 60_000)).toBe(false);
    expect(room.prune(Date.now() + 6 * 60_000)).toBe(true);
    vi.useRealTimers();
  });
});

describe("Reconexión", () => {
  it("resume devuelve la misma identidad y conserva el puesto", () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const r1 = room.join("Ana", b1);
    if (!r1.ok) throw new Error("join failed");
    const welcome = b1.msgs.find((m) => m.t === "welcome");
    if (!welcome || welcome.t !== "welcome") throw new Error("no welcome");
    room.handleMessage(r1.id, { t: "takeStation", station: "science" });
    room.disconnect(r1.id);

    const b2 = fakeOutbox();
    const r2 = room.resume(welcome.resumeKey, b2);
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.id).toBe(r1.id);
    const snap = room.snapshot();
    expect(snap.players).toHaveLength(1);
    expect(snap.players[0]?.stations).toContain("science");
    expect(snap.players[0]?.connected).toBe(true);
  });

  it("resume con clave inválida falla", () => {
    const room = new RoomManager().create();
    expect(room.resume("clave-falsa", fakeOutbox()).ok).toBe(false);
  });
});

describe("Partida", () => {
  it("solo el host puede iniciar, y los snapshots llegan a todos", async () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const b2 = fakeOutbox();
    const r1 = room.join("Host", b1);
    const r2 = room.join("Pil", b2);
    if (!r1.ok || !r2.ok) throw new Error("join failed");

    room.handleMessage(r2.id, { t: "startGame" });
    expect(room.phase).toBe("lobby");
    expect(b2.msgs.some((m) => m.t === "error" && m.code === "cannot_start")).toBe(true);

    room.handleMessage(r1.id, { t: "startGame" });
    expect(room.phase).toBe("playing");

    await new Promise((r) => setTimeout(r, 250));
    room.stop();
    expect(b1.msgs.some((m) => m.t === "snap")).toBe(true);
    expect(b2.msgs.some((m) => m.t === "snap")).toBe(true);
  });

  it("los comandos helm solo valen desde Pilotaje", async () => {
    const room = new RoomManager().create();
    const b1 = fakeOutbox();
    const r1 = room.join("Host", b1);
    if (!r1.ok) throw new Error("join failed");
    room.handleMessage(r1.id, { t: "startGame" });

    room.handleMessage(r1.id, { t: "helm", cmd: "setImpulse", value: 1 });
    expect(b1.msgs.some((m) => m.t === "error" && m.code === "wrong_station")).toBe(true);
    expect(room.world?.ship.impulse).toBe(0);

    room.handleMessage(r1.id, { t: "takeStation", station: "helm" });
    room.handleMessage(r1.id, { t: "helm", cmd: "setImpulse", value: 0.8 });
    expect(room.world?.ship.impulse).toBe(0.8);
    room.stop();
  });
});

describe("Multipuesto", () => {
  it("un jugador puede ocupar varios puestos y dejar uno concreto", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Solo", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "helm" });
    room.handleMessage(r.id, { t: "takeStation", station: "weapons" });
    room.handleMessage(r.id, { t: "takeStation", station: "captain" });
    expect(room.snapshot().players[0]?.stations).toEqual(["helm", "weapons", "captain"]);
    room.handleMessage(r.id, { t: "leaveStation", station: "weapons" });
    expect(room.snapshot().players[0]?.stations).toEqual(["helm", "captain"]);
    // y los comandos helm funcionan estando también de capitán
    room.handleMessage(r.id, { t: "startGame" });
    room.handleMessage(r.id, { t: "helm", cmd: "setImpulse", value: 0.5 });
    expect(room.world?.ship.impulse).toBe(0.5);
    room.stop();
  });
});

describe("Armas y fin de partida", () => {
  it("comandos weapons solo desde Armamento, y la victoria devuelve al lobby", async () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Art", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "takeStation", station: "weapons" });
    room.handleMessage(r.id, { t: "startGame" });

    // matar a los hostiles directamente para forzar victoria
    const world = room.world!;
    for (const e of world.snapshot().entities) {
      if (e.kind === "cpu") {
        const cpu = world.get(e.id) as unknown as { takeDamage: (d: number, b: number, w: typeof world) => boolean };
        cpu.takeDamage(99999, 0, world);
      }
    }
    await new Promise((res) => setTimeout(res, 150));
    expect(b.msgs.some((m) => m.t === "gameOver" && m.victory)).toBe(true);
    expect(room.phase).toBe("lobby");
    expect(room.world).toBeNull();
  });
});

describe("Traspaso de host", () => {
  it("si el host se desconecta, el rol pasa al primer jugador conectado", () => {
    const room = new RoomManager().create();
    const r1 = room.join("A", fakeOutbox());
    const r2 = room.join("B", fakeOutbox());
    if (!r1.ok || !r2.ok) throw new Error("join failed");
    room.disconnect(r1.id);
    const snap = room.snapshot();
    expect(snap.players.find((p) => p.id === r2.id)?.isHost).toBe(true);
    expect(snap.players.find((p) => p.id === r1.id)?.isHost).toBe(false);
  });
});

describe("Host con StrictMode (conexión doble)", () => {
  it("si el host fantasma está desconectado y entra alguien nuevo, el nuevo es host", () => {
    const room = new RoomManager().create();
    const r1 = room.join("A", fakeOutbox());
    if (!r1.ok) throw new Error("join failed");
    room.disconnect(r1.id); // queda fantasma con isHost
    const r2 = room.join("A", fakeOutbox()); // remontaje de StrictMode
    if (!r2.ok) throw new Error("join failed");
    const snap = room.snapshot();
    expect(snap.players.find((p) => p.id === r2.id)?.isHost).toBe(true);
    expect(snap.players.filter((p) => p.isHost)).toHaveLength(1);
  });
});

describe("Ingeniería", () => {
  it("los comandos solo valen desde Ingeniería y modifican los sistemas", () => {
    const room = new RoomManager().create();
    const b = fakeOutbox();
    const r = room.join("Ing", b);
    if (!r.ok) throw new Error("join failed");
    room.handleMessage(r.id, { t: "startGame" });

    room.handleMessage(r.id, { t: "engineering", cmd: "setPower", system: "impulse", value: 3 });
    expect(b.msgs.some((m) => m.t === "error" && m.code === "wrong_station")).toBe(true);
    expect(room.world?.ship.engineering.systems.impulse.power).toBe(1);

    room.handleMessage(r.id, { t: "takeStation", station: "engineering" });
    room.handleMessage(r.id, { t: "engineering", cmd: "setPower", system: "impulse", value: 3 });
    room.handleMessage(r.id, { t: "engineering", cmd: "setCoolant", system: "impulse", value: 5 });
    room.handleMessage(r.id, { t: "engineering", cmd: "repair", system: "impulse" });
    const eng = room.world!.ship.engineering;
    expect(eng.systems.impulse.power).toBe(3);
    expect(eng.systems.impulse.coolant).toBe(5);
    expect(eng.repairing).toBe("impulse");
    room.stop();
  });
});
