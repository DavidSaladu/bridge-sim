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

/* ————— SCIENCE ————— */

import type { CommsChannel, HackState } from "./StationView.js";
import { ScanWave } from "./ScanWave.js";
import { distU, sectorName } from "./units.js";
import { SHIP_SYSTEMS, SYSTEM_LABELS, type ShipSystem } from "@bridge/shared";

function eeField(label: string, value: string) {
  return (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border)", padding: "0.25rem 0.4rem", fontSize: "0.88rem" }}>
      <span className="muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function ScienceEE({ snap, send, events }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[] }) {
  const { ship } = snap;
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<"radar" | "database" | number>("radar"); // number = id de sonda
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [tune, setTune] = useState<[number, number]>([50, 50]);
  const [db, setDb] = useState<Record<string, string | number>[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(600);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.max(360, Math.min(el.clientWidth - 12, el.clientHeight - 12))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sel = snap.entities.find((e) => e.id === selectedId);
  const scanning = ship.scan;
  const probes = snap.entities.filter((e) => e.kind === "probe");
  const probeCenter = typeof view === "number" ? snap.entities.find((e) => e.id === view) : undefined;
  const range = probeCenter ? 5000 : 30000 / zoom;
  const distOf = (e: { x: number; y: number }) => Math.hypot(e.x - ship.x, e.y - ship.y);
  const bearingOf = (e: { x: number; y: number }) =>
    Math.round(((Math.atan2(e.x - ship.x, e.y - ship.y) * 180) / Math.PI + 360) % 360);

  function applyTune(i: 0 | 1, v: number) {
    const next: [number, number] = i === 0 ? [v, tune[1]] : [tune[0], v];
    setTune(next);
    send({ t: "science", cmd: "scanTune", a: next[0], b: next[1] });
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", height: "min(78vh, 860px)", width: "100%", overflow: "hidden", borderRadius: 8, background: "radial-gradient(ellipse at center, #0b1120 0%, #060a14 75%)" }}>
      {view === "database" ? (
        <div style={{ position: "absolute", inset: 12, overflow: "auto", fontSize: "0.85rem" }}>
          <table style={{ borderSpacing: "0.6rem 0.3rem" }}>
            <thead><tr className="muted" style={{ textAlign: "left" }}><th>Nave</th><th>Clase</th><th>Casco</th><th>Escudos</th><th>Vel.</th><th>Rayos</th><th>Tubos</th><th>Motores</th></tr></thead>
            <tbody>{db.map((t, i) => (
              <tr key={i}><td style={{ color: "#7dd3fc" }}>{t.name}</td><td>{t.shipClass}</td><td>{t.hullMax}</td><td>{t.shields}</td><td>{t.maxSpeed} m/s</td><td>{t.beam}</td><td>{t.tubes}</td><td>{t.drives}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Radar
            snap={snap}
            range={range}
            size={size}
            events={events}
            edgeSignals={!probeCenter}
            ringLabels
            targetId={selectedId}
            center={probeCenter ? { x: probeCenter.x, y: probeCenter.y } : undefined}
            onSelectEntity={(id) => setSelectedId(id)}
          />
        </div>
      )}

      <div style={overlay({ top: 12, right: 12, flexDirection: "row", alignItems: "center" })}>
        <StationBadge icon="🔬" name="Ciencia" />
      </div>

      {/* Panel derecho: escaneo + telemetría */}
      <div style={overlay({ top: 64, right: 12, width: 280 })}>
        {sel && sel.kind === "cpu" && (sel.scanLevel ?? 0) < 2 && scanning?.targetId !== sel.id && (
          <button onClick={() => { setTune([50, 50]); send({ t: "science", cmd: "scan", id: sel.id }); }}>
            {sel.scanLevel === 1 ? "🔬 Escaneo profundo" : "🛰 Escanear"}
          </button>
        )}
        {scanning && sel && scanning.targetId === sel.id && (
          <div style={{ background: "rgba(10,16,30,0.9)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem" }}>
            <ScanWave signalA={ship.scanSignal?.[0] ?? 0} signalB={ship.scanSignal?.[1] ?? 0} tuneA={tune[0]} />
            {([0, 1] as const).map((i) => (
              <input key={i} type="range" min={0} max={100} value={tune[i]}
                onChange={(e) => applyTune(i, Number(e.target.value))}
                style={{ width: "100%", accentColor: (ship.scanSignal?.[i] ?? 0) > 0.84 ? "#4ade80" : undefined }} />
            ))}
            <div style={{ background: "#1e293b", borderRadius: 3, height: 5 }}>
              <div style={{ width: `${scanning.progress * 100}%`, background: "#facc15", height: 5, borderRadius: 3 }} />
            </div>
          </div>
        )}
        <div style={{ background: "rgba(10,16,30,0.9)", border: "1px solid var(--border)", borderRadius: 8 }}>
          {eeField("Identificador", sel?.callSign ?? "–")}
          {eeField("Distancia", sel ? distU(distOf(sel)) : "–")}
          {eeField("Marcación", sel ? `${bearingOf(sel)}°` : "–")}
          {eeField("Sector", sel ? sectorName(sel.x, sel.y) : "–")}
          {eeField("Facción", sel?.faction === "hostile" ? "HOSTIL" : sel?.faction === "neutral" ? "Neutral" : sel?.faction === "friendly" ? "Aliada" : "–")}
          {eeField("Clase", sel?.typeName ?? "–")}
          {eeField("Escudos", sel?.shieldFrac != null ? `${Math.round(sel.shieldFrac * 100)}%` : "–")}
          {eeField("Casco", sel?.hullFrac != null ? `${Math.round(sel.hullFrac * 100)}%` : "–")}
          {eeField("Frecuencias", sel?.shieldFreq != null ? `E ${400 + sel.shieldFreq * 20} / R ${400 + (sel.beamFreq ?? 0) * 20} THz` : "–")}
        </div>
      </div>

      {/* Vistas abajo-izquierda */}
      <div style={overlay({ bottom: 12, left: 12 })}>
        {probes.map((pr, i) => (
          <button key={pr.id}
            style={{ borderRadius: 20, background: view === pr.id ? "#0e7490" : "rgba(10,16,30,0.85)", borderColor: "#22d3ee" }}
            onClick={() => setView(view === pr.id ? "radar" : pr.id)}>
            🛰 Vista sonda {i + 1}
          </button>
        ))}
        <button style={{ borderRadius: 20, background: view === "radar" ? "#e2e8f0" : "rgba(10,16,30,0.85)", color: view === "radar" ? "#0f172a" : undefined }} onClick={() => setView("radar")}>
          Radar
        </button>
        <button
          style={{ borderRadius: 20, background: view === "database" ? "#e2e8f0" : "rgba(10,16,30,0.85)", color: view === "database" ? "#0f172a" : undefined }}
          onClick={() => { if (db.length === 0) fetch("/api/database").then((r) => r.json()).then(setDb).catch(() => {}); setView("database"); }}>
          Base de datos
        </button>
      </div>

      {/* Zoom abajo-derecha */}
      <div style={overlay({ bottom: 12, right: 12, flexDirection: "row", alignItems: "center", background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)", borderRadius: 20, padding: "0.3rem 0.8rem" })}>
        <input type="range" min={1} max={6} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 140 }} />
        <span style={{ fontSize: "0.85rem", minWidth: 76 }}>Zoom: {zoom.toFixed(1)}x</span>
      </div>
    </div>
  );
}

/* ————— RELAY ————— */

export function RelayEE({ snap, send, events, channel, hack }: {
  snap: GameSnap; send: (m: object) => void; events: TimedEvent[];
  channel: CommsChannel | null; hack: HackState | null;
}) {
  const { ship } = snap;
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<"select" | "waypoint" | "deleteWp" | "probe">("select");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(600);
  const sel = snap.entities.find((e) => e.id === selectedId);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize(Math.max(360, Math.min(el.clientWidth - 8, el.clientHeight - 8))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const range = 60000 / zoom;

  function clickWorld(x: number, y: number) {
    if (mode === "waypoint") send({ t: "comms", cmd: "addWaypoint", x, y });
    if (mode === "probe") send({ t: "comms", cmd: "launchProbe", x, y });
    if (mode === "deleteWp") {
      let best: { id: number; d: number } | null = null;
      for (const w of snap.waypoints) {
        const d = Math.hypot(w.x - x, w.y - y);
        if (d < range / 12 && (!best || d < best.d)) best = { id: w.id, d };
      }
      if (best) send({ t: "comms", cmd: "removeWaypoint", id: best.id });
    }
  }

  const alertColors = { normal: undefined, yellow: "#facc15", red: "#f87171" } as const;
  const nextAlert = { normal: "yellow", yellow: "red", red: "normal" } as const;

  return (
    <div ref={wrapRef} style={{
      position: "relative", height: "min(78vh, 860px)", width: "100%", overflow: "hidden", borderRadius: 8,
      background: "#05070d",
      boxShadow: ship.alert !== "normal" ? `inset 0 0 60px ${alertColors[ship.alert]}44` : undefined,
    }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Radar
          snap={snap}
          range={range}
          size={size}
          events={events}
          rect
          sectorGrid
          coverage
          targetId={selectedId}
          onSelectEntity={mode === "select" ? (id) => setSelectedId(id) : undefined}
          onClickWorld={mode !== "select" ? clickWorld : undefined}
        />
      </div>

      <div style={overlay({ top: 12, right: 12, flexDirection: "row", alignItems: "center" })}>
        <StationBadge icon="📡" name="Comunicaciones" />
      </div>

      {/* Pila de acciones izquierda */}
      <div style={overlay({ top: 12, left: 12, width: 230 })}>
        <button disabled={!sel || (!sel.scanned && sel.kind !== "station")} style={{ borderRadius: 20 }}
          onClick={() => sel && send({ t: "comms", cmd: "hail", id: sel.id })}>
          Abrir canal
        </button>
        <HackLaunchEE sel={sel} send={send} />
        <button style={{ borderRadius: 20, background: mode === "waypoint" ? "#e2e8f0" : undefined, color: mode === "waypoint" ? "#0f172a" : undefined }}
          onClick={() => setMode(mode === "waypoint" ? "select" : "waypoint")}>
          Poner waypoint
        </button>
        <button style={{ borderRadius: 20, background: mode === "deleteWp" ? "#e2e8f0" : undefined, color: mode === "deleteWp" ? "#0f172a" : undefined }}
          onClick={() => setMode(mode === "deleteWp" ? "select" : "deleteWp")}>
          Borrar waypoint
        </button>
        <button style={{ borderRadius: 20, background: mode === "probe" ? "#e2e8f0" : undefined, color: mode === "probe" ? "#0f172a" : undefined }}
          onClick={() => setMode(mode === "probe" ? "select" : "probe")}>
          Lanzar sonda ({ship.probes})
        </button>
        <div style={{ height: 6 }} />
        <InfoRow icon="🕐" label="Reloj" value={new Date(snap.time * 1000).toISOString().slice(11, 19)} />
        <InfoRow icon="📍" label="Sector" value={sectorName(ship.x, ship.y)} />
      </div>

      {/* Canal / hacking como panel flotante derecho */}
      {(channel || hack) && (
        <div style={overlay({ top: 64, right: 12, width: 320 })}>
          <div style={{ background: "rgba(10,16,30,0.95)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.6rem" }}>
            {channel && (
              <div>
                <p style={{ margin: "0 0 0.4rem" }}>📡 <b style={{ color: "#facc15" }}>{channel.callSign}</b></p>
                <p style={{ fontStyle: "italic", fontSize: "0.9rem" }}>“{channel.text}”</p>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {channel.options.map((opt, i) => (
                    <button key={i} style={{ fontSize: "0.82rem", padding: "0.25rem 0.6rem" }}
                      onClick={() => opt === "Cerrar canal" ? send({ t: "comms", cmd: "closeChannel" }) : send({ t: "comms", cmd: "choose", index: i })}>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hack && <HackGridEE hack={hack} send={send} />}
          </div>
        </div>
      )}

      {/* Telemetría selección derecha */}
      {!channel && !hack && sel && (
        <div style={overlay({ top: 64, right: 12, width: 240 })}>
          <div style={{ background: "rgba(10,16,30,0.9)", border: "1px solid var(--border)", borderRadius: 8 }}>
            {eeField("Identificador", sel.callSign ?? "–")}
            {eeField("Facción", sel.faction === "hostile" ? "HOSTIL" : sel.faction ?? "–")}
            {eeField("Sector", sectorName(sel.x, sel.y))}
          </div>
        </div>
      )}

      {/* Zoom + alerta abajo */}
      <div style={overlay({ bottom: 12, left: 12, flexDirection: "row", alignItems: "center", background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)", borderRadius: 20, padding: "0.3rem 0.8rem" })}>
        <input type="range" min={1} max={8} step={0.5} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 140 }} />
        <span style={{ fontSize: "0.85rem" }}>Zoom: {zoom.toFixed(1)}x</span>
      </div>
      <div style={overlay({ bottom: 12, right: 12 })}>
        <button
          style={{ borderRadius: 20, borderColor: alertColors[ship.alert], color: alertColors[ship.alert] }}
          onClick={() => send({ t: "comms", cmd: "setAlert", level: nextAlert[ship.alert] })}
        >
          🚨 Alerta: {ship.alert === "normal" ? "normal" : ship.alert === "yellow" ? "AMARILLA" : "ROJA"}
        </button>
      </div>
    </div>
  );
}

function HackLaunchEE({ sel, send }: { sel: GameSnap["entities"][number] | undefined; send: (m: object) => void }) {
  const [open, setOpen] = useState(false);
  const canHack = sel && sel.kind === "cpu" && sel.scanned;
  if (!open) {
    return <button disabled={!canHack} style={{ borderRadius: 20 }} onClick={() => setOpen(true)}>Hackear</button>;
  }
  return (
    <div className="row" style={{ gap: 4 }}>
      {([["shields", "Escudos"], ["engines", "Motores"], ["beams", "Rayos"]] as const).map(([sys, label]) => (
        <button key={sys} style={{ fontSize: "0.75rem", padding: "0.2rem 0.4rem" }}
          onClick={() => { sel && send({ t: "comms", cmd: "hackStart", id: sel.id, system: sys }); setOpen(false); }}>
          {label}
        </button>
      ))}
    </div>
  );
}

function HackGridEE({ hack, send }: { hack: HackState; send: (m: object) => void }) {
  const grid = new Map<string, number>();
  for (const c of hack.cells) grid.set(c.x + "," + c.y, c.v);
  return (
    <div>
      <p style={{ margin: "0.3rem 0" }}>
        💻 {hack.targetCallSign} · {hack.status === "playing" ? `${hack.safeLeft} nodos` : hack.status === "success" ? "✓ comprometido" : "✗ rechazado"}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${hack.cols}, 24px)`, gap: 2 }}>
        {Array.from({ length: hack.rows }, (_, y) =>
          Array.from({ length: hack.cols }, (_, x) => {
            const v = grid.get(x + "," + y);
            const revealed = v !== undefined;
            return (
              <button key={x + "," + y} disabled={revealed || hack.status !== "playing"}
                onClick={() => send({ t: "comms", cmd: "hackReveal", x, y })}
                style={{ width: 24, height: 24, padding: 0, fontSize: "0.7rem", background: v === -1 ? "#7f1d1d" : revealed ? "#0d1526" : "#1d2c4d" }}>
                {v === -1 ? "✸" : v && v > 0 ? v : ""}
              </button>
            );
          }),
        )}
      </div>
      <button style={{ marginTop: 6, fontSize: "0.78rem" }} onClick={() => send({ t: "comms", cmd: "hackCancel" })}>
        {hack.status === "playing" ? "Abortar" : "Cerrar"}
      </button>
    </div>
  );
}

/* ————— ENGINEERING ————— */

const SYS_ICONS: Record<ShipSystem, string> = {
  reactor: "☢", beams: "✦", missiles: "🚀", maneuver: "🎡",
  impulse: "➤", warp: "〰", jump: "⤳", shields: "🛡",
};

function MiniBarEE({ frac, color }: { frac: number; color: string }) {
  return (
    <div style={{ background: "#131c2e", border: "1px solid var(--border)", height: 16, position: "relative", flex: 1 }}>
      <div style={{ width: `${Math.max(0, Math.min(100, frac * 100))}%`, background: color, height: "100%" }} />
    </div>
  );
}

export function EngineeringEE({ snap, send }: { snap: GameSnap; send: (m: object) => void }) {
  const { ship } = snap;
  const [selected, setSelected] = useState<ShipSystem>("reactor");
  const sys = ship.systems[selected];
  const coolantUsed = SHIP_SYSTEMS.reduce((sum, n) => sum + ship.systems[n].coolant, 0);

  return (
    <div style={{ position: "relative", height: "min(78vh, 860px)", width: "100%", overflow: "auto", borderRadius: 8, background: "#05070d", padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <button
          style={{ borderRadius: 20, borderColor: "#f87171", color: "#f87171", background: "rgba(127,29,29,0.25)" }}
          onClick={() => send({ t: "selfDestruct", cmd: ship.selfDestruct ? "cancel" : "arm" })}
          title="Solo el capitán arma/cancela; Ingeniería confirma"
        >
          ☠ {ship.selfDestruct ? "Autodestrucción ARMADA" : "Autodestrucción"}
        </button>
        <StationBadge icon="🔧" name="Ingeniería" />
      </div>

      {ship.selfDestruct?.state === "armed" && (
        <button
          style={{ margin: "0.5rem 0", borderColor: "#f87171", background: "#7f1d1d", width: "100%" }}
          onClick={() => send({ t: "selfDestruct", cmd: "confirm" })}
        >
          ☠ CONFIRMAR DETONACIÓN ({Math.ceil(ship.selfDestruct.t)} s)
        </button>
      )}
      {ship.selfDestruct?.state === "countdown" && (
        <p style={{ textAlign: "center", color: "#f87171", fontSize: "1.5rem", animation: "pulse 0.4s infinite alternate" }}>
          ☠ DETONACIÓN EN {Math.ceil(ship.selfDestruct.t)} ☠
        </p>
      )}

      <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
        {/* Columna izquierda: info nave */}
        <div style={{ display: "flex", flexDirection: "column", gap: 4, width: 250 }}>
          <InfoRow icon="⚡" label="Energía" value={String(Math.round(ship.energy))} color={ship.energy < 200 ? "#f87171" : undefined} />
          <InfoRow icon="🧱" label="Casco" value={`${Math.round((ship.hull / ship.hullMax) * 100)}%`} color={ship.hull / ship.hullMax < 0.4 ? "#f87171" : undefined} />
          <InfoRow icon="🛡" label="Proa" value={`${Math.round((ship.shieldFront / ship.shieldMax) * 100)}%`} />
          <InfoRow icon="🛡" label="Popa" value={`${Math.round((ship.shieldRear / ship.shieldMax) * 100)}%`} />
          <InfoRow icon="❄" label="Refrigerante" value={`${10 - coolantUsed} libre`} />
          <div style={{ height: 8 }} />
          <div style={{ background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.5rem", fontSize: "0.82rem" }}>
            <p style={{ margin: 0, color: "var(--accent)" }}>{SYSTEM_LABELS[selected]}</p>
            <p className="muted" style={{ margin: "0.25rem 0 0" }}>
              Eficacia {Math.round(sys.power * sys.health * 100)}% · Salud {Math.round(sys.health * 100)}%
              {sys.heat > 0.7 && <span style={{ color: "#f87171" }}> · ¡CALOR {Math.round(sys.heat * 100)}%!</span>}
            </p>
            <button
              style={{ marginTop: 6, fontSize: "0.78rem", background: ship.repairing === selected ? "var(--accent)" : undefined, color: ship.repairing === selected ? "#082f49" : undefined }}
              onClick={() => send({ t: "engineering", cmd: "repair", system: ship.repairing === selected ? null : selected })}
            >
              🔧 Equipo de reparación {ship.repairing === selected ? "aquí" : "→ aquí"}
            </button>
          </div>
        </div>

        {/* Tabla de sistemas */}
        <div style={{ flex: 1 }}>
          <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 1fr 1fr 1fr", gap: "4px 8px", alignItems: "center", fontSize: "0.85rem" }}>
            <span />
            <span className="muted" style={{ textAlign: "center" }}>🔧 salud</span>
            <span className="muted" style={{ textAlign: "center" }}>🌡 calor</span>
            <span className="muted" style={{ textAlign: "center" }}>⚡ potencia</span>
            <span className="muted" style={{ textAlign: "center" }}>❄ refrig.</span>
            {SHIP_SYSTEMS.map((name) => {
              const s2 = ship.systems[name];
              const isSel = name === selected;
              return (
                <FragmentRow key={name}>
                  <button
                    onClick={() => setSelected(name)}
                    style={{
                      textAlign: "left", borderRadius: 18, padding: "0.3rem 0.7rem",
                      background: isSel ? "#e2e8f0" : "rgba(10,16,30,0.85)",
                      color: isSel ? "#0f172a" : undefined,
                      fontWeight: isSel ? 700 : 400,
                    }}
                  >
                    {SYS_ICONS[name]} {SYSTEM_LABELS[name]}
                  </button>
                  <MiniBarEE frac={s2.health} color={s2.health < 0.5 ? "#f87171" : "#4ade80"} />
                  <MiniBarEE frac={s2.heat} color={s2.heat > 0.7 ? "#f87171" : "#fb923c"} />
                  <MiniBarEE frac={s2.power / 3} color="#eab308" />
                  <MiniBarEE frac={s2.coolant / 10} color="#38bdf8" />
                </FragmentRow>
              );
            })}
          </div>
        </div>

        {/* Sliders verticales del sistema seleccionado */}
        <div style={{
          display: "flex", gap: 16, background: "rgba(10,16,30,0.85)", border: "1px solid var(--border)",
          borderRadius: 12, padding: "0.8rem 1rem", alignItems: "center", height: "fit-content",
        }}>
          {[
            { label: `Potencia ${Math.round(sys.power * 100)}%`, min: 0, max: 300, step: 10, value: Math.round(sys.power * 100),
              onChange: (v: number) => send({ t: "engineering", cmd: "setPower", system: selected, value: v / 100 }) },
            { label: `Refrig. ${sys.coolant}/10`, min: 0, max: 10, step: 1, value: sys.coolant,
              onChange: (v: number) => send({ t: "engineering", cmd: "setCoolant", system: selected, value: v }) },
          ].map((cfg, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
              <input
                type="range" min={cfg.min} max={cfg.max} step={cfg.step} value={cfg.value}
                onChange={(e) => cfg.onChange(Number(e.target.value))}
                style={{
                  writingMode: "vertical-lr" as never, direction: "rtl", width: 36, height: 240,
                  WebkitAppearance: "slider-vertical",
                } as React.CSSProperties}
              />
              <span className="muted" style={{ fontSize: "0.75rem", textAlign: "center", width: 80 }}>{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FragmentRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
