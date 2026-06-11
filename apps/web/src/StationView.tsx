import { useState } from "react";
import { Viewport3D } from "./Viewport3D.js";
import { ScanWave } from "./ScanWave.js";
import type { TimedEvent } from "./Radar.js";
import type { GameSnap, MissileType, ShipSystem, Station } from "@bridge/shared";
import { MISSILE_LABELS, MISSILE_TYPES, SHIP_SYSTEMS, STATION_LABELS, SYSTEM_LABELS } from "@bridge/shared";
import { Radar } from "./Radar.js";

export interface CommsChannel {
  callSign: string;
  text: string;
  options: string[];
}

export interface HackState {
  targetCallSign: string;
  system: string;
  rows: number;
  cols: number;
  cells: { x: number; y: number; v: number }[];
  safeLeft: number;
  status: "playing" | "success" | "failed";
}

interface Props {
  station: Station | null;
  snap: GameSnap | null;
  send: (msg: object) => void;
  events: TimedEvent[];
  channel: CommsChannel | null;
  hack: HackState | null;
}

export function StationView({ station, snap, send, events, channel, hack }: Props) {
  if (!snap) return <p className="muted">Esperando datos de la nave…</p>;
  switch (station) {
    case "comms":
      return <CommsView snap={snap} send={send} events={events} channel={channel} hack={hack} />;
    case "helm":
      return <HelmView snap={snap} send={send} events={events} />;
    case "weapons":
      return <WeaponsView snap={snap} send={send} events={events} />;
    case "engineering":
      return <EngineeringView snap={snap} send={send} />;
    case "science":
      return <ScienceView snap={snap} send={send} events={events} />;
    case "captain":
      return <CaptainView snap={snap} events={events} send={send} />;
    default:
      return <GenericView station={station} snap={snap} events={events} />;
  }
}

function WeaponsView({ snap, send, events }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[] }) {
  const { ship } = snap;
  const target = snap.entities.find((e) => e.id === ship.targetId);
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <Radar
        snap={snap}
        range={5000}
        size={420}
        targetId={ship.targetId}
        events={events}
        showBeamArc
        onSelectEntity={(id) => send({ t: "weapons", cmd: "setTarget", id })}
      />
      <div style={{ minWidth: 280, flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Viewport3D snap={snap} height={170} />
        <div className="panel">
          <h3 style={{ marginTop: 0, color: "var(--accent)" }}>Armamento</h3>
          <p className="muted" style={{ marginTop: 0 }}>Pulsa sobre una nave en el radar para fijar blanco</p>

          <div style={{ marginBottom: "0.75rem" }}>
            <b style={{ color: "#facc15" }}>Blanco:</b>{" "}
            {target ? (
              target.scanned ? (
                <>
                  {target.callSign}
                  {target.shieldFreq != null && (
                    <span className="muted" style={{ fontSize: "0.78rem", display: "block" }}>
                      Escudo {target.shieldFreq} THz · Rayos {target.beamFreq} THz
                    </span>
                  )}
                  <Bar label="Casco" frac={target.hullFrac ?? 1} color="#f87171" />
                  <Bar label="Escudo" frac={target.shieldFrac ?? 0} color="#38bdf8" />
                </>
              ) : (
                <span className="muted">contacto sin escanear — pide datos a Ciencia</span>
              )
            ) : (
              <span className="muted">ninguno</span>
            )}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <b>Rayos:</b>{" "}
            {ship.beamCooldown <= 0 ? (
              <span style={{ color: "#4ade80" }}>listos (auto al blanco en arco)</span>
            ) : (
              <span className="muted">recargando {Math.round(ship.beamCooldown * 100)}%</span>
            )}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <b>Tubos de misiles</b>
            <p className="muted" style={{ margin: "0.25rem 0", fontSize: "0.8rem" }}>
              Reservas: {MISSILE_TYPES.map((m) => `${MISSILE_LABELS[m]} ${ship.ammo[m]}`).join(" · ")}
            </p>
            {ship.tubes.map((tube, i) => (
              <div key={i} className="row" style={{ marginTop: "0.35rem", fontSize: "0.9rem" }}>
                <span className="muted">Tubo {i + 1}:</span>
                {tube.state === "empty" &&
                  MISSILE_TYPES.map((m) => (
                    <button
                      key={m}
                      style={{ padding: "0.15rem 0.5rem", fontSize: "0.8rem" }}
                      disabled={ship.ammo[m] <= 0}
                      onClick={() => send({ t: "weapons", cmd: "loadTube", tube: i, missile: m })}
                      title={`Cargar ${MISSILE_LABELS[m]}`}
                    >
                      {MISSILE_LABELS[m]}
                    </button>
                  ))}
                {tube.state === "loading" && (
                  <span className="muted">cargando {tube.missile && MISSILE_LABELS[tube.missile]} {Math.round(tube.progress * 100)}%</span>
                )}
                {tube.state === "loaded" && (
                  <>
                    <button
                      style={{ padding: "0.2rem 0.6rem", borderColor: "#f87171", background: "#7f1d1d" }}
                      onClick={() => send({ t: "weapons", cmd: "fireTube", tube: i })}
                      disabled={!target}
                    >
                      ¡Disparar {tube.missile && MISSILE_LABELS[tube.missile]}!
                    </button>
                    <button
                      style={{ padding: "0.15rem 0.4rem", fontSize: "0.75rem" }}
                      onClick={() => send({ t: "weapons", cmd: "unloadTube", tube: i })}
                      title="Descargar y devolver al almacén"
                    >
                      ⏏
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: "0.75rem" }}>
            <b>Calibración</b>
            <CalibrationRow
              label="Rayos"
              current={ship.beamFrequency}
              progress={ship.beamCalibration}
              hint={target?.shieldFreq != null ? `escudo enemigo: ${target.shieldFreq} THz` : undefined}
              onCalibrate={(f) => send({ t: "weapons", cmd: "calibrateBeams", frequency: f })}
            />
            <CalibrationRow
              label="Escudos"
              current={ship.shieldFrequency}
              progress={ship.shieldCalibration}
              warning="¡escudos caídos 20 s!"
              hint={target?.beamFreq != null ? `rayos enemigos: ${target.beamFreq} THz` : undefined}
              onCalibrate={(f) => send({ t: "weapons", cmd: "calibrateShields", frequency: f })}
            />
          </div>

          <div>
            <b>Escudos:</b>{" "}
            <button
              style={{ padding: "0.2rem 0.6rem" }}
              onClick={() => send({ t: "weapons", cmd: "shields", up: !ship.shieldsUp })}
            >
              {ship.shieldsUp ? "Bajar" : "Subir"}
            </button>
            <Bar label={`Proa ${ship.shieldFront}`} frac={ship.shieldFront / ship.shieldMax} color="#38bdf8" />
            <Bar label={`Popa ${ship.shieldRear}`} frac={ship.shieldRear / ship.shieldMax} color="#38bdf8" />
          </div>
        </div>
      </div>
    </div>
  );
}

function CommsView({ snap, send, events, channel, hack }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[]; channel: CommsChannel | null; hack: HackState | null }) {
  const [mode, setMode] = useState<"select" | "waypoint" | "probe">("select");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const sel = snap.entities.find((e) => e.id === selectedId);

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <div>
        <div className="row" style={{ marginBottom: "0.4rem" }}>
          <button
            style={mode === "select" ? { background: "var(--accent)", color: "#082f49" } : undefined}
            onClick={() => setMode("select")}
          >
            Seleccionar
          </button>
          <button
            style={mode === "waypoint" ? { background: "var(--accent)", color: "#082f49" } : undefined}
            onClick={() => setMode("waypoint")}
          >
            📍 Poner waypoint
          </button>
          <button
            style={mode === "probe" ? { background: "var(--accent)", color: "#082f49" } : undefined}
            onClick={() => setMode("probe")}
          >
            🛰 Lanzar sonda ({snap.ship.probes})
          </button>
        </div>
        <Radar
          snap={snap}
          range={10000}
          size={440}
          events={events}
          targetId={selectedId}
          onSelectEntity={mode === "select" ? (id) => setSelectedId(id) : undefined}
          onClickWorld={
            mode === "waypoint"
              ? (x, y) => send({ t: "comms", cmd: "addWaypoint", x, y })
              : mode === "probe"
                ? (x, y) => send({ t: "comms", cmd: "launchProbe", x, y })
                : undefined
          }
        />
      </div>
      <div style={{ minWidth: 280, flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Viewport3D snap={snap} height={150} />
        <div className="panel">
          <h3 style={{ marginTop: 0, color: "var(--accent)" }}>Comunicaciones</h3>

          {channel ? (
            <div>
              <p style={{ margin: "0.25rem 0" }}>
                📡 Canal con <b style={{ color: "#facc15" }}>{channel.callSign}</b>
              </p>
              <p style={{ fontStyle: "italic", background: "rgba(56,189,248,0.07)", padding: "0.5rem", borderRadius: 6 }}>
                “{channel.text}”
              </p>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {channel.options.map((opt, i) => (
                  <button
                    key={i}
                    style={{ padding: "0.3rem 0.7rem", fontSize: "0.85rem" }}
                    onClick={() =>
                      opt === "Cerrar canal"
                        ? send({ t: "comms", cmd: "closeChannel" })
                        : send({ t: "comms", cmd: "choose", index: i })
                    }
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : hack ? (
            <HackPanel hack={hack} send={send} />
          ) : sel ? (
            sel.scanned || sel.kind === "station" ? (
              <div className="row">
                <button onClick={() => send({ t: "comms", cmd: "hail", id: sel.id })}>
                  📡 Abrir canal con {sel.callSign ?? "estación"}
                </button>
                {sel.kind === "cpu" && (
                  <HackLauncher targetId={sel.id} send={send} />
                )}
              </div>
            ) : (
              <p className="muted">Contacto sin escanear: pide a Ciencia que lo identifique antes de llamar.</p>
            )
          ) : (
            <p className="muted">Selecciona una nave para abrir canal.</p>
          )}

          <div style={{ marginTop: "0.75rem" }}>
            <b>Waypoints</b>{" "}
            <span className="muted" style={{ fontSize: "0.8rem" }}>(visibles en todo el puente)</span>
            {snap.waypoints.length === 0 && <p className="muted" style={{ fontSize: "0.85rem" }}>Ninguno. Usa “📍 Poner waypoint” y pulsa en el radar.</p>}
            {snap.waypoints.map((w, i) => (
              <div key={w.id} className="row" style={{ fontSize: "0.85rem", marginTop: "0.25rem" }}>
                <span style={{ color: "#facc15" }}>W{i + 1}</span>
                <span className="muted">
                  {(Math.hypot(w.x - snap.ship.x, w.y - snap.ship.y) / 1000).toFixed(1)} km
                </span>
                <button style={{ padding: "0 0.5rem", fontSize: "0.75rem" }} onClick={() => send({ t: "comms", cmd: "removeWaypoint", id: w.id })}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function HackLauncher({ targetId, send }: { targetId: number; send: (m: object) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button onClick={() => setOpen(true)}>💻 Hackear</button>;
  }
  return (
    <span className="row" style={{ gap: "0.3rem" }}>
      {([["shields", "Escudos"], ["engines", "Motores"], ["beams", "Rayos"]] as const).map(([sys, label]) => (
        <button
          key={sys}
          style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem" }}
          onClick={() => { send({ t: "comms", cmd: "hackStart", id: targetId, system: sys }); setOpen(false); }}
        >
          {label}
        </button>
      ))}
    </span>
  );
}

function HackPanel({ hack, send }: { hack: HackState; send: (m: object) => void }) {
  const grid = new Map<string, number>();
  for (const c of hack.cells) grid.set(c.x + "," + c.y, c.v);
  const sysLabel = hack.system === "shields" ? "Escudos" : hack.system === "engines" ? "Motores" : "Rayos";
  return (
    <div>
      <p style={{ margin: "0 0 0.4rem" }}>
        💻 Intrusión en <b style={{ color: "#facc15" }}>{hack.targetCallSign}</b> → {sysLabel}
        {hack.status === "playing" && <span className="muted"> · {hack.safeLeft} nodos seguros restantes</span>}
      </p>
      {hack.status === "failed" && <p style={{ color: "#f87171", margin: "0.25rem 0" }}>⚡ Cortafuegos activado: intrusión rechazada.</p>}
      {hack.status === "success" && <p style={{ color: "#4ade80", margin: "0.25rem 0" }}>✓ Sistema comprometido.</p>}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${hack.cols}, 26px)`, gap: 2 }}>
        {Array.from({ length: hack.rows }, (_, y) =>
          Array.from({ length: hack.cols }, (_, x) => {
            const v = grid.get(x + "," + y);
            const revealed = v !== undefined;
            return (
              <button
                key={x + "," + y}
                disabled={revealed || hack.status !== "playing"}
                onClick={() => send({ t: "comms", cmd: "hackReveal", x, y })}
                style={{
                  width: 26, height: 26, padding: 0, fontSize: "0.75rem",
                  background: v === -1 ? "#7f1d1d" : revealed ? "#0d1526" : "#1d2c4d",
                  borderColor: revealed ? "var(--border)" : "var(--accent-dim)",
                  color: v && v > 0 ? ["", "#7dd3fc", "#a3e635", "#facc15", "#fb923c", "#f87171", "#f87171", "#f87171", "#f87171"][v] : undefined,
                }}
              >
                {v === -1 ? "✸" : v && v > 0 ? v : ""}
              </button>
            );
          }),
        )}
      </div>
      <button style={{ marginTop: "0.5rem", fontSize: "0.8rem" }} onClick={() => send({ t: "comms", cmd: "hackCancel" })}>
        {hack.status === "playing" ? "Abortar" : "Cerrar"}
      </button>
    </div>
  );
}

function ScienceView({ snap, send, events }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [range, setRange] = useState(15000);
  const [tune, setTune] = useState<[number, number]>([50, 50]);
  const [showDb, setShowDb] = useState(false);
  const [db, setDb] = useState<Record<string, string | number>[]>([]);
  const { ship } = snap;

  function toggleDb() {
    if (!showDb && db.length === 0) {
      fetch("/api/database").then((r) => r.json()).then(setDb).catch(() => {});
    }
    setShowDb(!showDb);
  }

  function applyTune(i: 0 | 1, v: number) {
    const next: [number, number] = i === 0 ? [v, tune[1]] : [tune[0], v];
    setTune(next);
    send({ t: "science", cmd: "scanTune", a: next[0], b: next[1] });
  }
  const sel = snap.entities.find((e) => e.id === selectedId);
  const scanning = ship.scan;
  const distOf = (e: { x: number; y: number }) => Math.hypot(e.x - ship.x, e.y - ship.y);
  const bearingOf = (e: { x: number; y: number }) =>
    Math.round(((Math.atan2(e.x - ship.x, e.y - ship.y) * 180) / Math.PI + 360) % 360);

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <div>
        <div className="row" style={{ marginBottom: "0.4rem" }}>
          {[15000, 30000].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem", background: range === r ? "var(--accent)" : undefined, color: range === r ? "#082f49" : undefined }}
            >
              {r / 1000} km
            </button>
          ))}
        </div>
        <Radar
          snap={snap}
          range={range}
          size={480}
          events={events}
          targetId={selectedId}
          onSelectEntity={(id) => setSelectedId(id)}
        />
      </div>
      <div style={{ minWidth: 260, flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Viewport3D snap={snap} height={150} />
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, color: "var(--accent)" }}>Ciencia</h3>
            <button style={{ fontSize: "0.78rem", padding: "0.2rem 0.5rem" }} onClick={toggleDb}>
              {showDb ? "← Contactos" : "📚 Base de datos"}
            </button>
          </div>
          {showDb ? (
            <div style={{ fontSize: "0.78rem", overflowX: "auto" }}>
              <table style={{ borderSpacing: "0.5rem 0.25rem" }}>
                <thead>
                  <tr className="muted" style={{ textAlign: "left" }}>
                    <th>Nave</th><th>Clase</th><th>Casco</th><th>Escudos</th><th>Vel.</th><th>Rayos</th><th>Tubos</th><th>Motores</th>
                  </tr>
                </thead>
                <tbody>
                  {db.map((t, i) => (
                    <tr key={i}>
                      <td style={{ color: "#7dd3fc" }}>{t.name}</td><td>{t.shipClass}</td><td>{t.hullMax}</td>
                      <td>{t.shields}</td><td>{t.maxSpeed} m/s</td><td>{t.beam}</td><td>{t.tubes}</td><td>{t.drives}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
          <>
          <p className="muted" style={{ marginTop: 0 }}>Radar de largo alcance. Selecciona un contacto.</p>
          {sel ? (
            <div style={{ fontSize: "0.9rem" }}>
              <p style={{ margin: "0.25rem 0" }}>
                <b style={{ color: "#facc15" }}>{sel.callSign ?? "Contacto desconocido"}</b>{" "}
                {sel.scanned === false && <span className="muted">(sin escanear)</span>}
              </p>
              {sel.typeName && <p className="muted" style={{ margin: "0.25rem 0" }}>{sel.typeName}</p>}
              <p className="muted" style={{ margin: "0.25rem 0" }}>
                Distancia {(distOf(sel) / 1000).toFixed(1)} km · Marcación {bearingOf(sel)}°
              </p>
              {scanning?.targetId === sel.id ? (
                <div>
                  <Bar label={`Análisis ${Math.round(scanning.progress * 100)}%`} frac={scanning.progress} color="#facc15" />
                  <p className="muted" style={{ fontSize: "0.78rem", margin: "0.4rem 0 0.2rem" }}>
                    Estabiliza la forma de onda (frecuencia α y fase β):
                  </p>
                  <ScanWave
                    signalA={ship.scanSignal?.[0] ?? 0}
                    signalB={ship.scanSignal?.[1] ?? 0}
                    tuneA={tune[0]}
                  />
                  {([0, 1] as const).map((i) => (
                    <div key={i} className="row" style={{ gap: "0.5rem" }}>
                      <span className="muted" style={{ minWidth: 14 }}>{i === 0 ? "α" : "β"}</span>
                      <input
                        type="range" min={0} max={100} value={tune[i]}
                        onChange={(e) => applyTune(i, Number(e.target.value))}
                        style={{ flex: 1, accentColor: (ship.scanSignal?.[i] ?? 0) > 0.84 ? "#4ade80" : undefined }}
                      />
                      <span style={{ minWidth: 38, fontSize: "0.78rem", color: (ship.scanSignal?.[i] ?? 0) > 0.84 ? "#4ade80" : "#fb923c" }}>
                        {Math.round((ship.scanSignal?.[i] ?? 0) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : sel.scanned ? (
                <>
                  <p style={{ margin: "0.25rem 0" }}>
                    Facción: <b style={{ color: sel.faction === "hostile" ? "#f87171" : "#a3e635" }}>
                      {sel.faction === "hostile" ? "HOSTIL" : "neutral"}
                    </b>
                  </p>
                  <Bar label={`Casco ${Math.round((sel.hullFrac ?? 0) * 100)}%`} frac={sel.hullFrac ?? 0} color="#f87171" />
                  <Bar label={`Escudos ${Math.round((sel.shieldFrac ?? 0) * 100)}%`} frac={sel.shieldFrac ?? 0} color="#38bdf8" />
                  {sel.scanLevel === 1 && (
                    <div style={{ marginTop: "0.4rem" }}>
                      <p className="muted" style={{ fontSize: "0.78rem", margin: "0 0 0.25rem" }}>
                        Escaneo básico completado. Uno profundo revelará sus frecuencias (sintonía más exigente).
                      </p>
                      <button onClick={() => { setTune([50, 50]); send({ t: "science", cmd: "scan", id: sel.id }); }}>
                        🔬 Escaneo profundo
                      </button>
                    </div>
                  )}
                  {sel.shieldFreq != null && (
                    <p className="muted" style={{ fontSize: "0.78rem", margin: "0.25rem 0" }}>
                      Frecuencias — escudo: <b style={{ color: "#7dd3fc" }}>{sel.shieldFreq} THz</b> · rayos: <b style={{ color: "#7dd3fc" }}>{sel.beamFreq} THz</b>
                      <br />Pásaselas a Armamento para calibrar.
                    </p>
                  )}
                </>
              ) : (
                <button
                  style={{ marginTop: "0.4rem" }}
                  onClick={() => { setTune([50, 50]); send({ t: "science", cmd: "scan", id: sel.id }); }}
                >
                  🛰 Escanear
                </button>
              )}
            </div>
          ) : (
            <p className="muted">Ningún contacto seleccionado.</p>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}

function EngineeringView({ snap, send }: { snap: GameSnap; send: (m: object) => void }) {
  const { ship } = snap;
  const coolantUsed = SHIP_SYSTEMS.reduce((sum, n) => sum + ship.systems[n].coolant, 0);
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <div className="panel" style={{ flex: 2, minWidth: 480 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0, color: "var(--accent)" }}>Ingeniería</h3>
          <span>
            ⚡ <b style={{ color: ship.energy < 200 ? "#f87171" : "#4ade80" }}>{ship.energy}</b>
            <span className="muted">/{ship.energyMax}</span>
            <span className="muted" style={{ marginLeft: "1rem" }}>❄ refrigerante {coolantUsed}/10</span>
          </span>
        </div>
        <table style={{ width: "100%", fontSize: "0.85rem", marginTop: "0.75rem", borderSpacing: "0 0.4rem", borderCollapse: "separate" }}>
          <thead>
            <tr className="muted" style={{ textAlign: "left" }}>
              <th>Sistema</th><th style={{ width: "26%" }}>Potencia</th><th style={{ width: 70 }}></th>
              <th style={{ width: "14%" }}>Refrig.</th><th style={{ width: "15%" }}>Calor</th>
              <th style={{ width: "15%" }}>Estado</th><th></th>
            </tr>
          </thead>
          <tbody>
            {SHIP_SYSTEMS.map((name) => {
              const sys = ship.systems[name];
              const hot = sys.heat > 0.7;
              return (
                <tr key={name}>
                  <td style={{ color: sys.health < 0.5 ? "#f87171" : undefined }}>{SYSTEM_LABELS[name]}</td>
                  <td>
                    <input
                      type="range" min={0} max={300} step={10}
                      value={Math.round(sys.power * 100)}
                      onChange={(e) => send({ t: "engineering", cmd: "setPower", system: name, value: Number(e.target.value) / 100 })}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ color: sys.power > 1 ? "#facc15" : undefined }}>{Math.round(sys.power * 100)}%</td>
                  <td>
                    <div className="row" style={{ gap: "0.25rem" }}>
                      <button style={{ padding: "0 0.4rem" }} onClick={() => send({ t: "engineering", cmd: "setCoolant", system: name, value: sys.coolant - 1 })}>−</button>
                      <span style={{ minWidth: 16, textAlign: "center" }}>{sys.coolant}</span>
                      <button style={{ padding: "0 0.4rem" }} onClick={() => send({ t: "engineering", cmd: "setCoolant", system: name, value: sys.coolant + 1 })}>+</button>
                    </div>
                  </td>
                  <td><MiniBar frac={sys.heat} color={hot ? "#f87171" : "#fb923c"} blink={sys.heat > 0.9} /></td>
                  <td><MiniBar frac={sys.health} color={sys.health < 0.5 ? "#f87171" : "#4ade80"} /></td>
                  <td>
                    <button
                      style={{
                        padding: "0.1rem 0.45rem", fontSize: "0.75rem",
                        background: ship.repairing === name ? "var(--accent)" : undefined,
                        color: ship.repairing === name ? "#082f49" : undefined,
                      }}
                      onClick={() => send({ t: "engineering", cmd: "repair", system: ship.repairing === name ? null : name })}
                      title="Equipo de reparación"
                    >
                      🔧
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: "0.78rem", marginBottom: 0 }}>
          Potencia &gt;100% acelera el sistema pero genera calor: asigna refrigerante o se dañará.
          El 🔧 pone al equipo de reparación en ese sistema.
        </p>
      </div>
      <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Viewport3D snap={snap} height={150} />
        {ship.selfDestruct?.state === "armed" && (
          <div className="panel" style={{ borderColor: "#f87171" }}>
            <p style={{ color: "#f87171", margin: "0 0 0.4rem" }}>☠ El capitán ha armado la autodestrucción ({Math.ceil(ship.selfDestruct.t)} s)</p>
            <button
              style={{ borderColor: "#f87171", background: "#7f1d1d" }}
              onClick={() => send({ t: "selfDestruct", cmd: "confirm" })}
            >
              CONFIRMAR DETONACIÓN
            </button>
          </div>
        )}
        {ship.selfDestruct?.state === "countdown" && (
          <div className="panel" style={{ borderColor: "#f87171", textAlign: "center" }}>
            <p style={{ color: "#f87171", fontSize: "1.3rem", margin: 0, animation: "pulse 0.4s infinite alternate" }}>
              ☠ {Math.ceil(ship.selfDestruct.t)} ☠
            </p>
          </div>
        )}
        <div className="panel">
          <h4 style={{ margin: "0 0 0.4rem", color: "var(--accent)" }}>Nave</h4>
          <Bar label={`Casco ${Math.round(ship.hull)}/${ship.hullMax}`} frac={ship.hull / ship.hullMax} color="#f87171" />
          <Bar label={`Escudo proa ${ship.shieldFront}`} frac={ship.shieldFront / ship.shieldMax} color="#38bdf8" />
          <Bar label={`Escudo popa ${ship.shieldRear}`} frac={ship.shieldRear / ship.shieldMax} color="#38bdf8" />
        </div>
      </div>
    </div>
  );
}

function MiniBar({ frac, color, blink }: { frac: number; color: string; blink?: boolean }) {
  return (
    <div style={{ background: "#1e293b", borderRadius: 3, height: 10, animation: blink ? "pulse 0.6s infinite alternate" : undefined }}>
      <div style={{ width: `${Math.max(0, Math.min(100, frac * 100))}%`, background: color, height: 10, borderRadius: 3 }} />
    </div>
  );
}

function CalibrationRow({ label, current, progress, hint, warning, onCalibrate }: {
  label: string;
  current: number;
  progress: number | null;
  hint?: string;
  warning?: string;
  onCalibrate: (f: number) => void;
}) {
  const [freq, setFreq] = useState(current);
  return (
    <div style={{ marginTop: "0.35rem", fontSize: "0.85rem" }}>
      <div className="row">
        <span className="muted" style={{ minWidth: 60 }}>{label}: {current} THz</span>
        {progress !== null ? (
          <span style={{ color: "#facc15" }}>calibrando… {Math.round(progress * 100)}%</span>
        ) : (
          <>
            <input type="range" min={0} max={20} value={freq} onChange={(e) => setFreq(Number(e.target.value))} style={{ flex: 1 }} />
            <span style={{ minWidth: 24 }}>{freq}</span>
            <button
              style={{ padding: "0.1rem 0.5rem", fontSize: "0.78rem" }}
              onClick={() => onCalibrate(freq)}
              title={warning}
            >
              Calibrar
            </button>
          </>
        )}
      </div>
      {hint && <span className="muted" style={{ fontSize: "0.75rem" }}>📡 {hint} — clava tu frecuencia para máximo efecto</span>}
    </div>
  );
}

function Bar({ label, frac, color }: { label: string; frac: number; color: string }) {
  return (
    <div style={{ margin: "0.25rem 0" }}>
      <div className="muted" style={{ fontSize: "0.75rem" }}>{label}</div>
      <div style={{ background: "#1e293b", borderRadius: 3, height: 8 }}>
        <div style={{ width: `${Math.max(0, Math.min(100, frac * 100))}%`, background: color, height: 8, borderRadius: 3 }} />
      </div>
    </div>
  );
}

function HelmView({ snap, send, events }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[] }) {
  const [impulse, setImpulse] = useState(0);
  const { ship } = snap;

  function applyImpulse(v: number) {
    setImpulse(v);
    send({ t: "helm", cmd: "setImpulse", value: v / 100 });
  }
  const reverse = ship.impulse < 0;

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <Radar
        snap={snap}
        range={5000}
        size={420}
        events={events}
        onSetHeading={(deg) => send({ t: "helm", cmd: "setHeading", value: deg })}
      />
      <div style={{ minWidth: 260, flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Viewport3D snap={snap} height={170} />
      <div className="panel">
        <h3 style={{ marginTop: 0, color: "var(--accent)" }}>Pilotaje</h3>
        <p className="muted">Pulsa en el radar para fijar rumbo</p>
        <table style={{ width: "100%", fontSize: "0.95rem" }}>
          <tbody>
            <tr><td className="muted">Rumbo</td><td style={{ textAlign: "right" }}>{Math.round(ship.heading)}°</td></tr>
            <tr><td className="muted">Rumbo objetivo</td><td style={{ textAlign: "right", color: "#facc15" }}>{Math.round(ship.targetHeading)}°</td></tr>
            <tr><td className="muted">Velocidad</td><td style={{ textAlign: "right", color: ship.speed < 0 ? "#f87171" : undefined }}>{Math.round(ship.speed)} m/s{ship.speed < 0 ? " (atrás)" : ""}</td></tr>
            <tr><td className="muted">Casco</td><td style={{ textAlign: "right" }}>{Math.round(ship.hull)}/{ship.hullMax}</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: "1rem" }}>
          <label className="muted">Impulso: {impulse}%{impulse < 0 ? " (reversa)" : ""}</label>
          <input
            type="range"
            min={-50}
            max={100}
            value={impulse}
            onChange={(e) => applyImpulse(Number(e.target.value))}
            style={{ width: "100%", accentColor: reverse ? "#f87171" : undefined }}
          />
          <div className="row" style={{ marginTop: "0.5rem" }}>
            {[-50, 0, 25, 50, 100].map((v) => (
              <button key={v} onClick={() => applyImpulse(v)} style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}>
                {v}%
              </button>
            ))}
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <label className="muted">Maniobra de combate ({Math.round(ship.combatCharge * 100)}%)</label>
            <div style={{ background: "#1e293b", borderRadius: 3, height: 6, margin: "0.25rem 0" }}>
              <div style={{ width: `${ship.combatCharge * 100}%`, background: ship.combatCharge > 0.34 ? "#4ade80" : "#64748b", height: 6, borderRadius: 3 }} />
            </div>
            <div className="row">
              <button disabled={ship.combatCharge < 0.34} onClick={() => send({ t: "helm", cmd: "combat", maneuver: "left" })} title="Desplazamiento lateral">⬅</button>
              <button disabled={ship.combatCharge < 0.34} onClick={() => send({ t: "helm", cmd: "combat", maneuver: "boost" })} title="Acelerón">⏫ Boost</button>
              <button disabled={ship.combatCharge < 0.34} onClick={() => send({ t: "helm", cmd: "combat", maneuver: "right" })} title="Desplazamiento lateral">➡</button>
            </div>
          </div>
          {ship.hasWarp && (
            <div style={{ marginTop: "0.75rem" }}>
              <label className="muted">Warp</label>
              <div className="row" style={{ marginTop: "0.25rem" }}>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => send({ t: "helm", cmd: "setWarp", value: lvl })}
                    style={{
                      padding: "0.25rem 0.7rem",
                      fontSize: "0.85rem",
                      background: ship.warp === lvl ? "#7c3aed" : undefined,
                      borderColor: ship.warp > 0 ? "#a78bfa" : undefined,
                    }}
                  >
                    {lvl === 0 ? "OFF" : "W" + lvl}
                  </button>
                ))}
              </div>
              {ship.warp > 0 && (
                <p className="muted" style={{ fontSize: "0.78rem", margin: "0.3rem 0 0", color: "#a78bfa" }}>
                  Warp {ship.warp}: drenando energía ({Math.round(ship.energy)} ⚡). Giro reducido.
                </p>
              )}
            </div>
          )}
          {ship.hasJump && <JumpPanel snap={snap} send={send} />}
          <div style={{ marginTop: "0.75rem" }}>
            {ship.docked ? (
              <button
                style={{ borderColor: "#4ade80", background: "#14532d" }}
                onClick={() => send({ t: "helm", cmd: "undock" })}
              >
                🚀 Despegar
              </button>
            ) : ship.canDock ? (
              <button
                style={{ borderColor: "#4ade80" }}
                onClick={() => { applyImpulse(0); send({ t: "helm", cmd: "dock" }); }}
              >
                🛰 Atracar
              </button>
            ) : (
              <span className="muted" style={{ fontSize: "0.8rem" }}>
                Para atracar: &lt;1 km de una estación y &lt;40 m/s
              </span>
            )}
            {ship.docked && <p className="muted" style={{ fontSize: "0.8rem", margin: "0.3rem 0 0" }}>Atracada: reparando casco y sistemas, recargando energía…</p>}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function CaptainView({ snap, events, send }: { snap: GameSnap; events: TimedEvent[]; send: (m: object) => void }) {
  const [view, setView] = useState<"3d" | "tactical">("3d");
  const [range, setRange] = useState(12000);
  const { ship } = snap;
  return (
    <div>
      <div className="row" style={{ justifyContent: "center", marginBottom: "0.5rem" }}>
        <button
          onClick={() => setView("3d")}
          style={view === "3d" ? { background: "var(--accent)", color: "#082f49" } : undefined}
        >
          Vista exterior
        </button>
        <button
          onClick={() => setView("tactical")}
          style={view === "tactical" ? { background: "var(--accent)", color: "#082f49" } : undefined}
        >
          Táctico
        </button>
      </div>
      {view === "3d" ? (
        <Viewport3D snap={snap} height={460} collapsible={false} />
      ) : (
        <div>
          <div className="row" style={{ justifyContent: "center", marginBottom: "0.4rem" }}>
            {[5000, 12000, 24000].map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{ fontSize: "0.8rem", padding: "0.2rem 0.6rem", background: range === r ? "var(--accent)" : undefined, color: range === r ? "#082f49" : undefined }}
              >
                {r / 1000} km
              </button>
            ))}
          </div>
          <div className="row" style={{ justifyContent: "center" }}>
            <Radar snap={snap} range={range} size={560} events={events} />
          </div>
        </div>
      )}
      <div className="row" style={{ justifyContent: "center", gap: "2rem", marginTop: "0.5rem" }}>
        <span className="muted">Rumbo {Math.round(ship.heading)}°</span>
        <span className="muted">{Math.round(ship.speed)} m/s</span>
        <span className="muted">Casco {Math.round(ship.hull)}/{ship.hullMax}</span>
        {!ship.selfDestruct ? (
          <button
            style={{ borderColor: "#f87171", color: "#f87171", background: "transparent", fontSize: "0.8rem" }}
            onClick={() => send({ t: "selfDestruct", cmd: "arm" })}
          >
            ☠ Autodestrucción
          </button>
        ) : (
          <button
            style={{ borderColor: "#4ade80", fontSize: "0.8rem" }}
            onClick={() => send({ t: "selfDestruct", cmd: "cancel" })}
          >
            Cancelar autodestrucción
          </button>
        )}
      </div>
      <SelfDestructBanner sd={ship.selfDestruct} />
    </div>
  );
}

function SelfDestructBanner({ sd }: { sd: GameSnap["ship"]["selfDestruct"] }) {
  if (!sd) return null;
  return (
    <p style={{
      textAlign: "center", color: "#f87171", fontSize: sd.state === "countdown" ? "1.4rem" : "1rem",
      animation: "pulse 0.5s infinite alternate", margin: "0.5rem 0 0",
    }}>
      {sd.state === "armed"
        ? `☠ AUTODESTRUCCIÓN ARMADA — Ingeniería debe confirmar (${Math.ceil(sd.t)} s)`
        : `☠☠ DETONACIÓN EN ${Math.ceil(sd.t)} ☠☠`}
    </p>
  );
}

function GenericView({ station, snap, events }: { station: Station | null; snap: GameSnap; events: TimedEvent[] }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <Radar snap={snap} range={8000} size={320} events={events} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <Viewport3D snap={snap} height={170} />
      <div className="panel">
        <h3 style={{ marginTop: 0, color: "var(--accent)" }}>
          {station ? STATION_LABELS[station] : "Sin puesto"}
        </h3>
        <p className="muted">
          {station
            ? "Esta consola se activará en la próxima fase. De momento tienes el radar de situación."
            : "Elige un puesto libre para operar una consola."}
        </p>
      </div>
      </div>
    </div>
  );
}


function JumpPanel({ snap, send }: { snap: GameSnap; send: (m: object) => void }) {
  const [distKm, setDistKm] = useState(10);
  const { ship } = snap;
  const j = ship.jump;
  const charging = j && j.charge < 1 && j.cooldown <= 0;
  const ready = j && j.charge >= 1;
  const cooling = j && j.cooldown > 0 && j.charge === 0;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <label className="muted">Salto (jump drive)</label>
      {!j && (
        <div className="row" style={{ marginTop: "0.25rem" }}>
          <input
            type="range" min={5} max={50} value={distKm}
            onChange={(e) => setDistKm(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ minWidth: 50 }}>{distKm} km</span>
          <button onClick={() => send({ t: "helm", cmd: "chargeJump", distance: distKm * 1000 })}>
            Cargar salto
          </button>
        </div>
      )}
      {charging && (
        <div className="row" style={{ marginTop: "0.25rem" }}>
          <span style={{ color: "#a78bfa" }}>Cargando {Math.round(j.charge * 100)}% ({Math.round(j.distance / 1000)} km)</span>
          <button onClick={() => send({ t: "helm", cmd: "abortJump" })} style={{ fontSize: "0.8rem", padding: "0.15rem 0.5rem" }}>
            Abortar
          </button>
        </div>
      )}
      {ready && (
        <button
          style={{ marginTop: "0.25rem", background: "#7c3aed", borderColor: "#a78bfa", fontSize: "1rem" }}
          onClick={() => send({ t: "helm", cmd: "executeJump" })}
        >
          ⚡ SALTAR {Math.round(j.distance / 1000)} km (rumbo {Math.round(ship.heading)}°)
        </button>
      )}
      {cooling && <span className="muted">Recalibrando salto… {Math.round(j.cooldown)} s</span>}
    </div>
  );
}
