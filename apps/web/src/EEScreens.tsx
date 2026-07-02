import { useEffect, useRef, useState } from "react";
import type { GameSnap, MissileType } from "@bridge/shared";
import { MISSILE_LABELS, MISSILE_TYPES } from "@bridge/shared";
import { Radar, type TimedEvent } from "./Radar.js";
import { Viewport3D } from "./Viewport3D.js";
import { speedU } from "./units.js";

/* ————— Piezas compartidas estilo EE ————— */

export function InfoRow({ icon, label, value, color }: { icon: string; label: string; value: string; color?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)",
      padding: "0.3rem 0.6rem", minWidth: 210, fontSize: "0.9rem",
    }}>
      <span style={{ width: 18, textAlign: "center" }}>{icon}</span>
      <span className="muted">{label}</span>
      <span style={{ marginLeft: "auto", fontWeight: 600, color }}>{value}</span>
    </div>
  );
}

function StationBadge({ icon, name }: { icon: string; name: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      border: "1px solid var(--text-dim)", borderRadius: 24,
      padding: "0.35rem 1.1rem", background: "rgba(10,16,30,0.85)",
      fontSize: "1.15rem", letterSpacing: "0.03em",
    }}>
      <span>{icon}</span> {name}
    </div>
  );
}

const overlay = (pos: React.CSSProperties): React.CSSProperties => ({
  position: "absolute", zIndex: 4, display: "flex", flexDirection: "column", gap: 4, ...pos,
});

/* ————— HELM ————— */

export function HelmEE({ snap, send, events }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[] }) {
  const { ship } = snap;
  const [impulse, setImpulse] = useState(0);
  const [show3D, setShow3D] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(600);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.max(360, Math.min(el.clientWidth - 12, el.clientHeight - 12))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function applyImpulse(v: number) {
    setImpulse(v);
    send({ t: "helm", cmd: "setImpulse", value: v / 100 });
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", height: "min(78vh, 860px)", width: "100%", overflow: "hidden", borderRadius: 8, background: "radial-gradient(ellipse at center, #0b1120 0%, #060a14 75%)" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Radar
          snap={snap}
          range={5000}
          size={size}
          events={events}
          ringLabels
          onSetHeading={(deg) => send({ t: "helm", cmd: "setHeading", value: deg })}
        />
      </div>

      {/* Cabecera derecha */}
      <div style={overlay({ top: 12, right: 12, flexDirection: "row", alignItems: "center" })}>
        <button style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }} onClick={() => setShow3D(!show3D)}>{show3D ? "✕ 3D" : "🌌 3D"}</button>
        <StationBadge icon="🚀" name="Pilotaje" />
      </div>
      {show3D && (
        <div style={{ position: "absolute", top: 56, right: 12, width: 300, zIndex: 5 }}>
          <Viewport3D snap={snap} height={170} collapsible={false} />
        </div>
      )}

      {/* Info superior-izquierda */}
      <div style={overlay({ top: 12, left: 12 })}>
        <InfoRow icon="⚡" label="Energía" value={String(Math.round(ship.energy))} color={ship.energy < 200 ? "#f87171" : undefined} />
        <InfoRow icon="🧭" label="Rumbo" value={`${Math.round(ship.heading)}°`} />
        <InfoRow icon="➤" label="Velocidad" value={speedU(ship.speed)} color={ship.speed < 0 ? "#f87171" : undefined} />
      </div>

      {/* Impulso vertical + warp + salto + atraque, abajo-izquierda */}
      <div style={overlay({ bottom: 12, left: 12, flexDirection: "row", alignItems: "flex-end", gap: 12 })}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <input
            type="range" min={-50} max={100} value={impulse}
            onChange={(e) => applyImpulse(Number(e.target.value))}
            style={{
              writingMode: "vertical-lr" as never, direction: "rtl",
              width: 36, height: 200, accentColor: impulse < 0 ? "#f87171" : undefined,
              WebkitAppearance: "slider-vertical",
            } as React.CSSProperties}
          />
          <span className="muted" style={{ fontSize: "0.75rem", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            Impulso {impulse}%
          </span>
        </div>
        {ship.hasWarp && (
          <div style={{ display: "flex", flexDirection: "column-reverse", gap: 3 }}>
            {[0, 1, 2, 3, 4].map((lvl) => (
              <button
                key={lvl}
                onClick={() => send({ t: "helm", cmd: "setWarp", value: lvl })}
                style={{ padding: "0.2rem 0.55rem", fontSize: "0.8rem", background: ship.warp === lvl ? "#7c3aed" : "rgba(10,16,30,0.85)" }}
              >
                {lvl === 0 ? "W0" : "W" + lvl}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ship.hasJump && <JumpCompact snap={snap} send={send} />}
          {ship.docked ? (
            <button style={{ borderColor: "#4ade80", background: "#14532d" }} onClick={() => send({ t: "helm", cmd: "undock" })}>⏏ Despegar</button>
          ) : ship.canDock ? (
            <button style={{ borderColor: "#4ade80", background: "rgba(10,16,30,0.85)" }} onClick={() => { applyImpulse(0); send({ t: "helm", cmd: "dock" }); }}>🛰 Atracar</button>
          ) : null}
        </div>
      </div>

      {/* Maniobra de combate abajo-derecha */}
      <div style={overlay({ bottom: 12, right: 12, alignItems: "center" })}>
        <div style={{
          background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)", borderRadius: 10,
          padding: "0.6rem", width: 210,
        }}>
          <div style={{ background: "#1e293b", borderRadius: 3, height: 6, marginBottom: 8 }}>
            <div style={{ width: `${ship.combatCharge * 100}%`, background: ship.combatCharge > 0.34 ? "#4ade80" : "#64748b", height: 6, borderRadius: 3 }} />
          </div>
          <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
            <button disabled={ship.combatCharge < 0.34} onClick={() => send({ t: "helm", cmd: "combat", maneuver: "left" })} style={{ flex: 1 }}>⬅</button>
            <button disabled={ship.combatCharge < 0.34} onClick={() => send({ t: "helm", cmd: "combat", maneuver: "boost" })} style={{ flex: 2 }}>⏫</button>
            <button disabled={ship.combatCharge < 0.34} onClick={() => send({ t: "helm", cmd: "combat", maneuver: "right" })} style={{ flex: 1 }}>➡</button>
          </div>
          <p className="muted" style={{ textAlign: "center", margin: "0.4rem 0 0", fontSize: "0.8rem" }}>Maniobra de combate</p>
        </div>
      </div>
    </div>
  );
}

function JumpCompact({ snap, send }: { snap: GameSnap; send: (m: object) => void }) {
  const [distKm, setDistKm] = useState(10);
  const j = snap.ship.jump;
  if (!j) {
    return (
      <div style={{ background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.4rem", width: 190 }}>
        <div className="row" style={{ gap: 6 }}>
          <input type="range" min={5} max={50} value={distKm} onChange={(e) => setDistKm(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ fontSize: "0.8rem", minWidth: 34 }}>{distKm}U</span>
        </div>
        <button style={{ width: "100%", marginTop: 4, fontSize: "0.8rem" }} onClick={() => send({ t: "helm", cmd: "chargeJump", distance: distKm * 1000 })}>
          Cargar salto
        </button>
      </div>
    );
  }
  if (j.charge < 1 && j.cooldown <= 0) {
    return (
      <button style={{ width: 190, fontSize: "0.8rem" }} onClick={() => send({ t: "helm", cmd: "abortJump" })}>
        Cargando {Math.round(j.charge * 100)}% ✕
      </button>
    );
  }
  if (j.charge >= 1) {
    return (
      <button style={{ width: 190, background: "#7c3aed", borderColor: "#a78bfa" }} onClick={() => send({ t: "helm", cmd: "executeJump" })}>
        ⚡ SALTAR {Math.round(j.distance / 1000)}U
      </button>
    );
  }
  return <span className="muted" style={{ fontSize: "0.78rem" }}>Salto: recalibrando {Math.ceil(j.cooldown)} s</span>;
}

/* ————— WEAPONS ————— */

const thz = (f: number) => 400 + f * 20;

export function WeaponsEE({ snap, send, events }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[] }) {
  const { ship } = snap;
  const [beamFreq, setBeamFreq] = useState(ship.beamFrequency);
  const [shieldFreq, setShieldFreq] = useState(ship.shieldFrequency);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(600);
  const target = snap.entities.find((e) => e.id === ship.targetId);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.max(360, Math.min(el.clientWidth - 12, el.clientHeight - 12))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", height: "min(78vh, 860px)", width: "100%", overflow: "hidden", borderRadius: 8, background: "radial-gradient(ellipse at center, #0b1120 0%, #060a14 75%)" }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Radar
          snap={snap}
          range={5000}
          size={size}
          events={events}
          ringLabels
          showBeamArc
          targetId={ship.targetId}
          onSelectEntity={(id) => send({ t: "weapons", cmd: "setTarget", id })}
        />
      </div>

      <div style={overlay({ top: 12, right: 12, flexDirection: "row", alignItems: "center" })}>
        <button
          style={{
            borderRadius: 20, padding: "0.35rem 1rem",
            background: ship.targetId != null ? "#e2e8f0" : "rgba(10,16,30,0.85)",
            color: ship.targetId != null ? "#0f172a" : undefined,
          }}
          onClick={() => send({ t: "weapons", cmd: "setTarget", id: null })}
          title="Blanco fijado: pulsa para soltar"
        >
          ⊕ {ship.targetId != null ? "Fijado" : "Sin blanco"}
        </button>
        <StationBadge icon="🎯" name="Armamento" />
      </div>

      <div style={overlay({ top: 12, left: 12 })}>
        <InfoRow icon="⚡" label="Energía" value={String(Math.round(ship.energy))} />
        <InfoRow icon="🛡" label="Proa" value={`${Math.round((ship.shieldFront / ship.shieldMax) * 100)}%`} color={ship.shieldFront < 60 ? "#f87171" : undefined} />
        <InfoRow icon="🛡" label="Popa" value={`${Math.round((ship.shieldRear / ship.shieldMax) * 100)}%`} color={ship.shieldRear < 60 ? "#f87171" : undefined} />
      </div>

      {/* Munición y tubos abajo-izquierda */}
      <div style={overlay({ bottom: 12, left: 12 })}>
        {MISSILE_TYPES.map((m) => (
          <InfoRow key={m} icon="🚀" label={MISSILE_LABELS[m]} value={`[${ship.ammo[m]}]`} />
        ))}
        <div style={{ height: 6 }} />
        {ship.tubes.map((tube, i) => (
          <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
            {tube.state === "empty" && MISSILE_TYPES.map((m) => (
              <button
                key={m}
                disabled={ship.ammo[m] <= 0}
                style={{ fontSize: "0.72rem", padding: "0.15rem 0.4rem", background: "rgba(10,16,30,0.85)" }}
                onClick={() => send({ t: "weapons", cmd: "loadTube", tube: i, missile: m })}
              >
                {MISSILE_LABELS[m]}
              </button>
            ))}
            {tube.state === "loading" && (
              <span className="muted" style={{ fontSize: "0.8rem" }}>Cargando {tube.missile && MISSILE_LABELS[tube.missile]} {Math.round(tube.progress * 100)}%</span>
            )}
            {tube.state === "loaded" && (
              <>
                <button
                  style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem", borderColor: "#f87171", background: "#7f1d1d" }}
                  disabled={!target}
                  onClick={() => send({ t: "weapons", cmd: "fireTube", tube: i })}
                >
                  ¡{tube.missile && MISSILE_LABELS[tube.missile]}!
                </button>
                <button style={{ fontSize: "0.72rem", padding: "0.15rem 0.35rem" }} onClick={() => send({ t: "weapons", cmd: "unloadTube", tube: i })}>⏏</button>
              </>
            )}
            <span className="muted" style={{ fontSize: "0.8rem" }}>Tubo {i + 1}: {tube.state === "empty" ? "vacío" : tube.state === "loading" ? "…" : "listo"}</span>
          </div>
        ))}
      </div>

      {/* Beam info abajo-derecha */}
      <div style={overlay({ bottom: 12, right: 12 })}>
        <div style={{ background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)", borderRadius: 10, padding: "0.6rem", width: 280, fontSize: "0.85rem" }}>
          <p style={{ textAlign: "center", margin: "0 0 0.4rem", letterSpacing: "0.05em" }}>Info de rayos</p>
          {target ? (
            <p style={{ margin: "0 0 0.4rem", textAlign: "center", color: "#facc15" }}>
              {target.callSign ?? "??"} {target.scanned && target.shieldFreq != null && <span className="muted">· escudo {thz(target.shieldFreq)} THz</span>}
            </p>
          ) : (
            <p className="muted" style={{ margin: "0 0 0.4rem", textAlign: "center" }}>Sin blanco</p>
          )}
          {ship.beamCalibration !== null ? (
            <p style={{ color: "#facc15", textAlign: "center" }}>Calibrando rayos… {Math.round((ship.beamCalibration ?? 0) * 100)}%</p>
          ) : (
            <div className="row" style={{ gap: 4, justifyContent: "center" }}>
              <button onClick={() => setBeamFreq(Math.max(0, beamFreq - 1))}>◀</button>
              <span style={{ minWidth: 78, textAlign: "center" }}>{thz(beamFreq)} THz</span>
              <button onClick={() => setBeamFreq(Math.min(20, beamFreq + 1))}>▶</button>
              <button style={{ fontSize: "0.78rem" }} onClick={() => send({ t: "weapons", cmd: "calibrateBeams", frequency: beamFreq })}>Calibrar</button>
            </div>
          )}
          <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "0.5rem 0" }} />
          <button
            style={{ width: "100%", background: ship.shieldsUp ? "#0e7490" : "rgba(10,16,30,0.85)" }}
            onClick={() => send({ t: "weapons", cmd: "shields", up: !ship.shieldsUp })}
          >
            {thz(ship.shieldFrequency)} THz · Escudos: {ship.shieldsUp ? "ON" : "OFF"}
          </button>
          {ship.shieldCalibration !== null ? (
            <p style={{ color: "#facc15", textAlign: "center", margin: "0.4rem 0 0" }}>Calibrando escudos… {Math.round((ship.shieldCalibration ?? 0) * 100)}% (¡caídos!)</p>
          ) : (
            <div className="row" style={{ gap: 4, justifyContent: "center", marginTop: 6 }}>
              <button onClick={() => setShieldFreq(Math.max(0, shieldFreq - 1))}>◀</button>
              <span style={{ minWidth: 78, textAlign: "center" }}>{thz(shieldFreq)} THz</span>
              <button onClick={() => setShieldFreq(Math.min(20, shieldFreq + 1))}>▶</button>
              <button style={{ fontSize: "0.78rem" }} title="Escudos caídos 20 s" onClick={() => send({ t: "weapons", cmd: "calibrateShields", frequency: shieldFreq })}>Calibrar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
