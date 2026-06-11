import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import type { GameSnap, SnapEntity, SnapEvent } from "@bridge/shared";

const DEG = Math.PI / 180;
/** 1 unidad three = 10 m de juego */
const SCALE = 0.1;
const SNAP_INTERVAL_MS = 100;

function angleLerp(a: number, b: number, t: number): number {
  const diff = ((b - a + 540) % 360) - 180;
  return a + diff * t;
}

interface Tracked {
  group: THREE.Group;
  prev: { x: number; y: number; heading: number };
  curr: { x: number; y: number; heading: number };
  kind: string;
}

function makeNebulaTexture(hue: number): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.35)`);
  g.addColorStop(0.5, `hsla(${hue}, 80%, 40%, 0.12)`);
  g.addColorStop(1, "hsla(0, 0%, 0%, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

function makeShipMesh(color: number, emissive: number): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.35 });
  const glowMat = new THREE.MeshStandardMaterial({ color: emissive, emissive, emissiveIntensity: 2 });

  // Fuselaje apuntando a -Z
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 8, 6), mat);
  body.rotation.x = -Math.PI / 2;
  group.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.2, 3, 6), mat);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -5.5;
  group.add(nose);
  // Alas
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9, 0.3, 2.5), mat);
  wing.position.z = 2;
  group.add(wing);
  // Motores con brillo
  for (const sx of [-1.6, 1.6]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 8), glowMat);
    eng.rotation.x = -Math.PI / 2;
    eng.position.set(sx, 0, 4.2);
    group.add(eng);
  }
  // Las naves reales son pequeñas a escala: factor visual x4 para que se vean
  group.scale.setScalar(4);
  return group;
}

function makeAsteroidMesh(seed: number): THREE.Group {
  const geo = new THREE.IcosahedronGeometry(6, 1);
  const pos = geo.getAttribute("position");
  const rnd = (i: number) => {
    const x = Math.sin(seed * 999 + i * 374761) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < pos.count; i++) {
    const f = 0.75 + rnd(i) * 0.55;
    pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f, pos.getZ(i) * f);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color: 0x8a7a60, roughness: 0.95, metalness: 0.05 }),
  );
  const group = new THREE.Group();
  group.add(mesh);
  group.scale.setScalar(2);
  return group;
}

export class Scene3D {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private tracked = new Map<number, Tracked>();
  private fx: { obj: THREE.Object3D; born: number; ttl: number; boom?: boolean }[] = [];
  private selfShip: Tracked | null = null;
  private lastSnapAt = 0;
  private raf = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.camera = new THREE.PerspectiveCamera(65, 1, 0.5, 12000);

    // Iluminación
    this.scene.add(new THREE.AmbientLight(0x223344, 1.2));
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    sun.position.set(3000, 2000, -1500);
    this.scene.add(sun);

    // Campo de estrellas
    const starGeo = new THREE.BufferGeometry();
    const starPos: number[] = [];
    const starCol: number[] = [];
    for (let i = 0; i < 2600; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(9000);
      starPos.push(v.x, v.y, v.z);
      const b = 0.5 + Math.random() * 0.5;
      const warm = Math.random() < 0.2;
      starCol.push(b, b, warm ? b * 0.8 : b);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starCol, 3));
    const stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true }),
    );
    this.scene.add(stars);

    // Nebulosas
    for (const [hue, x, y, z, s] of [
      [210, -5000, 1200, -6000, 9000],
      [285, 6000, -800, -4000, 7000],
      [170, 2000, 2500, 7000, 8000],
    ] as const) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: makeNebulaTexture(hue), depthWrite: false, transparent: true }),
      );
      sprite.position.set(x, y, z);
      sprite.scale.setScalar(s);
      this.scene.add(sprite);
    }

    // Bloom
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.8, 0.82));

    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.render();
    };
    loop();
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private spawnFx(ev: SnapEvent): void {
    const now = performance.now();
    if (ev.k === "beam") {
      const mat = new THREE.LineBasicMaterial({
        color: ev.hostile ? 0xff4433 : 0x33bbff,
        transparent: true,
      });
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(ev.fx * SCALE, 0, -ev.fy * SCALE),
        new THREE.Vector3(ev.tx * SCALE, 0, -ev.ty * SCALE),
      ]);
      const line = new THREE.Line(geo, mat);
      this.scene.add(line);
      this.fx.push({ obj: line, born: now, ttl: 350 });
    } else if (ev.k === "boom") {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffaa33,
        transparent: true,
      });
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 12), mat);
      ball.position.set(ev.x * SCALE, 0, -ev.y * SCALE);
      ball.scale.setScalar(ev.big ? 4 : 2);
      this.scene.add(ball);
      this.fx.push({ obj: ball, born: now, ttl: ev.big ? 900 : 600, boom: true });
    }
  }

  updateSnap(snap: GameSnap): void {
    this.lastSnapAt = performance.now();
    for (const ev of snap.events) this.spawnFx(ev);
    const seen = new Set<number>();
    for (const e of snap.entities) {
      seen.add(e.id);
      let t = this.tracked.get(e.id);
      if (!t) {
        t = {
          group: this.buildMesh(e),
          prev: { x: e.x, y: e.y, heading: e.heading },
          curr: { x: e.x, y: e.y, heading: e.heading },
          kind: e.kind,
        };
        this.tracked.set(e.id, t);
        this.scene.add(t.group);
        if (e.kind === "player") this.selfShip = t;
      } else {
        t.prev = t.curr;
        t.curr = { x: e.x, y: e.y, heading: e.heading };
      }
    }
    for (const [id, t] of this.tracked) {
      if (!seen.has(id)) {
        this.scene.remove(t.group);
        this.tracked.delete(id);
      }
    }
  }

  private buildMesh(e: SnapEntity): THREE.Group {
    if (e.kind === "asteroid") return makeAsteroidMesh(e.id);
    if (e.kind === "player") return makeShipMesh(0x6699cc, 0x33bbff);
    if (e.kind === "missile") {
      const g = new THREE.Group();
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.8, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 3 }),
      );
      g.add(m);
      return g;
    }
    return makeShipMesh(0x884444, 0xff5533);
  }

  private render(): void {
    const alpha = Math.min(1, (performance.now() - this.lastSnapAt) / SNAP_INTERVAL_MS);
    for (const t of this.tracked.values()) {
      const x = THREE.MathUtils.lerp(t.prev.x, t.curr.x, alpha) * SCALE;
      const z = -THREE.MathUtils.lerp(t.prev.y, t.curr.y, alpha) * SCALE;
      const h = angleLerp(t.prev.heading, t.curr.heading, alpha);
      t.group.position.set(x, 0, z);
      t.group.rotation.y = -h * DEG;
      if (t.kind === "asteroid") {
        t.group.rotation.x += 0.0008;
        t.group.rotation.y += 0.0011;
      }
    }
    // Cámara de puente: sobre la nave, mirando hacia su rumbo
    if (this.selfShip) {
      const p = this.selfShip.group.position;
      const h = this.selfShip.group.rotation.y;
      const fwd = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
      // three rotation.y = -heading → forward = (sin(heading),0,-cos(heading)) = (-sin(rot),0,-cos(rot))
      this.camera.position.set(p.x - fwd.x * 18, p.y + 7, p.z - fwd.z * 18);
      this.camera.lookAt(p.x + fwd.x * 120, p.y + 2, p.z + fwd.z * 120);
    }
    // Efectos transitorios
    const now = performance.now();
    this.fx = this.fx.filter((f) => {
      const age = now - f.born;
      if (age > f.ttl) {
        this.scene.remove(f.obj);
        return false;
      }
      const k = 1 - age / f.ttl;
      const mat = (f.obj as THREE.Mesh).material as THREE.Material & { opacity: number };
      mat.opacity = k;
      if (f.boom) f.obj.scale.multiplyScalar(1.06);
      return true;
    });
    this.composer.render();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => m.dispose());
      }
    });
  }
}
