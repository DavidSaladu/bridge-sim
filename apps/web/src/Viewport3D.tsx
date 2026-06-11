import { useEffect, useRef, useState } from "react";
import type { GameSnap } from "@bridge/shared";
import { Scene3D } from "./three/Scene3D.js";

interface Props {
  snap: GameSnap | null;
  height: number;
  collapsible?: boolean;
}

export function Viewport3D({ snap, height, collapsible = true }: Props) {
  const [open, setOpen] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const scene = new Scene3D(canvas);
    sceneRef.current = scene;
    const ro = new ResizeObserver(() => {
      scene.resize(wrap.clientWidth, height);
    });
    ro.observe(wrap);
    scene.resize(wrap.clientWidth, height);
    return () => {
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, [open, height]);

  useEffect(() => {
    if (snap && sceneRef.current) sceneRef.current.updateSnap(snap);
  }, [snap]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      {collapsible && (
        <button
          onClick={() => setOpen(!open)}
          style={{
            position: "absolute", top: 6, right: 6, zIndex: 2,
            padding: "0.15rem 0.5rem", fontSize: "0.75rem",
          }}
        >
          {open ? "Ocultar 3D" : "Mostrar 3D"}
        </button>
      )}
      {open ? (
        <canvas ref={canvasRef} style={{ width: "100%", height, display: "block", borderRadius: 8, border: "1px solid var(--border)" }} />
      ) : (
        <div className="panel muted" style={{ padding: "0.4rem 0.75rem", fontSize: "0.8rem" }}>Vista exterior oculta</div>
      )}
    </div>
  );
}
