import { useEffect, useRef, useState } from "react";
import {
  CPU_TEMPLATES, FACTIONS, newObject,
  type DesignKind, type DesignMeta, type DesignObject,
} from "./model.js";

const TOOLS: { kind: DesignKind | "select" | "belt"; label: string; title: string }[] = [
  { kind: "select", label: "↖", title: "Seleccionar / arrastrar" },
  { kind: "playerStart", label: "🎯", title: "Inicio del jugador" },
  { kind: "station", label: "🛰", title: "Estación" },
  { kind: "cpu", label: "🚀", title: "Nave IA" },
  { kind: "nebula", label: "🌫", title: "Nebulosa" },
  { kind: "mine", label: "💣", title: "Mina" },
  { kind: "asteroid", label: "🪨", title: "Asteroide" },
  { kind: "belt", label: "🪨×10", title: "Cinturón de asteroides" },
];

interface Props {
  objects: DesignObject[];
  setObjects: (o: DesignObject[]) => void;
  meta: DesignMeta;
  setMeta: (m: DesignMeta) => void;
}

export function ScenarioDesigner({ objects, setObjects, meta, setMeta }: Props) {
  const [tool, setTool] = useState<DesignKind | "select" | "belt">("select");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [range, setRange] = useState(12000);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: number } | null>(null);
  const SIZE = 540;

  const selected = objects.find((o) => o.id === selectedId) ?? null;

  function toWorld(px: number, py: number): [number, number] {
    const scale = SIZE / 2 / range;
    return [(px - SIZE / 2) / scale, -(py - SIZE / 2) / scale];
  }

  function toScreen(x: number, y: number): [number, number] {
    const scale = SIZE / 2 / range;
    return [SIZE / 2 + x * scale, SIZE / 2 - y * scale];
  }

  function hitTest(px: number, py: number): DesignObject | null {
    let best: { o: DesignObject; d: number } | null = null;
    for (const o of objects) {
      const [sx, sy] = toScreen(o.x, o.y);
      const d = Math.hypot(sx - px, sy - py);
      if (d < 14 && (!best || d < best.d)) best = { o, d };
    }
    return best?.o ?? null;
  }

  function updateObject(id: number, patch: Partial<DesignObject>) {
    setObjects(objects.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }

  function handleDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left;
    const py = ev.clientY - rect.top;
    const [wx, wy] = toWorld(px, py);

    if (tool === "select") {
      const hit = hitTest(px, py);
      setSelectedId(hit?.id ?? null);
      if (hit) dragRef.current = { id: hit.id };
      return;
    }
    if (tool === "belt") {
      const belt: DesignObject[] = [];
      for (let i = 0; i < 10; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = Math.random() * 2200;
        belt.push(newObject("asteroid", wx + Math.sin(ang) * d, wy + Math.cos(ang) * d));
      }
      setObjects([...objects, ...belt]);
      return;
    }
    if (tool === "playerStart") {
      // Solo uno: recolocar si ya existe
      const existing = objects.find((o) => o.kind === "playerStart");
      if (existing) {
        updateObject(existing.id, { x: Math.round(wx), y: Math.round(wy) });
        setSelectedId(existing.id);
        return;
      }
    }
    const obj = newObject(tool, wx, wy);
    // Numerar naves/estaciones automáticamente
    if (tool === "cpu" || tool === "station") {
      const n = objects.filter((o) => o.kind === tool).length + 1;
      obj.callSign = tool === "cpu" ? `KR-${n}` : `DS-${n}`;
    }
    setObjects([...objects, obj]);
    setSelectedId(obj.id);
    setTool("select");
  }

  function handleMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const [wx, wy] = toWorld(ev.clientX - rect.left, ev.clientY - rect.top);
    updateObject(dragRef.current.id, { x: Math.round(wx), y: Math.round(wy) });
  }

  // Dibujo
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = "rgba(8,15,30,0.95)";
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Cuadrícula cada 2 km
    const scale = SIZE / 2 / range;
    const step = 2000 * scale;
    ctx.strokeStyle = "rgba(56,189,248,0.08)";
    ctx.beginPath();
    for (let x = SIZE / 2 % step; x < SIZE; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, SIZE); }
    for (let y = SIZE / 2 % step; y < SIZE; y += step) { ctx.moveTo(0, y); ctx.lineTo(SIZE, y); }
    ctx.stroke();
    ctx.strokeStyle = "rgba(56,189,248,0.25)";
    ctx.strokeRect(0, 0, SIZE, SIZE);

    for (const o of objects) {
      const [sx, sy] = toScreen(o.x, o.y);
      const isSel = o.id === selectedId;
      if (o.kind === "nebula") {
        const r = (o.radius ?? 3000) * scale;
        ctx.fillStyle = "rgba(168,85,247,0.15)";
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isSel ? "#facc15" : "rgba(168,85,247,0.5)";
        ctx.stroke();
      } else if (o.kind === "station") {
        ctx.fillStyle = "rgba(74,222,128,0.3)";
        ctx.strokeStyle = isSel ? "#facc15" : "#4ade80";
        ctx.beginPath();
        ctx.rect(sx - 6, sy - 6, 12, 12);
        ctx.fill();
        ctx.stroke();
      } else if (o.kind === "cpu") {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.fillStyle = o.faction === "Kraylor" ? "#f87171" : o.faction === "Independent" ? "#a3e635" : "#38bdf8";
        ctx.beginPath();
        ctx.moveTo(0, -8); ctx.lineTo(6, 7); ctx.lineTo(-6, 7); ctx.closePath();
        ctx.fill();
        if (isSel) { ctx.strokeStyle = "#facc15"; ctx.stroke(); }
        ctx.restore();
      } else if (o.kind === "mine") {
        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (isSel) { ctx.strokeStyle = "#facc15"; ctx.stroke(); }
      } else if (o.kind === "asteroid") {
        ctx.fillStyle = "#7c6f5a";
        ctx.beginPath();
        ctx.arc(sx, sy, 4, 0, Math.PI * 2);
        ctx.fill();
        if (isSel) { ctx.strokeStyle = "#facc15"; ctx.stroke(); }
      } else if (o.kind === "playerStart") {
        ctx.strokeStyle = isSel ? "#facc15" : "#38bdf8";
        ctx.beginPath();
        ctx.arc(sx, sy, 9, 0, Math.PI * 2);
        ctx.moveTo(sx - 13, sy); ctx.lineTo(sx + 13, sy);
        ctx.moveTo(sx, sy - 13); ctx.lineTo(sx, sy + 13);
        ctx.stroke();
      }
      if ((o.kind === "cpu" || o.kind === "station") && o.callSign) {
        ctx.fillStyle = "rgba(203,213,225,0.8)";
        ctx.font = "10px monospace";
        ctx.fillText(o.callSign, sx + 9, sy + 3);
      }
    }
  }, [objects, selectedId, range]);

  return (
    <div style={{ display: "flex", gap: "0.75rem", flex: 1, minHeight: 0 }}>
      <div>
        <div className="row" style={{ marginBottom: "0.4rem", flexWrap: "wrap" }}>
          {TOOLS.map((t) => (
            <button
              key={t.kind}
              title={t.title}
              onClick={() => setTool(t.kind)}
              style={{
                padding: "0.25rem 0.55rem",
                background: tool === t.kind ? "var(--accent)" : undefined,
                color: tool === t.kind ? "#082f49" : undefined,
              }}
            >
              {t.label}
            </button>
          ))}
          <span style={{ flex: 1 }} />
          {[6000, 12000, 24000].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              style={{ fontSize: "0.75rem", padding: "0.2rem 0.45rem", background: range === r ? "var(--accent)" : undefined, color: range === r ? "#082f49" : undefined }}
            >
              {r / 1000 * 2} km
            </button>
          ))}
        </div>
        <canvas
          ref={canvasRef}
          width={SIZE}
          height={SIZE}
          onPointerDown={handleDown}
          onPointerMove={handleMove}
          onPointerUp={() => { dragRef.current = null; }}
          onPointerLeave={() => { dragRef.current = null; }}
          style={{ cursor: tool === "select" ? "default" : "crosshair", borderRadius: 8, touchAction: "none" }}
        />
        <p className="muted" style={{ fontSize: "0.75rem", margin: "0.3rem 0 0" }}>
          Elige herramienta y pulsa en el mapa. Con ↖ seleccionas y arrastras. Cuadrícula: 2 km.
        </p>
      </div>

      <div className="panel" style={{ width: 270, overflowY: "auto" }}>
        <h4 style={{ marginTop: 0, color: "var(--accent)" }}>Propiedades</h4>
        {selected ? (
          <div style={{ fontSize: "0.85rem" }}>
            <p className="muted" style={{ margin: "0 0 0.4rem" }}>
              {selected.kind === "playerStart" ? "Inicio del jugador" : selected.kind} · ({selected.x}, {selected.y})
            </p>
            {(selected.kind === "cpu" || selected.kind === "station") && (
              <label style={{ display: "block", marginBottom: "0.4rem" }}>
                Identificador
                <input
                  value={selected.callSign ?? ""}
                  onChange={(e) => updateObject(selected.id, { callSign: e.target.value })}
                  style={{ width: "100%", marginTop: 2 }}
                />
              </label>
            )}
            {selected.kind === "cpu" && (
              <>
                <label style={{ display: "block", marginBottom: "0.4rem" }}>
                  Plantilla
                  <select
                    value={selected.template}
                    onChange={(e) => updateObject(selected.id, { template: e.target.value })}
                    style={{ width: "100%", marginTop: 2, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "0.3rem" }}
                  >
                    {CPU_TEMPLATES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </label>
                <label style={{ display: "block", marginBottom: "0.4rem" }}>
                  Facción
                  <select
                    value={selected.faction}
                    onChange={(e) => updateObject(selected.id, { faction: e.target.value })}
                    style={{ width: "100%", marginTop: 2, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "0.3rem" }}
                  >
                    {FACTIONS.map((f) => <option key={f}>{f}</option>)}
                  </select>
                </label>
                <label style={{ display: "block", marginBottom: "0.4rem" }}>
                  <input
                    type="checkbox"
                    checked={selected.scanned ?? false}
                    onChange={(e) => updateObject(selected.id, { scanned: e.target.checked })}
                  />{" "}
                  Ya identificada al empezar
                </label>
              </>
            )}
            {selected.kind === "nebula" && (
              <label style={{ display: "block", marginBottom: "0.4rem" }}>
                Radio: {((selected.radius ?? 3000) / 1000).toFixed(1)} km
                <input
                  type="range" min={500} max={6000} step={100}
                  value={selected.radius ?? 3000}
                  onChange={(e) => updateObject(selected.id, { radius: Number(e.target.value) })}
                  style={{ width: "100%" }}
                />
              </label>
            )}
            {selected.kind !== "playerStart" && (
              <button
                style={{ borderColor: "#f87171", color: "#f87171", background: "transparent" }}
                onClick={() => { setObjects(objects.filter((o) => o.id !== selected.id)); setSelectedId(null); }}
              >
                🗑 Eliminar
              </button>
            )}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: "0.85rem" }}>Nada seleccionado.</p>
        )}

        <h4 style={{ color: "var(--accent)", marginBottom: "0.3rem" }}>Misión</h4>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
          Descripción
          <input
            value={meta.description}
            onChange={(e) => setMeta({ ...meta, description: e.target.value })}
            style={{ width: "100%", marginTop: 2 }}
            placeholder="Una línea para el lobby"
          />
        </label>
        <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.4rem" }}>
          Victoria
          <select
            value={meta.victory}
            onChange={(e) => setMeta({ ...meta, victory: e.target.value as DesignMeta["victory"] })}
            style={{ width: "100%", marginTop: 2, background: "var(--panel)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 4, padding: "0.3rem" }}
          >
            <option value="hostiles">Destruir todos los hostiles</option>
            <option value="survive">Sobrevivir un tiempo</option>
            <option value="manual">Manual (editar Lua)</option>
          </select>
        </label>
        {meta.victory === "survive" && (
          <label style={{ display: "block", fontSize: "0.85rem" }}>
            Segundos: {meta.surviveSeconds}
            <input
              type="range" min={60} max={1200} step={30}
              value={meta.surviveSeconds}
              onChange={(e) => setMeta({ ...meta, surviveSeconds: Number(e.target.value) })}
              style={{ width: "100%" }}
            />
          </label>
        )}
        <p className="muted" style={{ fontSize: "0.75rem" }}>
          Objetos: {objects.length} · Hostiles: {objects.filter((o) => o.kind === "cpu" && o.faction === "Kraylor").length}
        </p>
      </div>
    </div>
  );
}
