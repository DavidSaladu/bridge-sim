import { useEffect, useRef } from "react";
import type { GameSnap } from "@bridge/shared";

interface Props {
  snap: GameSnap;
  range: number;          // metros de radio
  size: number;           // píxeles
  onSetHeading?: (deg: number) => void;
}

export function Radar({ snap, range, size, onSetHeading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = size / 2;
    const scale = c / range;
    const { ship } = snap;

    ctx.clearRect(0, 0, size, size);

    // Anillos
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
    // Cruz
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

    // Entidades
    for (const e of snap.entities) {
      const pt = toScreen(e.x, e.y);
      if (!pt) continue;
      const [sx, sy] = pt;
      if (e.kind === "asteroid") {
        ctx.fillStyle = "#7c6f5a";
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.kind === "cpu" || e.kind === "player") {
        const isSelf = e.kind === "player";
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate((e.heading * Math.PI) / 180);
        ctx.fillStyle = isSelf ? "#38bdf8" : e.faction === "hostile" ? "#f87171" : "#a3e635";
        ctx.beginPath();
        ctx.moveTo(0, -7);
        ctx.lineTo(5, 6);
        ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        if (e.callSign && !isSelf) {
          ctx.fillStyle = "rgba(203,213,225,0.7)";
          ctx.font = "10px monospace";
          ctx.fillText(e.callSign, sx + 8, sy + 3);
        }
      }
    }

    // Indicador de rumbo objetivo
    const tr = (ship.targetHeading * Math.PI) / 180;
    ctx.strokeStyle = "rgba(250,204,21,0.8)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.lineTo(c + Math.sin(tr) * (c - 4), c - Math.cos(tr) * (c - 4));
    ctx.stroke();
    ctx.setLineDash([]);
  }, [snap, range, size]);

  function handleClick(ev: React.MouseEvent<HTMLCanvasElement>) {
    if (!onSetHeading) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const dx = ev.clientX - rect.left - size / 2;
    const dy = ev.clientY - rect.top - size / 2;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    onSetHeading(((deg % 360) + 360) % 360);
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onClick={handleClick}
      style={{ cursor: onSetHeading ? "crosshair" : "default", touchAction: "manipulation" }}
    />
  );
}
