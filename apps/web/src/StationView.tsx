import { useState } from "react";
import { Viewport3D } from "./Viewport3D.js";
import type { GameSnap, Station } from "@bridge/shared";
import { STATION_LABELS } from "@bridge/shared";
import { Radar } from "./Radar.js";

interface Props {
  station: Station | null;
  snap: GameSnap | null;
  send: (msg: object) => void;
}

export function StationView({ station, snap, send }: Props) {
  if (!snap) return <p className="muted">Esperando datos de la nave…</p>;
  switch (station) {
    case "helm":
      return <HelmView snap={snap} send={send} />;
    case "captain":
      return <CaptainView snap={snap} />;
    default:
      return <GenericView station={station} snap={snap} />;
  }
}

function HelmView({ snap, send }: { snap: GameSnap; send: (m: object) => void }) {
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

function CaptainView({ snap }: { snap: GameSnap }) {
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
          <Radar snap={snap} range={12000} size={560} />
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

function GenericView({ station, snap }: { station: Station | null; snap: GameSnap }) {
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: "1.5rem" }}>
      <Radar snap={snap} range={8000} size={320} />
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
