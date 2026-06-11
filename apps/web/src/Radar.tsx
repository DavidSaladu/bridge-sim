import { useEffect, useRef } from "react";
import type { GameSnap, SnapEvent } from "@bridge/shared";

export interface TimedEvent {
  ev: SnapEvent;
  at: number;
}

interface Props {
  snap: GameSnap;
  range: number;
  size: number;
  onSetHeading?: (deg: number) => void;
  onSelectEntity?: (id: number | null) => void;
  targetId?: number | null;
  events?: TimedEvent[];
}

export function Radar({ snap, range, size, onSetHeading, onSelectEntity, targetId, events }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = size / 2;
    const scale = c / range;
    const { ship } = snap;
    const now = performance.now();

    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(56,189,248,0.25)";
    ctx.fillStyle = "rgba(8,15,30,0.9)";
    ctx.beginPath();
    ctx.arc(c, c, c - 1, 0, Math.PI * 2);
    ctx.fill();
    for (const f of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(c, c, (c - 1) * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(c, 2); ctx.lineTo(c, size - 2);
    ctx.moveTo(2, c); ctx.lineTo(size - 2, c);
    ctx.strokeStyle = "rgba(56,189,248,0.12)";
    ctx.stroke();

    const toScreen = (ex: number, ey: number): [number, number] | null => {
      const dx = ex - ship.x;
      const dy = ey - ship.y;
      if (Math.hypot(dx, dy) > range) return null;
      return [c + dx * scale, c - dy * scale];
    };

    // Eventos: rayos y explosiones (desvanecen en ~400/700 ms)
    for (const { ev, at } of events ?? []) {
      const age = now - at;
      if (ev.k === "beam" && age < 400) {
        const a = toScreen(ev.fx, ev.fy);
        const b = toScreen(ev.tx, ev.ty);
        if (a && b) {
          ctx.strokeStyle = ev.hostile ? `rgba(248,113,113,${1 - age / 400})` : `rgba(56,189,248,${1 - age / 400})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
          ctx.stroke();
          ctx.lineWidth = 1;
        }
      } else if (ev.k === "boom" && age < 700) {
        const p = toScreen(ev.x, ev.y);
        if (p) {
          const r = (age / 700) * (ev.big ? 22 : 12);
          ctx.strokeStyle = `rgba(251,191,36,${1 - age / 700})`;
          ctx.beginPath();
          ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }

    for (const e of snap.entities) {
      const pt = toScreen(e.x, e.y);
      if (!pt) continue;
      const [sx, sy] = pt;
      if (e.kind === "asteroid") {
        ctx.fillStyle = "#7c6f5a";
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === "missile") {
        ctx.fillStyle = "#fbbf24";
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === "cpu" || e.kind === "player") {
        const isSelf = e.kind === "player";
        if (e.id === targetId) {
          ctx.strokeStyle = "#facc15";
          ctx.beginPath();
          ctx.arc(sx, sy, 11, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((e.heading * Math.PI) / 180);
        ctx.fillStyle = isSelf
          ? "#38bdf8"
          : e.scanned === false
            ? "#94a3b8"
            : e.faction === "hostile"
              ? "#f87171"
              : "#a3e635";
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        if (!isSelf) {
          ctx.fillStyle = "rgba(203,213,225,0.7)";
          ctx.font = "10px monospace";
          ctx.fillText(e.callSign ?? "??", sx + 8, sy + 3);
        }
      }
    }

    const tr = (ship.targetHeading * Math.PI) / 180;
    ctx.strokeStyle = "rgba(250,204,21,0.8)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.sin(tr) * (c - 4), c - Math.cos(tr) * (c - 4));
    ctx.stroke();
    ctx.setLineDash([]);
  }, [snap, range, size, targetId, events]);

  function handleClick(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left - size / 2;
    const py = ev.clientY - rect.top - size / 2;

    if (onSelectEntity) {
      // Buscar la nave más cercana al clic (en coordenadas de pantalla)
      const scale = size / 2 / range;
      let best: { id: number; d: number } | null = null;
      for (const e of snap.entities) {
        if (e.kind !== "cpu") continue;
        const ex = (e.x - snap.ship.x) * scale;
        const ey = -(e.y - snap.ship.y) * scale;
        const d = Math.hypot(ex - px, ey - py);
        if (d < 18 && (!best || d < best.d)) best = { id: e.id, d };
      }
      onSelectEntity(best ? best.id : null);
      return;
    }
    if (onSetHeading) {
      const deg = (Math.atan2(px, -py) * 180) / Math.PI;
      onSetHeading(((deg % 360) + 360) % 360);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onClick={handleClick}
      style={{ cursor: onSetHeading || onSelectEntity ? "crosshair" : "default", touchAction: "manipulation" }}
    />
  );
}
