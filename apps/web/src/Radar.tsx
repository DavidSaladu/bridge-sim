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
  onClickWorld?: (x: number, y: number) => void;
  targetId?: number | null;
  events?: TimedEvent[];
}

export function Radar({ snap, range, size, onSetHeading, onSelectEntity, onClickWorld, targetId, events }: Props) {
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

    // Corona de grados (000 = norte, sentido horario)
    const step = size >= 400 ? 30 : 90;
    ctx.font = size >= 400 ? "9px monospace" : "8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let deg = 0; deg < 360; deg += 10) {
      const a = (deg * Math.PI) / 180;
      const isMajor = deg % step === 0;
      const r1 = c - (isMajor ? 8 : 4);
      ctx.strokeStyle = isMajor ? "rgba(56,189,248,0.5)" : "rgba(56,189,248,0.2)";
      ctx.beginPath();
      ctx.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1);
      ctx.lineTo(c + Math.sin(a) * (c - 1), c - Math.cos(a) * (c - 1));
      ctx.stroke();
      if (isMajor && size >= 300) {
        ctx.fillStyle = "rgba(125,211,252,0.75)";
        ctx.fillText(String(deg).padStart(3, "0"), c + Math.sin(a) * (c - 18), c - Math.cos(a) * (c - 18));
      }
    }
    ctx.textAlign = "start";
    ctx.textBaseline = "alphabetic";

    const toScreen = (ex: number, ey: number): [number, number] | null => {
      const dx = ex - ship.x;
      const dy = ey - ship.y;
      if (Math.hypot(dx, dy) > range) return null;
      return [c + dx * scale, c - dy * scale];
    };

    // Nebulosas: manchas violetas translúcidas (pueden verse parcialmente aunque el centro quede fuera)
    for (const e of snap.entities) {
      if (e.kind !== "nebula" || !e.radius) continue;
      const dx = e.x - ship.x;
      const dy = e.y - ship.y;
      const sx = c + dx * scale;
      const sy = c - dy * scale;
      const sr = e.radius * scale;
      const grad = ctx.createRadialGradient(sx, sy, sr * 0.2, sx, sy, sr);
      grad.addColorStop(0, "rgba(168, 85, 247, 0.22)");
      grad.addColorStop(1, "rgba(168, 85, 247, 0.04)");
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, c - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

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
      } else if (e.kind === "station") {
        ctx.strokeStyle = "#4ade80";
        ctx.fillStyle = "rgba(74, 222, 128, 0.25)";
        ctx.beginPath();
        ctx.rect(sx - 5, sy - 5, 10, 10);
        ctx.fill();
        ctx.stroke();
        if (e.callSign) {
          ctx.fillStyle = "rgba(134, 239, 172, 0.8)";
          ctx.font = "10px monospace";
          ctx.fillText(e.callSign, sx + 8, sy + 3);
        }
      } else if (e.kind === "mine") {
        ctx.fillStyle = "#fb7185";
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(251, 113, 133, 0.4)";
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.stroke();
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

    // Waypoints: rombos amarillos numerados; si caen fuera, marcador en el borde
    snap.waypoints?.forEach((w, i) => {
      const dx = w.x - ship.x;
      const dy = w.y - ship.y;
      const d = Math.hypot(dx, dy);
      const inside = d <= range;
      let sx: number, sy: number;
      if (inside) {
        sx = c + dx * scale;
        sy = c - dy * scale;
      } else {
        sx = c + (dx / d) * (c - 26);
        sy = c - (dy / d) * (c - 26);
      }
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(Math.PI / 4);
      ctx.strokeStyle = inside ? "#facc15" : "rgba(250,204,21,0.55)";
      ctx.strokeRect(-4, -4, 8, 8);
      ctx.restore();
      ctx.fillStyle = inside ? "#facc15" : "rgba(250,204,21,0.55)";
      ctx.font = "10px monospace";
      ctx.fillText("W" + (i + 1) + (inside ? "" : " " + (d / 1000).toFixed(1) + "km"), sx + 7, sy - 6);
    });

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

    if (onClickWorld) {
      const scale = size / 2 / range;
      onClickWorld(snap.ship.x + px / scale, snap.ship.y - py / scale);
      return;
    }
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
      style={{ cursor: onSetHeading || onSelectEntity || onClickWorld ? "crosshair" : "default", touchAction: "manipulation" }}
    />
  );
}
