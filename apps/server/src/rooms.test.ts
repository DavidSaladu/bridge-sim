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
    expect(snap.players.find((p) => p.id === r1.id)?.station).toBe("helm");
    expect(snap.players.find((p) => p.id === r2.id)?.station).toBeNull();
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
