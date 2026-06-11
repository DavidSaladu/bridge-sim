import { useState } from "react";
import { Viewport3D } from "./Viewport3D.js";
import type { TimedEvent } from "./Radar.js";
import type { GameSnap, Station } from "@bridge/shared";
import { STATION_LABELS } from "@bridge/shared";
import { Radar } from "./Radar.js";

interface Props {
  station: Station | null;
  snap: GameSnap | null;
  send: (msg: object) => void;
  events: TimedEvent[];
}

export function StationView({ station, snap, send, events }: Props) {
  if (!snap) return <p className="muted">Esperando datos de la nave…</p>;
  switch (station) {
    case "helm":
      return <HelmView snap={snap} send={send} events={events} />;
    case "weapons":
      return <WeaponsView snap={snap} send={send} events={events} />;
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
              <>
                {target.callSign}
                <Bar label="Casco" frac={target.hullFrac ?? 1} color="#f87171" />
                <Bar label="Escudo" frac={target.shieldFrac ?? 0} color="#38bdf8" />
              </>
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
