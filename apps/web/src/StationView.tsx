import { useState } from "react";
import { Viewport3D } from "./Viewport3D.js";
import type { TimedEvent } from "./Radar.js";
import type { GameSnap, ShipSystem, Station } from "@bridge/shared";
import { SHIP_SYSTEMS, STATION_LABELS, SYSTEM_LABELS } from "@bridge/shared";
import { Radar } from "./Radar.js";

export interface CommsChannel {
  callSign: string;
  text: string;
  options: string[];
}

interface Props {
  station: Station | null;
  snap: GameSnap | null;
  send: (msg: object) => void;
  events: TimedEvent[];
  channel: CommsChannel | null;
}

export function StationView({ station, snap, send, events, channel }: Props) {
  if (!snap) return <p className="muted">Esperando datos de la nave…</p>;
  switch (station) {
    case "comms":
      return <CommsView snap={snap} send={send} events={events} channel={channel} />;
    case "helm":
      return <HelmView snap={snap} send={send} events={events} />;
    case "weapons":
      return <WeaponsView snap={snap} send={send} events={events} />;
    case "engineering":
      return <EngineeringView snap={snap} send={send} />;
    case "science":
      return <ScienceView snap={snap} send={send} events={events} />;
    case "captain":
      return <CaptainView snap={snap} events={events} />;
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
            {ship.tubes.map((tube, i) => (
              <div key={i} className="row" style={{ marginTop: "0.35rem", fontSize: "0.9rem" }}>
                <span className="muted">Tubo {i + 1}:</span>
                {tube.state === "empty" && (
                  <button style={{ padding: "0.2rem 0.6rem" }} onClick={() => send({ t: "weapons", cmd: "loadTube", tube: i })}>
                    Cargar
                  </button>
                )}
                {tube.state === "loading" && <span className="muted">cargando {Math.round(tube.progress * 100)}%</span>}
                {tube.state === "loaded" && (
                  <button
                    style={{ padding: "0.2rem 0.6rem", borderColor: "#f87171", background: "#7f1d1d" }}
                    onClick={() => send({ t: "weapons", cmd: "fireTube", tube: i })}
                    disabled={!target}
                  >
                    ¡Disparar!
                  </button>
                )}
              </div>
            ))}
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

function CommsView({ snap, send, events, channel }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[]; channel: CommsChannel | null }) {
  const [mode, setMode] = useState<"select" | "waypoint">("select");
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
        </div>
        <Radar
          snap={snap}
          range={10000}
          size={440}
          events={events}
          targetId={selectedId}
          onSelectEntity={mode === "select" ? (id) => setSelectedId(id) : undefined}
          onClickWorld={mode === "waypoint" ? (x, y) => send({ t: "comms", cmd: "addWaypoint", x, y }) : undefined}
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
          ) : sel ? (
            sel.scanned ? (
              <button onClick={() => send({ t: "comms", cmd: "hail", id: sel.id })}>
                📡 Abrir canal con {sel.callSign}
              </button>
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

function ScienceView({ snap, send, events }: { snap: GameSnap; send: (m: object) => void; events: TimedEvent[] }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { ship } = snap;
  const sel = snap.entities.find((e) => e.id === selectedId);
  const scanning = ship.scan;
  const distOf = (e: { x: number; y: number }) => Math.hypot(e.x - ship.x, e.y - ship.y);
  const bearingOf = (e: { x: number; y: number }) =>
    Math.round(((Math.atan2(e.x - ship.x, e.y - ship.y) * 180) / Math.PI + 360) % 360);

  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <Radar
        snap={snap}
        range={15000}
        size={480}
        events={events}
        targetId={selectedId}
        onSelectEntity={(id) => setSelectedId(id)}
      />
      <div style={{ minWidth: 260, flex: 1, display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <Viewport3D snap={snap} height={150} />
        <div className="panel">
          <h3 style={{ marginTop: 0, color: "var(--accent)" }}>Ciencia</h3>
          <p className="muted" style={{ marginTop: 0 }}>Radar de largo alcance (15 km). Selecciona un contacto.</p>
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
              {sel.scanned ? (
                <>
                  <p style={{ margin: "0.25rem 0" }}>
                    Facción: <b style={{ color: sel.faction === "hostile" ? "#f87171" : "#a3e635" }}>
                      {sel.faction === "hostile" ? "HOSTIL" : "neutral"}
                    </b>
                  </p>
                  <Bar label={`Casco ${Math.round((sel.hullFrac ?? 0) * 100)}%`} frac={sel.hullFrac ?? 0} color="#f87171" />
                  <Bar label={`Escudos ${Math.round((sel.shieldFrac ?? 0) * 100)}%`} frac={sel.shieldFrac ?? 0} color="#38bdf8" />
                </>
              ) : scanning?.targetId === sel.id ? (
                <Bar label={`Escaneando… ${Math.round(scanning.progress * 100)}%`} frac={scanning.progress} color="#facc15" />
              ) : (
                <button
                  style={{ marginTop: "0.4rem" }}
                  onClick={() => send({ t: "science", cmd: "scan", id: sel.id })}
                >
                  🛰 Escanear (6 s)
                </button>
              )}
            </div>
          ) : (
            <p className="muted">Ningún contacto seleccionado.</p>
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
            <tr><td className="muted">Velocidad</td><td style={{ textAlign: "right" }}>{Math.round(ship.speed)} m/s</td></tr>
            <tr><td className="muted">Casco</td><td style={{ textAlign: "right" }}>{Math.round(ship.hull)}/{ship.hullMax}</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: "1rem" }}>
          <label className="muted">Impulso: {impulse}%</label>
          <input
            type="range"
            min={0}
            max={100}
            value={impulse}
            onChange={(e) => applyImpulse(Number(e.target.value))}
            style={{ width: "100%" }}
          />
          <div className="row" style={{ marginTop: "0.5rem" }}>
            {[0, 25, 50, 100].map((v) => (
              <button key={v} onClick={() => applyImpulse(v)} style={{ padding: "0.25rem 0.6rem", fontSize: "0.85rem" }}>
                {v}%
              </button>
            ))}
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

function CaptainView({ snap, events }: { snap: GameSnap; events: TimedEvent[] }) {
  const [view, setView] = useState<"3d" | "tactical">("3d");
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
        <div className="row" style={{ justifyContent: "center" }}>
          <Radar snap={snap} range={12000} size={560} events={events} />
        </div>
      )}
      <div className="row" style={{ justifyContent: "center", gap: "2rem", marginTop: "0.5rem" }}>
        <span className="muted">Rumbo {Math.round(ship.heading)}°</span>
        <span className="muted">{Math.round(ship.speed)} m/s</span>
        <span className="muted">Casco {Math.round(ship.hull)}/{ship.hullMax}</span>
      </div>
    </div>
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
