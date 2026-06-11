import { useEffect, useRef } from "react";

/**
 * Visualizador de onda del escáner, estilo EE: la señal se ve ruidosa e
 * inestable hasta que las dos bandas están bien sintonizadas.
 * signalA controla el ruido de amplitud; signalB el temblor de fase.
 */
export function ScanWave({ signalA, signalB, tuneA }: { signalA: number; signalB: number; tuneA: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    function draw(t: number) {
      raf.current = requestAnimationFrame(draw);
      if (!ctx) return;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(8,15,30,0.95)";
      ctx.fillRect(0, 0, W, H);
      // Rejilla
      ctx.strokeStyle = "rgba(56,189,248,0.12)";
      ctx.beginPath();
      for (let x = 0; x < W; x += 24) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
      ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      ctx.stroke();

      const noiseAmp = (1 - signalA) * 16;
      const phaseJit = (1 - signalB) * 1.6;
      const freq = 0.04 + tuneA * 0.0008;
      const quality = (signalA + signalB) / 2;

      ctx.strokeStyle = quality > 0.84 ? "#4ade80" : quality > 0.5 ? "#facc15" : "#fb923c";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 2) {
        const jitter = Math.sin(t * 0.02 + x * 0.3) * phaseJit + (Math.random() - 0.5) * phaseJit * 2;
        const y =
          H / 2 +
          Math.sin(x * freq + t * 0.003 + jitter) * (H * 0.32) +
          (Math.random() - 0.5) * noiseAmp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    raf.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf.current);
  }, [signalA, signalB, tuneA]);

  return <canvas ref={ref} width={300} height={96} style={{ width: "100%", borderRadius: 6, border: "1px solid var(--border)" }} />;
}
