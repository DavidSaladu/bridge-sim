# Bridge Sim — Especificación del MVP

Simulador de puente de nave multijugador, 100% web, inspirado en Empty Epsilon.
6 jugadores por sala (5 estaciones + capitán), cooperativo contra IA, con
escenarios scriptables en Lua compatibles con un subset de la API de EE.

**Estado:** borrador v1 — pendiente de validación.

---

## 1. Visión y alcance del MVP

### Incluido en el MVP

- Salas de juego con código de invitación, 6 puestos: Pilotaje (Helm),
  Armamento (Weapons), Ingeniería (Engineering), Ciencia (Science),
  Comunicaciones (Relay) y Capitán.
- 1 nave de jugadores por sala, cooperativo contra naves IA del escenario.
- Render 3D frontal (Three.js): pequeño en cada estación, a pantalla completa
  para el capitán.
- Audio por voz integrado (WebRTC vía LiveKit autoalojado) para los 6 jugadores.
- Escenarios en Lua: editor de código web (Monaco) con validación + subida de
  archivos `.lua`. Subset compatible con la API de Empty Epsilon.
- Biblioteca de escenarios: publicar, listar y jugar escenarios de otros usuarios.
- Cuentas mínimas (email + contraseña) para guardar escenarios; unirse a una
  sala solo requiere apodo + código.
- Despliegue con Docker en VPS (Hostinger), CI/CD desde GitHub.

### Excluido del MVP (fases posteriores)

- Multi-nave / PvP / flotas.
- Editor visual no-code de escenarios (fase 2 prioritaria).
- Game Master en vivo, replays, ranking, suscripciones de pago.
- Compatibilidad total con todos los escenarios existentes de EE.

---

## 2. Arquitectura

```
                         ┌─────────────────────────────┐
                         │        VPS (Docker)         │
  Navegador (x6)         │                             │
 ┌──────────────┐  HTTPS │  ┌───────┐   ┌───────────┐  │
 │ React + R3F  │◄───────┼─►│ Caddy │──►│  web      │  │  estáticos (Vite build)
 │ (estaciones) │        │  │ (TLS) │   └───────────┘  │
 │              │   WSS  │  │       │   ┌───────────┐  │
 │  WebSocket   │◄───────┼─►│       │──►│  server   │  │  Node/TS: lobby + salas
 │              │        │  └───────┘   │  (sim)    │  │  + motor de simulación
 │  WebRTC      │◄───────┼─►┌───────┐   └─────┬─────┘  │  + sandbox Lua
 │  (voz)       │        │  │LiveKit│         │        │
 └──────────────┘        │  └───────┘   ┌─────▼─────┐  │
                         │              │ Postgres  │  │  usuarios, escenarios
                         │  ┌─────────┐ └───────────┘  │
                         │  │Watchtower│ (auto-deploy) │
                         └─────────────────────────────┘
```

**Principios:**

- **Servidor autoritativo.** Toda la simulación corre en el servidor a tick
  fijo (20 Hz). Los clientes envían intenciones (`setImpulse(0.8)`) y reciben
  snapshots de estado. Nada de lógica de juego confiable en el cliente.
- **Stateless donde se pueda.** Las salas viven en memoria del proceso
  `server`; lo persistente (usuarios, escenarios) va a Postgres. Esto permite
  escalar después a múltiples nodos de salas con un router delante.
- **Un proceso, N salas.** El motor es ligero (sin render en servidor); un VPS
  de 2 vCPU soporta decenas de salas. Cuando haga falta, se replican
  contenedores `server` y el lobby asigna salas por nodo.

## 3. Stack

| Capa | Tecnología | Por qué |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | compartir tipos protocolo cliente/servidor |
| Frontend | React 18 + Vite + TypeScript | velocidad de iteración |
| Render 3D | Three.js + react-three-fiber + postprocessing | pipeline ambicioso: PBR, bloom, nebulosas |
| UI estaciones | Canvas 2D propio + componentes React | radares y diales estilo EE son 2D |
| Tiempo real | WebSocket (`ws`) + protocolo binario propio (msgpack) | latencia y control |
| Servidor | Node 22 + TypeScript + Fastify | mismo lenguaje en todo el stack |
| Simulación | paquete `sim` puro TS, determinista, tick 20 Hz | testeable sin red ni render |
| Scripting | wasmoon (Lua 5.4 en WASM) sandboxeado | ejecutar Lua de usuarios con límites de CPU/memoria |
| Voz | LiveKit (autoalojado, SFU) | WebRTC production-grade, open source, escala |
| Editor | Monaco + luaparse (validación sintáctica) | experiencia tipo VS Code en web |
| BD | Postgres 16 + Drizzle ORM | escenarios, usuarios, metadatos |
| Infra | Docker Compose + Caddy (TLS auto) + Watchtower | deploy simple en Hostinger VPS |
| CI/CD | GitHub Actions → GHCR | push a main = deploy |

### Estructura del monorepo

```
bridge-sim/
├── apps/
│   ├── web/            # React: lobby, estaciones, render 3D, editor
│   └── server/         # Fastify + WS: lobby, salas, auth, API escenarios
├── packages/
│   ├── shared/         # tipos del protocolo, constantes, esquemas zod
│   ├── sim/            # motor de simulación (puro TS, sin deps de red)
│   └── lua-api/        # bridge wasmoon ↔ sim, subset API de EE
├── deploy/             # docker-compose.yml, Caddyfile, script bootstrap VPS
└── .github/workflows/  # CI (test + build) y CD (imágenes → GHCR)
```

## 4. Modelo de juego

### 4.1 Salas y puestos

- Crear sala → código de 6 caracteres (p.ej. `KESTREL-7`) + URL compartible.
- Al entrar, el jugador elige apodo y un puesto libre. El creador es *host*:
  elige escenario y nave, puede expulsar, arranca la partida.
- Un puesto puede quedar vacante (partida con <6); el host puede habilitar
  "multipuesto" para que un jugador lleve 2 estaciones (útil para probar).
- Reconexión: el estado del puesto se conserva 5 min si un jugador cae.

### 4.2 Estaciones (paridad funcional con EE, simplificada)

| Estación | Funciones MVP |
|---|---|
| **Pilotaje** | rumbo (radar 5U), impulso, warp/jump (según nave), atraque |
| **Armamento** | selección y carga de tubos, tipos de misil, disparo de rayos por arco, escudos arriba/abajo, calibración |
| **Ingeniería** | distribución de energía y refrigerante a 8 sistemas, daños y reparación, niveles de calor |
| **Ciencia** | radar largo alcance (30U), escaneo de objetivos (minijuego de bandas), análisis (fricción/casco/escudos), base de datos |
| **Comunicaciones** | apertura de canales con naves/estaciones (diálogos scriptados), waypoints, sondas |
| **Capitán** | render 3D a pantalla completa, vista táctica conmutables, sin controles: manda por voz |

Cada estación incluye el **render frontal en miniatura** (esquina, conmutable).

### 4.3 Simulación (paquete `sim`)

- Tick fijo 20 Hz; snapshots a clientes 10 Hz con interpolación cliente.
- Entidades: PlayerShip, CpuShip, Station (espacial), Asteroid, Nebula, Mine,
  Missile, BeamEffect, Probe, BlackHole.
- Sistemas de nave: reactor, beams, missiles, maneuver, impulse, warp/jump,
  front/rear shields — con energía, calor, daño y refrigerante (modelo EE).
- IA enemiga MVP: roaming, ataque por facciones (hostil/neutral/amiga),
  órdenes desde Lua (`orderRoaming()`, `orderAttack()`, `orderDefendTarget()`...).
- Determinismo: RNG con semilla por partida (facilita tests y futuros replays).

### 4.4 Protocolo WS (resumen)

```
cliente → servidor:  { t: "cmd", station: "helm", cmd: "setImpulse", args: [0.8] }
servidor → cliente:  { t: "snap", tick, entities: [...], ship: {...} }     (10 Hz)
                     { t: "event", kind: "explosion" | "commsOpen" | ... } (puntual)
```

Validación: el servidor solo acepta comandos del puesto que el cliente ocupa.

## 5. Scripting Lua (subset compatible con EE)

- Runtime: wasmoon por sala, con sandbox: sin `io`/`os`/`require`, límite de
  memoria, presupuesto de CPU por tick (si se excede, el escenario se pausa y
  se notifica al host).
- Ciclo de vida: `init()` al arrancar, `update(delta)` cada tick de script
  (5 Hz), callbacks de comms y de eventos (`onNewPlayerShip`, destrucción...).
- **API soportada en MVP** (las funciones de EE más usadas en escenarios):
  - Creación: `PlayerSpaceship()/CpuShip()/SpaceStation():setTemplate()
    :setFaction():setPosition():setCallSign()`, `Asteroid`, `Nebula`, `Mine`,
    `WarpJammer`, `SupplyDrop`.
  - Órdenes IA: `orderRoaming/orderStandGround/orderDefendLocation/
    orderAttack/orderFlyTowards`.
  - Estado: `getPosition/setPosition/getHull/setHull/getShields/isValid/
    destroy/getCallSign/isEnemy/isFriendly`.
  - Juego: `getPlayerShip()`, `victory()`, `globalMessage()`,
    `getScenarioTime()`, `addGMFunction` (no-op en MVP).
  - Comms: `setCommsScript`/diálogos con `setCommsMessage()`,
    `addCommsReply()`.
- Plantillas de naves: formato propio JSON (`shipTemplates/*.json`) con los
  campos de EE (beams, tubos, escudos, hull, impulso...). Se traducirán las
  plantillas estándar de EE más comunes.
- Editor web: Monaco con resaltado Lua, validación sintáctica (luaparse),
  snippets de la API, botón "probar en sala privada".
- Escenarios: guardados en Postgres con metadatos (nombre, autor, dificultad,
  duración, visibilidad pública/privada). Subida directa de `.lua` con la
  misma validación.

## 6. Voz (LiveKit)

- Contenedor LiveKit en el mismo VPS; el backend emite tokens JWT por sala
  (room de LiveKit = sala de juego).
- Push-to-talk opcional y siempre-abierto por defecto; indicador de quién
  habla en todas las estaciones (clave para la inmersión tipo puente).
- Requiere UDP abierto (50000-60000) + TURN/TLS fallback integrado en LiveKit.

## 7. Render 3D

- Vista frontal desde el puente: skybox de nebulosas (generadas
  proceduralmente), naves GLTF con PBR, rayos/escudos/explosiones con shaders
  y postprocesado (bloom, chromatic aberration sutil).
- Assets iniciales: modelos low/mid-poly CC0 (Quaternius/Kenney) con materiales
  retocados; se sustituyen por arte propio iterativamente sin tocar código.
- El render consume los mismos snapshots que las estaciones: cero lógica propia.
- Presupuesto: 60 fps en un portátil integrado (calidad ajustable).

## 8. Seguridad

- Lua sandboxeado (ver §5); nunca se ejecuta Lua en el proceso principal sin
  límites.
- Rate-limiting en WS y API; los comandos se validan contra el puesto ocupado.
- Auth: sesiones con cookies httpOnly; hash argon2; sin OAuth en MVP.
- Caddy: TLS automático, HSTS. Postgres y LiveKit no expuestos salvo lo necesario.
- El token de GitHub usado en desarrollo debe rotarse al terminar el setup.

## 9. Despliegue y operaciones

- **VPS**: Hostinger KVM 2 (2 vCPU / 8 GB) para el MVP. Estimación: ~20-30
  salas concurrentes (límite probable: LiveKit). Plan B comercial: mover salas
  y LiveKit a nodos dedicados (Hetzner) sin cambiar arquitectura.
- **CI/CD**: push a `main` → GitHub Actions: lint + tests + build → imágenes
  `web` y `server` a GHCR → Watchtower en el VPS actualiza en ~2 min.
- **Bootstrap VPS**: script único `deploy/bootstrap.sh` (Docker, compose,
  firewall UFW, fail2ban) para pegar en el terminal de hPanel.
- Logs: `docker compose logs` + healthchecks; métricas básicas en fase 2.

## 10. Plan por fases

| Fase | Contenido | Criterio de éxito |
|---|---|---|
| **0. Esqueleto andante** | monorepo, CI/CD, deploy en VPS, sala con chat WS y voz LiveKit | 6 navegadores se ven y se oyen en una sala en producción |
| **1. Núcleo jugable** | motor sim, Pilotaje + Armamento + render 3D básico, 1 escenario hardcodeado | volar y destruir una nave IA entre 2 jugadores |
| **2. Puente completo** | Ingeniería, Ciencia, Comms, Capitán, plantillas de naves, daños/energía | partida coop completa de 6 jugadores |
| **3. Escenarios** | sandbox Lua, API EE subset, editor Monaco, subida .lua, biblioteca | un usuario crea y publica un escenario sin tocar el repo |
| **4. Beta pública** | pulido 3D, tutorial/onboarding, reconexión robusta, telemetría | sesiones con desconocidos sin intervención manual |

La fase 0 valida toda la cadena (código → GitHub → VPS → navegadores con voz)
antes de escribir lógica de juego: el riesgo de infraestructura se elimina
la primera semana.

## 11. Riesgos principales

1. **Alcance del motor**: EE tiene años de mecánicas. Mitigación: subset
   definido en §4.2/§5, y paridad incremental guiada por escenarios reales.
2. **Voz en producción** (NAT/firewalls): LiveKit con TURN integrado;
   probar desde redes móviles en fase 0.
3. **Lua hostil o infinito**: sandbox + presupuesto CPU por tick; matar y
   notificar, nunca tumbar la sala.
4. **3D ambicioso vs. tiempo**: pipeline completo desde el día 1, calidad de
   assets iterativa.
5. **Licencias**: código y assets propios o CC0; compatibilidad de API no
   implica copiar código GPL de EE. Los escenarios `.lua` de terceros los
   sube cada usuario bajo su responsabilidad.
