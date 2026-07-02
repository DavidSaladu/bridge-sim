import { useEffect, useRef } from "react";
import type { GameSnap, SnapEvent } from "@bridge/shared";
import { sectorName } from "./units.js";

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
  showBeamArc?: boolean;
  sectorGrid?: boolean;
  edgeSignals?: boolean;
  center?: { x: number; y: number };
  ringLabels?: boolean;
  rect?: boolean;
  coverage?: boolean;
}

export function Radar({ snap, range, size, onSetHeading, onSelectEntity, onClickWorld, targetId, events, showBeamArc, sectorGrid, edgeSignals, center, ringLabels, rect, coverage }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const c = size / 2;
    const scale = c / range;
    const { ship } = snap;
    const cx = center?.x ?? ship.x;
    const cy = center?.y ?? ship.y;
    const now = performance.now();

    ctx.clearRect(0, 0, size, size);

    ctx.strokeStyle = "rgba(56,189,248,0.25)";
    ctx.fillStyle = "rgba(8,15,30,0.9)";
    if (rect) {
      ctx.fillRect(0, 0, size, size);
      ctx.strokeRect(0, 0, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(c, c, c - 1, 0, Math.PI * 2);
      ctx.fill();
    }
    const ringCount = rect ? 0 : ringLabels ? Math.min(5, Math.round(range / 5000)) || 4 : 3;
    for (let ri = 1; ri <= ringCount; ri++) {
      const f = ri / ringCount;
      ctx.beginPath();
      ctx.arc(c, c, (c - 1) * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (ringLabels) {
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = `${Math.max(11, size / 45)}px monospace`;
      ctx.textAlign = "center";
      for (let ri = 1; ri <= ringCount; ri++) {
        const f = ri / ringCount;
        const uVal = (range / 1000) * f;
        ctx.fillText(`${Number(uVal.toFixed(1))}u`, c, c - (c - 1) * f + 16);
      }
      ctx.textAlign = "start";
    }
    if (!rect) {
      ctx.beginPath();
      ctx.moveTo(c, 2); ctx.lineTo(c, size - 2);
      ctx.moveTo(2, c); ctx.lineTo(size - 2, c);
      ctx.strokeStyle = "rgba(56,189,248,0.12)";
      ctx.stroke();
    }

    // Cobertura de sensores (Relay): círculos de visibilidad alrededor de nave y sondas
    if (coverage) {
      for (const e of snap.entities) {
        if (e.kind !== "player" && e.kind !== "probe") continue;
        const pt0 = [c + (e.x - cx) * scale, c - (e.y - cy) * scale];
        const r = 5000 * scale;
        const grad = ctx.createRadialGradient(pt0[0]!, pt0[1]!, r * 0.4, pt0[0]!, pt0[1]!, r);
        grad.addColorStop(0, "rgba(56,189,248,0.10)");
        grad.addColorStop(1, "rgba(56,189,248,0.02)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(pt0[0]!, pt0[1]!, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Corona de grados (000 = norte, sentido horario)
    const step = rect ? 0 : size >= 400 ? 30 : 90;
    ctx.font = size >= 400 ? "9px monospace" : "8px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let deg = 0; step > 0 && deg < 360; deg += 10) {
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

    // Rejilla de sectores de 20U con nombres (estilo Relay de EE)
    if (sectorGrid) {
      const SEC = 20000;
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, c - 1, 0, Math.PI * 2);
      ctx.clip();
      ctx.strokeStyle = "rgba(56,189,248,0.18)";
      ctx.fillStyle = "rgba(125,211,252,0.45)";
      ctx.font = "11px monospace";
      const x0 = Math.floor((cx - range) / SEC) * SEC;
      const y0 = Math.floor((cy - range) / SEC) * SEC;
      for (let wx = x0; wx <= cx + range; wx += SEC) {
        const sx = c + (wx - cx) * scale;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, size); ctx.stroke();
      }
      for (let wy = y0; wy <= cy + range + SEC; wy += SEC) {
        const sy = c - (wy - cy) * scale;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(size, sy); ctx.stroke();
      }
      for (let wx = x0; wx <= cx + range; wx += SEC) {
        for (let wy = y0; wy <= cy + range + SEC; wy += SEC) {
          const sx = c + (wx - cx) * scale;
          const sy = c - (wy - cy) * scale;
          ctx.fillText(sectorName(wx + 1000, wy - 1000), sx + 4, sy + 13);
        }
      }
      ctx.restore();
    }

    const toScreen = (ex: number, ey: number): [number, number] | null => {
      const dx = ex - cx;
      const dy = ey - cy;
      if (Math.hypot(dx, dy) > range) return null;
      return [c + dx * scale, c - dy * scale];
    };

    // Anillos de señal ondulados estilo EE: rojo (eléctrica), verde (residual), azul (gravimétrica)
    if (edgeSignals) {
      const BUCKETS = 96;
      const bands: Record<string, Float32Array> = {
        red: new Float32Array(BUCKETS),
        green: new Float32Array(BUCKETS),
        blue: new Float32Array(BUCKETS),
      };
      for (const e of snap.entities) {
        if (e.kind === "player") continue;
        const dx = e.x - cx;
        const dy = e.y - cy;
        const d = Math.max(600, Math.hypot(dx, dy));
        const band =
          e.kind === "nebula" ? "blue" :
          e.kind === "asteroid" || e.kind === "mine" ? "green" : "red";
        const weight = e.kind === "nebula" ? (e.radius ?? 3000) / d : e.kind === "station" ? 4000 / d : 2500 / d;
        const bucket = Math.round(((Math.atan2(dx, dy) + Math.PI * 2) / (Math.PI * 2)) * BUCKETS) % BUCKETS;
        for (let sp = -6; sp <= 6; sp++) {
          const idx = (bucket + sp + BUCKETS) % BUCKETS;
          bands[band]![idx] = Math.min(1.6, bands[band]![idx]! + weight * Math.exp(-(sp * sp) / 10));
        }
      }
      const now2 = performance.now() / 1000;
      const colors: [string, string, number][] = [
        ["red", "rgba(248,113,113,0.85)", c - 6],
        ["green", "rgba(74,222,128,0.8)", c - 12],
        ["blue", "rgba(96,165,250,0.8)", c - 18],
      ];
      for (const [band, color, baseR] of colors) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let i = 0; i <= BUCKETS; i++) {
          const idx = i % BUCKETS;
          const ang = (idx / BUCKETS) * Math.PI * 2 - Math.PI / 2;
          const amp = bands[band]![idx]! * 9;
          const noise = amp > 0.3 ? Math.sin(now2 * 7 + idx * 2.7) * amp * 0.5 : 0;
          const r = baseR - amp - noise;
          const px2 = c + Math.cos(ang) * r;
          const py2 = c + Math.sin(ang) * r;
          if (i === 0) ctx.moveTo(px2, py2);
          else ctx.lineTo(px2, py2);
        }
        ctx.stroke();
      }
      ctx.lineWidth = 1;
    }

    // Nebulosas: manchas violetas translúcidas (pueden verse parcialmente aunque el centro quede fuera)
    for (const e of snap.entities) {
      if (e.kind !== "nebula" || !e.radius) continue;
      const dx = e.x - cx;
      const dy = e.y - cy;
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
        // Copo de nieve estilo EE
        ctx.strokeStyle = e.id === targetId ? "#facc15" : "#4ade80";
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + Math.sin(a) * 7, sy - Math.cos(a) * 7);
          ctx.moveTo(sx + Math.sin(a) * 4.5 + Math.sin(a + 0.6) * 2.2, sy - Math.cos(a) * 4.5 - Math.cos(a + 0.6) * 2.2);
          ctx.lineTo(sx + Math.sin(a) * 4.5, sy - Math.cos(a) * 4.5);
          ctx.lineTo(sx + Math.sin(a) * 4.5 + Math.sin(a - 0.6) * 2.2, sy - Math.cos(a) * 4.5 - Math.cos(a - 0.6) * 2.2);
        }
        ctx.stroke();
        if (e.callSign) {
          ctx.fillStyle = "rgba(134, 239, 172, 0.8)";
          ctx.font = "10px monospace";
          ctx.fillText(e.callSign, sx + 8, sy + 3);
        }
      } else if (e.kind === "probe") {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = "#22d3ee";
        ctx.fillRect(-3, -3, 6, 6);
        ctx.restore();
        ctx.strokeStyle = "rgba(34, 211, 238, 0.25)";
        ctx.beginPath();
        ctx.arc(sx, sy, 5000 * scale > c ? 12 : 5000 * scale, 0, Math.PI * 2);
        ctx.stroke();
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
        if (!isSelf && e.scanned === false) {
          // Desconocido: chevron blanco estilo EE
          ctx.strokeStyle = "#e2e8f0";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(-5, 4);
          ctx.lineTo(0, -6);
          ctx.lineTo(5, 4);
          ctx.stroke();
          ctx.lineWidth = 1;
        } else {
          ctx.fillStyle = isSelf ? "#38bdf8" : e.faction === "hostile" ? "#f87171" : "#a3e635";
          ctx.beginPath();
          ctx.moveTo(0, -7);
          ctx.lineTo(5, 6);
          ctx.lineTo(-5, 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
        if (!isSelf) {
          ctx.fillStyle = "rgba(203,213,225,0.7)";
          ctx.font = "10px monospace";
          ctx.fillText(e.callSign ?? "??", sx + 8, sy + 3);
        }
      }
    }

    // Arco de rayos (cuña alrededor del rumbo actual)
    if (showBeamArc && ship.beam) {
      const r = Math.min(c - 2, ship.beam.range * scale);
      const a0 = ((ship.heading - ship.beam.arc / 2) * Math.PI) / 180 - Math.PI / 2;
      const a1 = ((ship.heading + ship.beam.arc / 2) * Math.PI) / 180 - Math.PI / 2;
      ctx.fillStyle = "rgba(56, 189, 248, 0.07)";
      ctx.strokeStyle = "rgba(56, 189, 248, 0.35)";
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, r, a0, a1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Waypoints: rombos amarillos numerados; si caen fuera, marcador en el borde
    snap.waypoints?.forEach((w, i) => {
      const dx = w.x - cx;
      const dy = w.y - cy;
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
  }, [snap, range, size, targetId, events, sectorGrid, edgeSignals, center, showBeamArc]);

  function handleClick(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - rect.left - size / 2;
    const py = ev.clientY - rect.top - size / 2;

    const ccx = center?.x ?? snap.ship.x;
    const ccy = center?.y ?? snap.ship.y;
    if (onClickWorld) {
      const scale = size / 2 / range;
      onClickWorld(ccx + px / scale, ccy - py / scale);
      return;
    }
    if (onSelectEntity) {
      // Buscar la nave más cercana al clic (en coordenadas de pantalla)
      const scale = size / 2 / range;
      let best: { id: number; d: number } | null = null;
      for (const e of snap.entities) {
        if (e.kind !== "cpu" && e.kind !== "station") continue;
        const ex = (e.x - ccx) * scale;
        const ey = -(e.y - ccy) * scale;
        const d = Math.hypot(ex - px, ey - py);
        if (d < 18 && (!best || d < best.d)) best = { id: e.id, d };
      }
      onSelectEntity(best ? best.id : null);
      return;
    }
  }

  const draggingHeading = useRef(false);

  function headingFromEvent(ev: React.PointerEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const dx = ev.clientX - rect.left - size / 2;
    const dy = ev.clientY - rect.top - size / 2;
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    onSetHeading?.(((deg % 360) + 360) % 360);
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onPointerDown={(ev) => {
        if (onSetHeading) {
          draggingHeading.current = true;
          headingFromEvent(ev);
          ev.currentTarget.setPointerCapture(ev.pointerId);
        }
      }}
      onPointerMove={(ev) => {
        if (onSetHeading && draggingHeading.current) headingFromEvent(ev);
      }}
      onPointerUp={() => { draggingHeading.current = false; }}
      onClick={handleClick}
      style={{ cursor: onSetHeading || onSelectEntity || onClickWorld ? "crosshair" : "default", touchAction: "manipulation" }}
    />
  );
}
