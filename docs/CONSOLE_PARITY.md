# Empty Epsilon Crew6 Console Architecture - Análisis Detallado

Análisis exhaustivo de las 5 consolas de tripulación en modo 6 jugadores de Empty Epsilon.
Basado en código fuente del directorio `/src/screens/crew6/` y `/src/screenComponents/`.

---

## 1. HELMS SCREEN (Consola de Timón)

### 1.1 Estructura General de Pantalla

**Dimensiones del viewport:** 1200×900 (unidades virtuales)

**Composición de elementos principales:**
- **Fondo**: Gradiente temático + patrón de cruces tiled (background.gradient + background.crosses)
- **Overlay de alerta**: AlertLevelOverlay renderiza overlay de color según nivel de alerta (rojo/amarillo/verde)
- **Radar circular centrado**: Ocupa ~800 unidades de altura, centrado en pantalla (Alignment::Center)
  - Rango: Short Range (5000 unidades típicamente)
  - Estilo: CIRCULAR
  - Rotación automática: Sincronizada con rotación de nave (enganchable en preferencias)
  - Ghost dots: HABILITADOS (puntos fantasmas que muestran movimiento pasado)
  - Waypoints: HABILITADOS (mostrar y editar)
  - Callsigns: HABILITADOS (mostrar identificadores de naves)
  - Heading indicators: HABILITADOS (líneas de proa)
  - Missile tube indicators: HABILITADOS (mostrar arcos de fuego de misiles)

**Panel información superior-izquierda** (20, 100 en TopLeft):
- Tamaño: 240×40 (energía)
- Tamaño: 240×40 (proa/heading)
- Tamaño: 240×40 (velocidad)
- Widgets: EnergyInfoDisplay, HeadingInfoDisplay, VelocityInfoDisplay
- Escala de fuente: 0.45 (fuente pequeña)

**Panel control motor inferior-izquierda** (20, -100 en BottomLeft):
- Tamaño: GuiSizeMax × 300
- Layout: HORIZONTAL
- Widgets:
  - GuiImpulseControls (100 ancho) → impulso -100% a +100%
    - Slider vertical invertido (abajo=adelante, arriba=atrás)
    - Snap a 0.0f con tolerancia ±0.1
    - Display: Impulse [0-100%]
  - GuiWarpControls (100 ancho) → warp levels 0-N (depende nave)
    - Slider vertical con snap a valores enteros
    - Display: Warp [0.0-X.X]
  - GuiJumpControls (100 ancho) → salto por hiperespacios

**Combat Maneuver Panel inferior-derecha** (−20, −20 en BottomRight):
- Tamaño: 280×215
- Componentes:
  - Barra de carga: Combat maneuver charge bar (gris 192,192,192,64)
  - Slider 2D (GuiSnapSlider2D):
    - Eje X: Strafe izq/der (−1.0 a +1.0)
    - Eje Y: Boost adelante/atrás (−1.0 a +1.0)
    - Centro: (0, 0) — descanso
    - Tamaño interior: 280×165
  - Power/Damage indicators para Maneuver y Impulse

**Docking Button** (20, −20 en BottomLeft):
- Tamaño: 280×50
- Visible SOLO si nave tiene DockingPort component
- Botón multiuso: mostrar lista de puertos de amarre disponibles

**Custom Ship Functions panel superior-derecha** (−20, 120 en TopRight):
- Tamaño: 250 × GuiSizeMax
- Botones dinámicos según definición de nave (scripts Lua)

**Heading Hint Label:**
- Etiqueta flotante que aparece mientras arrastras en radar
- Mostrada 50 píxeles debajo del cursor
- Muestra heading actual mientras dragging
- Se oculta al soltar

### 1.2 Inventario de Widgets - Helm

| Widget | Posición | Tamaño | Comportamiento |
|--------|----------|--------|-----------------|
| GuiRadarView | Center | GuiSizeMatchHeight, 800h | Circular short-range radar con rotación sincronizada |
| GuiCombatManeuver | BottomRight −20,−20 | 280×215 | Control 2D strafe/boost, muestra carga de maniobra táctica |
| GuiImpulseControls | BottomLeft, en layout | 100 wide | Slider vertical impulso, snap a neutro, display % |
| GuiWarpControls | BottomLeft, en layout | 100 wide | Slider vertical warp, snap enteros, display factor |
| GuiJumpControls | BottomLeft, en layout | 100 wide | Control salto hiperespacial (si nave lo tiene) |
| EnergyInfoDisplay | TopLeft 20,100 | 240×40 | Energía reactor actual (joules) |
| HeadingInfoDisplay | TopLeft 20,140 | 240×40 | Proa actual (0-360°) |
| VelocityInfoDisplay | TopLeft 20,180 | 240×40 | Velocidad actual (unidades/min) |
| GuiDockingButton | BottomLeft 20,−20 | 280×50 | Muestra estatus amarre y lista de puertos |
| GuiCustomShipFunctions | TopRight −20,120 | 250×? | Botones de funciones personalizadas (Lua) |
| AlertLevelOverlay | — | Full | Overlay de color según alerta (rojo=rojo, amarillo=amarillo, verde=verde) |

### 1.3 Interacciones del Radar - Helm

**Mouse Down (clic):**
- Calcula ángulo desde centro de nave a punto clickeado
- Rota posición al sistema de coordenadas del radar (si auto-rotating)
- Convierte coordenadas mundo a pantalla
- Muestra `heading_hint` con el ángulo objetivo
- Envía comando: `commandTargetRotation(angle)` - fija rumbo objetivo

**Mouse Drag (arrastrar):**
- Mismo cálculo que Mouse Down (actualiza continuamente)
- Rumbo se actualiza en tiempo real mientras se arrastra
- `heading_hint` se sigue mostrando y actualizando

**Mouse Up (soltar):**
- Envía comando final: `commandTargetRotation(angle)` con ángulo final
- Oculta `heading_hint`

**Keybinds:**
- `helms_turn_left` / `helms_turn_right`: Giro ±5°/frame mientras se mantiene presionada
- `helms_increase_impulse` / `helms_decrease_impulse`: Cambio impulso ±0.01
- `helms_combat_left` / `helms_combat_right`: Strafe ±1.0 (si combat maneuvering disponible)
- `helms_combat_boost`: Boost +1.0 (si combat maneuvering disponible)

### 1.4 Detalles Específicos - Helm

**Radar Lock Toggle (Preferencia):**
- Guardada en PreferenceManager: `"helms_radar_lock"` → "0" o "1"
- Si "1": radar gira con nave (north-up permanente)
- Si "0": radar gira, mostrando view relativo

**Combat Maneuver Charge:**
- Barra de progreso gris que muestra carga disponible
- Requiere componente CombatManeuveringThrusters
- Se recarga mientras se corre impulse/maneuver
- Máximo típicamente 100-200 HP

**Velocidad Máxima:**
- Impulso: −100% a +100% (atrás a adelante)
- Warp: 0 a N (dinámico según nave)
- Nota: Warp desactiva disparos de misiles

**Calibración/Alertas:**
- Sin calibración manual (autopilot automático)
- Alertas mostradas por AlertLevelOverlay (color fullscreen)
- Estados: RED (claxon) / YELLOW (cautela) / GREEN (normal)

---

## 2. WEAPONS SCREEN (Consola de Armas)

### 2.1 Estructura General de Pantalla

**Dimensiones del viewport:** 1200×900

**Composición de elementos principales:**
- **Fondo**: Gradiente temático + patrón de cruces (background.gradient + background.crosses)
- **Overlay de alerta**: AlertLevelOverlay
- **Radar circular centrado**: ~800 unidades de altura, centrado
  - Rango: Short Range (5000 unidades)
  - Estilo: CIRCULAR
  - Objetivo tracking: HABILITADO (targets container)
  - Target callsigns: HABILITADOS
  - Heading indicators: HABILITADOS
  - No ghost dots
  - Target projections: HABILITADAS (mostrar trayectorias predichas de proyectiles)
  - Missile tube indicators: HABILITADOS (arcos de fuego)

**Aim Lock Dial superpuesto** (encima del radar):
- Posición: Center, tamaño GuiSizeMatchHeight, 850h
- Rango: −90° a 270° (full circle)
- Muestra: línea roja de apuntamiento manual
- SOLO visible si: hay tubos de misiles Y aim manual está ACTIVO
- Rotación: El dial rota con el radar automático

**Missile Aim Lock Button** (250, 20 en TopCenter):
- Tamaño: 130×50
- Texto: "LOCK AIM" o "MANUAL AIM"
- Alterna entre aim automático (target) y manual (dial rotatorio)
- Visible SOLO si nave tiene MissileTubes

**Missile Tube Controls** (20, −20 en BottomLeft):
- Tamaño: GuiSizeMax × GuiSizeMax
- Layout: VERTICAL BOTTOM (filas ascendentes)
- Para cada tubo:
  - Fila con: Load/Fire buttons, loading bar, tube direction label
  - Load button: Carga misil del tipo seleccionado
  - Fire button: Dispara misil cargado (si tiene poder)
  - Loading bar: Progreso de carga (estado Loading/Unloading)
- Selector de tipo misil (arriba): Homing / Mine / EMP / Nuke / HVLI
- Estados visuales:
  - Empty → Load button enabled, Fire button deshabilitado (gris)
  - Loaded → Load button = "Unload", Fire button enabled
  - Loading → Fire button oculto, loading bar visible
  - Firing → Fire button deshabilitado, texto "FIRING"

**Weapons Stats Panel** (20, 100 en TopLeft):
- Tamaño: 240×120
- Layout: VERTICAL
- Widgets:
  - Energy Display: Energía reactor actual
  - Front Shield Display: Escudos delanteros [0-100%] (si componente Shields)
  - Rear Shield Display: Escudos traseros [0-100%] (si componente Shields)

**Beam Info Box** (−20, −120 en BottomRight):
- Tamaño: 280×150
- OCULTA por defecto, VISIBLE solo si:
  - Nave tiene BeamWeaponSys
  - Y (use_beam_shield_frequencies OR use_system_damage)
- Contenidos (si visible):
  - Etiqueta: "Beam info"
  - GuiPowerDamageIndicator para BeamWeapons
  - GuiBeamFrequencySelector (si use_beam_shield_frequencies)
    - Dropdown: Frecuencias disponibles (0-16)
    - Keybind: increase/decrease frequency
  - GuiBeamTargetSelector (si use_system_damage)
    - Dropdown: Hull o sistemas (Reactor, Shields, etc.)
    - Keybind: next/previous target system
- Si use_system_damage=true pero NOT use_beam_shield_frequencies:
  - Box reposicionada a (−20, −50) para evitar overlap con shields

**Shield Frequency Select o Shields Enable Button** (−20, −20 en BottomRight):
- Si use_beam_shield_frequencies:
  - GuiShieldFrequencySelect: Selector dropdown de frecuencias defensivas
  - Tamaño: 280×100
  - Dropdown: Frecuencias (0-16)
- Si NOT use_beam_shield_frequencies:
  - GuiShieldsEnableButton: Toggle on/off + barra de carga
  - Tamaño: 280×50
  - Display: Shields [%], recarga

**Custom Ship Functions panel** (−20, 120 en TopRight):
- Tamaño: 250 × GuiSizeMax
- Botones dinámicos según nave

### 2.2 Inventario de Widgets - Weapons

| Widget | Posición | Tamaño | Comportamiento |
|--------|----------|--------|-----------------|
| GuiRadarView | Center | GuiSizeMatchHeight, 800h | Short-range circular, target tracking |
| AimLock dial | Center | GuiSizeMatchHeight, 850h | Rotation dial manual −90° a 270° |
| AimLockButton | TopCenter 250,20 | 130×50 | Toggle manual/auto aim for missiles |
| GuiMissileTubeControls | BottomLeft 20,−20 | Full | Tube rows, load/fire buttons, ammo display |
| GuiKeyValueDisplay (Energy) | TopLeft 20,100 | 240×40 | Energy (joules) |
| GuiKeyValueDisplay (Front Shield) | TopLeft 20,140 | 240×40 | Front shields [%] |
| GuiKeyValueDisplay (Rear Shield) | TopLeft 20,180 | 240×40 | Rear shields [%] |
| GuiBeamFrequencySelector | BottomRight (in box) | 280 wide | Dropdown frecuencias (si enabled) |
| GuiBeamTargetSelector | BottomRight (in box) | 280 wide | Dropdown sistema objetivo (si enabled) |
| GuiShieldFrequencySelect o Enable | BottomRight −20,−20 | 280×(100 o 50) | Shields control (frequency o enable toggle) |
| GuiCustomShipFunctions | TopRight −20,120 | 250×? | Custom buttons |
| AlertLevelOverlay | — | Full | Overlay color alerta |

### 2.3 Interacciones del Radar - Weapons

**Mouse Down (clic en radar):**
- `targets.setToClosestTo(position, 250, TargetsContainer::Targetable)`
- Busca entidad targeteable más cercana a click en rango 250 unidades
- Si encuentra y hay nave propia:
  - `commandSetTarget(target_entity)` → fija como blanco
- Si no encuentra:
  - `commandSetTarget({})` → limpia blanco

**Mouse Drag:** No manejado especialmente (solo camera pan en relay)

**Mouse Up:** No manejado especialmente

**Mouse Wheel:** No manejado (no zoom en weapons)

**Keybinds en onUpdate():**
- `weapons_enemy_next_target`: Cicla al siguiente blanco hostil
- `weapons_next_target`: Cicla al siguiente blanco cualquiera
  - Búsqueda dentro de LongRangeRadar.short_range (5000u típicamente)
  - Ambos setean target y actualizan display
- `weapons_aim_left` / `weapons_aim_right`: Ajusta aim dial ±5°/frame
  - Solo si manual aim está activo
  - Envía `setMissileTargetAngle(new_angle)` a tube_controls

### 2.4 Detalles Específicos - Weapons

**Aim Lock Manual:**
- AimLock es GuiRotationDial (widget tipo rueda de timón)
- Rango: −90° a 270° (cubre full 360°)
- Callback al cambio: `tube_controls->setMissileTargetAngle(value)`
- Integración con AimLockButton:
  - On click: Toggle `tube_controls->manual_aim`
  - Si manual_aim=true: muestra dial AimLock
  - Si manual_aim=false: usa targeting automático del radar

**Frequency Calibration:**
- BeamFrequencySelector: Dropdown 0-BeamWeaponSys::max_frequency (típicamente 16)
- En keybind: `weapons_beam_frequency_increase` / `decrease`
  - Cicla circularmente (16→0, 0→16)
  - Envía `commandSetBeamFrequency(index)`
- ShieldFrequencySelect: Similar para escudos
  - Keybind: `weapons_shield_frequency_increase` / `decrease`

**Sistema de Daño Dinámico:**
- BeamTargetSelector: Dropdown con Hull + todos los sistemas
- Valor por defecto: Hull (−1)
- En keybind: `weapons_beam_subsystem_target_next` / `previous`
  - Cicla circularmente
  - Envía `commandSetBeamSystemTarget(ShipSystem::Type)`
- Mostrado solo si gameGlobalInfo->use_system_damage = true

**Alertas:**
- Power status en tube_controls: Si power_level ≤ 0, Fire button deshabilitado
- Warp active: Si warp->current > 0, Fire button deshabilitado (no disparar en warp)
- Health: Si system health ≤ 0, Load button deshabilitado

**Radar Preference:**
- `"weapons_radar_lock"` en PreferenceManager
- Funciona igual que helm (north-up si "1")

---

## 3. ENGINEERING SCREEN (Consola de Ingeniería)

### 3.1 Estructura General de Pantalla

**Dimensiones del viewport:** 1200×900

**Composición de elementos principales:**
- **Fondo**: Patrón de cruces tiled (background.crosses)
- **Overlay de alerta**: AlertLevelOverlay
- **Sistema de distribución de poder/refrigeración**: Panel central inferior

**Engineer Stats Panel** (20, 100 en TopLeft):
- Tamaño: 240×200
- Layout: VERTICAL
- Widgets:
  - EnergyInfoDisplay (si has_reactor)
  - HullInfoDisplay
  - ShieldsInfoDisplay (front, si presente)
  - ShieldsInfoDisplay (rear, si presente)
  - CoolantInfoDisplay (si has_coolant)

**Self Destruct Button** (20, 20 en TopLeft):
- Tamaño: 240×100
- VISIBLE SOLO si nave tiene SelfDestruct component
- 3-estado: Desarmado → Botón Activate → Armar → Botón Confirm/Cancel

**System Configuration Container** (0, −20 en BottomCenter):
- Tamaño: 750 + 300 (ancho total 1050) × GuiSizeMax
- Layout: BOTTOM CENTER
- Contiene dos secciones:

**System Rows** (rows dinámicas, una por sistema):
- Altura: 50 cada una
- Layout: HORIZONTAL
- Para cada sistema (Reactor, BeamWeapons, MissileSystem, Maneuver, Impulse, Warp, JumpDrive, FrontShield, RearShield):
  - Selector Button (300 ancho): Nombre sistema con icon
  - Damage Bar (150 ancho, si use_system_damage):
    - Barra progreso verde→rojo (0% a 100%)
    - Icon skull si health < 100%
    - Label: "[X]%"
  - Heat Arrow & Bar (100-150 ancho, si has_coolant):
    - Barra progreso azul (0-100°C)
    - Flecha indicador: Arriba=calentándose, Abajo=enfriándose
    - Icon overheating si heat > 90% y parpadea
  - Power Bar (100-150 ancho, color amarillo 192,192,32,128):
    - Slider progreso 0.0-3.0
    - Draggable en tiempo real
    - Snap values: 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0
  - Coolant Bar (100-150 ancho, color cyan 32,128,128,128, si has_coolant):
    - Slider progreso 0.0-10.0
    - Draggable
    - Tick mark a altura max_requested
    - Snap values: 0.0, 2.5, 5.0, 7.5, 10.0

**Icon Row** (bajo system rows):
- Altura: 48
- Filler (300 ancho)
- System health icon (150 ancho, si damage enabled)
- Heat icon (100-150 ancho, si coolant)
- Power icon (100-150 ancho)
- Coolant remaining slider (100-150 ancho, si coolant):
  - Progreso 0-max_coolant
  - Permite asignar coolant total disponible a sistemas
  - Al dragging, redistribuye coolant automáticamente

**Power/Coolant Control Box** (BottomRight 0, 0):
- Tamaño: 270×400
- Panel oscuro con label
- Vertical slider POWER (altura 360, rango 0-3.0):
  - Label izquierda: "Power: [current]% / [requested]%"
  - Snap points dinámicos
  - Deshabilitado si ningún sistema seleccionado
- Vertical slider COOLANT (altura 360, rango 0-10.0, si has_coolant):
  - Label izquierda: "Coolant: [current]% / [requested]%"
  - Snap points dinámicos
  - Deshabilitado si ningún sistema seleccionado
- Al cambiar: envía commandSetSystemPowerRequest() o commandSetSystemCoolantRequest()

**System Effects Container** (BottomRight 0, −400):
- Tamaño: 270×400
- Layout: VERTICAL BOTTOM
- Muestra efectos del sistema seleccionado:
  - Máxima salud (si < 100%)
  - Para Reactor: Energía/min
  - Para BeamWeapons: Firing rate %, turret rotation rate % (si turrets)
  - Para MissileSystem: Reload rate %
  - Para Maneuver: Turning speed %, combat recharge rate %
  - Para Impulse: Impulse speed %, combat recharge rate %
  - Para Warp: Warp drive speed %
  - Para JumpDrive: Time to jump activation, recharge rate %
  - Para Shields: Calibration speed %, charge rate %, damage negate %

**Ship Internal View** (bajo system rows):
- Tamaño: GuiSizeMax × GuiSizeMax
- Mostrada como grid de cuartos de nave
- Click en room: Selecciona sistema de ese room
- Muestra iconografía de reparaciones (tripulación en rooms)

**Custom Ship Functions panel** (−20, 120 en TopRight):
- Tamaño: 250 × GuiSizeMax

### 3.2 Inventario de Widgets - Engineering

| Widget | Posición | Tamaño | Comportamiento |
|--------|----------|--------|-----------------|
| EnergyInfoDisplay | TopLeft 20,100 | 240×40 | Energía actual (si reactor) |
| HullInfoDisplay | TopLeft 20,140 | 240×40 | Casco % integridad |
| ShieldsInfoDisplay (front) | TopLeft 20,180 | 240×40 | Escudos delanteros % |
| ShieldsInfoDisplay (rear) | TopLeft 20,220 | 240×40 | Escudos traseros % |
| CoolantInfoDisplay | TopLeft 20,260 | 240×40 | Coolant total disponible (si presente) |
| GuiSelfDestructButton | TopLeft 20,20 | 240×100 | 3-estado: ARM / CONFIRM / CANCEL |
| SystemRow buttons | BottomCenter | 300 wide × 50h | Selector dinámico, selecciona sistema |
| Damage Bar | SystemRow | 150 wide | Barra verde→rojo, health % |
| Heat Bar + Arrow | SystemRow | 100-150 wide | Barra azul, flecha indicador delta |
| Power Bar Slider | SystemRow | 100-150 wide | Amarillo, 0-3.0, draggable |
| Coolant Bar Slider | SystemRow | 100-150 wide | Cyan, 0-10, draggable, tick mark |
| Coolant Remaining Bar | Icon row | 100-150 wide | Cyan, distribución total |
| Power Slider (grandes) | BottomRight | 270×360 | Vertical, 0-3.0, snap points |
| Coolant Slider (grandes) | BottomRight | 270×360 | Vertical, 0-10, snap points (si coolant) |
| System Effects Display | BottomRight | 270×400 | KeyValue pairs dinámicos |
| GuiShipInternalView | Under rows | Full | Grid de cuartos, clickable |
| GuiCustomShipFunctions | TopRight −20,120 | 250×? | Custom buttons |

### 3.3 Interacciones - Engineering

**Click en System Row Button:**
- `selectSystem(ShipSystem::Type)`
- Activa sliders Power y Coolant grandes
- Muestra efectos del sistema en System Effects
- Botón se resalta (toggle visual)

**Drag Power Bar Slider (sistema seleccionado):**
- Rango: 0.0 a 3.0 (o 1.0 si no hay Reactor/Coolant)
- Snap points: 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0
- Envía: `commandSetSystemPowerRequest(system, value)`

**Drag Coolant Bar Slider (sistema seleccionado, si coolant):**
- Rango: 0.0 a 10.0
- Snap points: 0.0, 2.5, 5.0, 7.5, 10.0
- Envía: `commandSetSystemCoolantRequest(system, value)`

**Drag Coolant Remaining Bar:**
- Asigna cuánto coolant total está disponible vs reservado
- Al cambiar:
  1. Calcula coolant total usado en sistemas
  2. Si new_max < total_requested: Drena todos los sistemas proporcionalmente
  3. Si new_max > total_requested: Distribuye extra equitativamente

**Keybinds en onUpdate():**
- `engineering_select_system[n]`: Selecciona directo sistema N (0-9)
- `engineering_select_system_next` / `previous`: Navega sistemas
- `engineering_set_power_for_system[n]`: Asigna poder directo a sistema N (valor axis −1.0 a 1.0 → 0-3.0)
- `engineering_set_coolant_for_system[n]`: Asigna coolant directo a sistema N (valor axis → 0-max)
- `engineering_increase_power` / `decrease_power`: ±0.1 por frame
- `engineering_increase_coolant` / `decrease_coolant`: ±0.5 por frame
- `engineering_set_power_000` a `_300`: Hotkeys directos (0%, 30%, 50%, 100%, 150%, 200%, 250%, 300%)
- `engineering_set_power` / `engineering_set_coolant`: Axis directo (−1.0 a 1.0)

**Click en Ship Internal View (room):**
- Selecciona sistema correspondiente
- Si hay tripulación en room: Muestra repair crew visual
- Puede seleccionar/deseleccionar tripulación

### 3.4 Detalles Específicos - Engineering

**Sistema de Distribución Dinámica:**
- Power: 0-3.0 (3.0 = 300% = overclock permitido sin penalización si reactor presente)
  - Si sin Reactor: máximo 1.0 (100%)
- Coolant: 0-10.0 máximo por sistema
  - Total disponible: coolant->max (típicamente 100-200 unidades)
  - Cada sistema puede solicitar 0-10
  - Si solicitud total > max: redistribuye proporcionalmente

**Heat System (si coolant presente):**
- Cada sistema tiene heat_level (0-1.0)
- Heat se incrementa si power > 0 sin suficiente coolant
- Heat se decrementa si cooling activo
- Mostrado como barra azul con flecha:
  - Flecha arriba (rojo): heating_diff > 0
  - Flecha abajo (azul): heating_diff < 0
  - Flecha invisible: heat = 0 o no hay delta
- Icon parpadea si heat > 0.9

**Damage System (si use_system_damage):**
- Cada sistema tiene health (0-1.0)
- Health < 1.0 → barra roja + icon skull
- Health ≤ 0 → sistema "roto" (0% efectividad)
- Reparación: Solo via tripulación en Ship Internal View
- Si health < max_health: reduce efectividad del sistema (multiplicador)

**Calculus de Efectividad:**
- Reactor: output = (effectiveness × power_factor)^2 × power_factor_rate
  - Si effectiveness > 1.0: promedia (1.0 + effectiveness) × 0.5
- BeamWeapons: firing_rate % = effectiveness × 100
- MissileSystem: reload_rate % = effectiveness × 100
- Maneuver: turning_speed % = effectiveness × 100
- Impulse: impulse_speed % = effectiveness × 100
- Warp: warp_speed % = effectiveness × 100
- Shields: charge_rate % = effectiveness × 100

**Alertas Visuales:**
- Power status: Mostrado en grande en los sliders
- Heat status: Barra monta de rojo si > 90%
- Damage status: Barra roja si < 100%
- Coolant auto-level: Toggle para automático vs manual

---

## 4. SCIENCE SCREEN (Consola de Ciencias)

### 4.1 Estructura General de Pantalla

**Dimensiones del viewport:** 1200×900

**Composición de elementos principales:**
- **Fondo**: Gradiente offset themático + patrón de cruces (background.gradient_offset a posición 105, 0)
- **Overlay de alerta**: AlertLevelOverlay
- **Radar View Container** (elemento wrapper):
  - Contiene ambos radares (science & probe)

**Science Radar** (en radar_view):
- Posición: (120, 0) en CenterLeft
- Tamaño: 900 × GuiSizeMax
- Rango: LongRangeRadar.long_range si disponible (DEFAULT_MAX_ZOOM_DISTANCE sino)
- Estilo: CIRCULAR
- Fog of War: NebulaFogOfWar (niebla cosmética)
- Features:
  - Waypoints: HABILITADOS (mostrar ruta)
  - Callsigns: HABILITADOS
  - Heading indicators: HABILITADOS
  - Target proyections: NO
  - Missile tubes: NO

**Probe Radar** (en radar_view, OCULTO por defecto):
- Posición: (120, 0) en CenterLeft (mismo que science)
- Tamaño: 900 × GuiSizeMax
- Rango: PROBE_ZOOM_DISTANCE (100000 típicamente)
- Auto-centering: DESHABILITADO (puede panear manualmente)
- Fog of War: NoFogOfWar
- Features: Mismo que science radar
- Visible SOLO si RadarLink activo y probe seleccionado

**Raw Scanner Data Overlay:**
- Overlay gráfico sobre ambos radares
- Mostrar: Datos crudos de scanner (targets detectados por scanner)

**Sidebar Selector** (−20, 120 en TopRight):
- Tamaño: 250×50
- Tabs: "Scanning" / "Other"
- Toggle entre info_sidebar y custom_function_sidebar

**Info Sidebar** (−20, 170 en TopRight):
- Tamaño: 250 × GuiSizeMax
- Márgenes: 0, 0, 0, 75
- Layout: VERTICAL
- Contenidos:

**Scan Target Button:**
- Tamaño: 250×50
- Visible si nave tiene ScienceScanner
- Comando: Inicia scan del target actual

**Simple Scan Data (siempre mostrado si target):**
- Callsign
- Distance (en km)
- Bearing (−180 a 180°)
- Relative Speed (km/min)
- Faction (si SimpleScan o mejor)
- Type (si SimpleScan o mejor)
  - Type Button ("DB"): Abre database view
- Shields (si SimpleScan o mejor)
- Hull (si SimpleScan o mejor)

**Full Scan Data (si FullScan):**
- Sidebar Pager (tabs): Tactical / Systems / Description
  - **Tactical tab**: Mostrar GuiFrequencyCurve para shields y beams
    - Shield Frequency graph (mostrar qué frecuencias dañan vs protegen)
    - Beam Frequency graph (mostrar qué frecuencias dañan mejor)
  - **Systems tab**: Mostrar status de cada sistema del target
    - KeyValue display por sistema: "System: [0-100%]"
    - Color: Verde (100%) → Rojo (0%)
  - **Description tab**: Mostrar GuiScrollFormattedText con descripción

**Sidebar Pager:**
- Dropdown selector 3-4 tabs
- Dinámico según disponibilidad de datos

**Custom Function Sidebar** (−280, 170 en TopRight, si screen ancho):
- Tamaño: 250 × GuiSizeMax
- Posición alterna si screen < 1435 ancho: alterna visibility con info_sidebar

**Probe View Button** (20, −120 en BottomLeft):
- Tamaño: 200×50
- Toggle: Cambiar entre science radar y probe radar
- Deshabilitado si no hay RadarLink
- Automáticamente:
  - Oculta science_radar, muestra probe_radar
  - Centra probe_radar en posición de probe

**Radar Zoom Slider** (−20, −20 en BottomRight):
- Tamaño: 250×50
- Rango: LongRangeRadar.short_range a long_range
- Label: "1.0x" a "4.0x" (zoom multiplier)
- Draggable + mousewheel scroll
- Actualiza science_radar.setDistance()

**View Mode Selection** (20, −20 en BottomLeft):
- Tamaño: 200×100
- Tabs: "Radar" / "Database"
- Toggle entre radar_view y database_view
- Al cambiar: ocultar/mostrar background_gradient

**Database View** (OCULTO por defecto, full screen si visible):
- Tamaño: GuiSizeMax × GuiSizeMax
- Padding: 20
- Dos columnas:
  - Izquierda: item_list (listbox con nombres)
  - Derecha: details (keyvalue displays + descripción)
- Botón "Back": Volver a radar
- Padding dinámico si crew position selector visible

**Scanning Dialog** (overlay):
- Modal que aparece durante scan
- Muestra progreso de scan en tiempo real
- Oculta automaticamente cuando scan completo

**Custom Ship Functions panel** (−20, 210 en TopRight):
- Tamaño: 250 × GuiSizeMax
- Visible si sidebar_selector.index == 1 (tab "Other")

### 4.2 Inventario de Widgets - Science

| Widget | Posición | Tamaño | Comportamiento |
|--------|----------|--------|-----------------|
| GuiRadarView (science) | CenterLeft 120,0 | 900×Max | LongRange circular, fog-of-war nebula |
| GuiRadarView (probe) | CenterLeft 120,0 | 900×Max | HIDDEN, probe-centered, no FOW |
| RawScannerDataRadarOverlay | Over radar | — | Graphics crudos de scanner |
| GuiSelector (sidebar) | TopRight −20,120 | 250×50 | Tabs: Scanning / Other |
| GuiScanTargetButton | TopRight −20,170 | 250×50 | Initiate scan del target |
| GuiKeyValueDisplay (callsign) | Sidebar | 250×30 | Callsign del target |
| GuiKeyValueDisplay (distance) | Sidebar | 250×30 | Distancia en km |
| GuiKeyValueDisplay (bearing) | Sidebar | 250×30 | Rumbo 0-360° |
| GuiKeyValueDisplay (rel speed) | Sidebar | 250×30 | Velocidad relativa km/min |
| GuiKeyValueDisplay (faction) | Sidebar | 250×30 | Facción del target |
| GuiKeyValueDisplay (type) | Sidebar | 250×30 | Tipo nave + "DB" button |
| GuiKeyValueDisplay (shields) | Sidebar | 250×30 | Escudos % (si datos) |
| GuiKeyValueDisplay (hull) | Sidebar | 250×30 | Casco % (si datos) |
| GuiSelector (pager) | Sidebar | 250×50 | Tabs: Tactical / Systems / Description |
| GuiFrequencyCurve (shields) | Sidebar | 250×Max | Gráfico frecuencias defensivas |
| GuiFrequencyCurve (beams) | Sidebar | 250×Max | Gráfico frecuencias ofensivas |
| GuiKeyValueDisplay (systems) | Sidebar | 250×30 × N | Status por sistema (0-100%) |
| GuiScrollFormattedText (desc) | Sidebar | 250×Max | Descripción formateada del target |
| GuiToggleButton (probe view) | BottomLeft 20,−120 | 200×50 | Toggle probe radar visibility |
| GuiRadarZoomSlider | BottomRight −20,−20 | 250×50 | Zoom multiplier slider |
| GuiListbox (view mode) | BottomLeft 20,−20 | 200×100 | Tabs: Radar / Database |
| DatabaseViewComponent | Full screen | Max | Searchable ship database |
| GuiScanningDialog | Modal overlay | — | Scanning progress display |
| GuiCustomShipFunctions | TopRight −280,170 | 250×? | Custom buttons |

### 4.3 Interacciones del Radar - Science

**Mouse Down (clic en science radar):**
- Si scanner delay > 0: ignora clic
- `targets.setToClosestTo(position, 1000, TargetsContainer::Selectable)`
- Busca target seleccionable en rango 1000 unidades
- Actualiza sidebar con datos del nuevo target

**Mouse Wheel (en science radar):**
- Callback zoom: `doRadarZoom(value)`
  - `view_distance = clamp(distance × (1.0 - value × 0.1), short_range, long_range)`
  - `science_radar.setDistance(view_distance)`
  - `zoom_slider.setValue(view_distance)`

**Probe Radar (igual click behavior):**
- Si en probe view: click selecciona target desde perspectiva de probe
- Probe radar posición: auto-centra en probe transform

**Keybinds en onUpdate():**
- `science_scan_object`: Inicia scan del target (si scanner delay = 0)
  - Verifica si target es scannable
  - Si probe link activo: `commandScan(object, probe_entity)`
  - Sino: `commandScan(object)` solo
- `science_select_next_scannable`: Cicla al siguiente scannable object
  - Búsqueda en LongRangeRadar.long_range
  - Filtra: ESelectionType::Scannable (solo objetos escaneables)

### 4.4 Detalles Específicos - Science

**Scan States:**
- NotScanned (gris): Mostrar "?" y descripción not_scanned
- FriendOrFoeIdentified (amarillo): Identificación de facción
- SimpleScan (verde): Datos básicos (type, shields, hull, faction)
- FullScan (azul): Datos completos (sistemas, frecuencias, descripción)

**Frequency Graphs (si use_beam_shield_frequencies):**
- Shield Frequency: Curva que muestra damage taken vs frequency
  - Si enemy_has_equipment=false: "No shields" indicator
- Beam Frequency: Curva que muestra damage inflicted vs frequency
  - Si enemy_has_equipment=false: "No beams" indicator
- Interactivo: Mostrar valores al pasar cursor

**Database View:**
- Jerarquía: Main DB → Categorías → Subcategorías → Items
- "DB" button: Navega automáticamente a entry del target
- Back button: Retorna un nivel arriba
- Padding dinámico si screen tiene crew position selector

**Radar Lock Preference:**
- `"science_radar_lock"` en PreferenceManager
- Igual que helm/weapons

**Fog of War - Nebula:**
- Mostrar solo objetosescaneados/conocidos
- Neblina cosmética suaviza bordes
- Waypoints siempre visibles

**Responsive Layout:**
- Si screen.width < 1435: Sidebar selector visible, custom_functions oculto
- Si screen.width >= 1435: Ambos sidebars visibles simultáneamente

**Radar Block System:**
- RadarBlockSystem.isRadarBlockedFrom() checkea si target fuera del rango de radar
- Si bloqueado: limpia automáticamente target

---

## 5. RELAY SCREEN (Consola de Retransmisión)

### 5.1 Estructura General de Pantalla

**Dimensiones del viewport:** 1200×900

**Composición de elementos principales:**
- **Radar View** (RECTANGULAR fullscreen):
  - Posición: (0, 0) en TopLeft
  - Tamaño: GuiSizeMax × GuiSizeMax
  - Rango: MAX_ZOOM_DISTANCE
  - Estilo: RECTANGULAR (grid cuadrado)
  - Auto-centering: DESHABILITADO (pan manual)
  - Fog of War: FriendlysShortRangeFogOfWar (mostrar solo amigos/waypoints)
  - Features:
    - Waypoints: HABILITADOS (editable: click+drag para mover)
    - Callsigns: HABILITADOS
    - Heading indicators: NO
    - Target proyections: NO
    - Missile tubes: NO

**Sidebar Info** (−20, 150 en TopRight):
- Tamaño: 250 × GuiSizeMax
- Layout: VERTICAL
- Widgets:
  - Callsign display
  - Faction display

**Zoom Slider** (20, −70 en BottomLeft):
- Tamaño: 250×50
- Rango: MIN_ZOOM_DISTANCE a MAX_ZOOM_DISTANCE
- Label: "1.0x" a "10.0x" (zoom)
- Draggable + mousewheel

**Option Buttons Container** (20, 50 en TopLeft):
- Tamaño: 250 × GuiSizeMax
- Layout: VERTICAL
- Botones dinámicos (aparecen/desaparecen según modo):

**Cancel Mode Button** (20, 50 en TopLeft):
- Tamaño: 250×50
- OCULTO por defecto
- Visible en modo WaypointPlacement / LaunchProbe
- Cancela operación y vuelve a TargetSelection

**Open Comms Button:**
- Tamaño: 250×50
- Etiqueta: "Open comms" o "Link to comms" (si allow_comms=false)
- Abre comunicaciones con target
- Solo si target seleccionado y en rango de friendly

**Hack Target Button:**
- Tamaño: 250×50
- Etiqueta: "Start hacking"
- Deshabilitado si target no hackeable
- Condición hackeable: scanstate=NotScanned O relation != Friendly
- Click: Abre GuiHackingDialog

**Link to Science Button** (toggle):
- Tamaño: 250×50
- Etiqueta: "Link to science"
- Visible SOLO si:
  - Nave tiene LongRangeRadar
  - Nave tiene ScanProbeLauncher
  - Nave tiene RadarLink
- Toggle: Link/Unlink probe a science officer
- Deshabilitado si target no tiene AllowRadarLink

**Waypoint Place Button:**
- Tamaño: 250×50
- Etiqueta: "Place waypoint"
- Click: Modo → WaypointPlacement
  - Oculta option_buttons
  - Muestra cancel_button
  - Espera clic en radar para colocar waypoint

**Waypoint Delete Button:**
- Tamaño: 250×50
- Etiqueta: "Delete waypoint"
- Deshabilitado si target no es waypoint
- Click: Elimina waypoint actual

**Launch Probe Button:**
- Tamaño: 250×50
- Etiqueta: "Launch probe ({stock})"
- Visible si nave tiene ScanProbeLauncher
- Deshabilitado si stock = 0
- Click: Modo → LaunchProbe
  - Oculta option_buttons
  - Muestra cancel_button
  - Espera clic en radar para lanzar probe

**Center on Ship Button** (toggle):
- Tamaño: 250×50
- Etiqueta: "Center on ship"
- Toggle: Auto-centering radar en nave
- `radar.setAutoCentering(value)`

**Info Reputation Display:**
- Tamaño: 250×40
- KeyValue: "Reputation: [points]"

**Info Clock Display:**
- Tamaño: 250×40
- KeyValue: "Clock: [mission_time]"

**Alert Level Select** (−20, −70 en BottomRight):
- Tamaño: 300 × GuiSizeMax
- Layout: VERTICAL BOTTOM
- Dropdown: RED / YELLOW / GREEN alert level
- Controla estado alerta global de nave

**Hacking Dialog** (overlay modal):
- Tamaño: Variable
- Mostrada si target hackeando
- Mini-game de hacking (3 tipos: Simon Says, etc.)
- Mostrar progreso / éxito / fallo

**Comms Overlay** (si allow_comms=true):
- Full screen overlay
- Estados de comunicación:
  - Opening (progreso de conexión)
  - Hailed (recibe llamada, opciones Answer/Ignore)
  - Chat mode (text entry + scroll history)
  - Script mode (opciones de diálogo Lua)
  - Closed/Broken

**Ships Log** (si allow_comms=true):
- Overlay adicional
- Log histórico de transacciones/eventos

### 5.2 Inventario de Widgets - Relay

| Widget | Posición | Tamaño | Comportamiento |
|--------|----------|--------|-----------------|
| GuiRadarView | TopLeft 0,0 | Full | Rectangular, long-range, pan manual, friendlys fog |
| GuiKeyValueDisplay (callsign) | TopRight −20,150 | 250×30 | Callsign target o "−" |
| GuiKeyValueDisplay (faction) | TopRight −20,180 | 250×30 | Facción target o "−" |
| GuiRadarZoomSlider | BottomLeft 20,−70 | 250×50 | Zoom MIN-MAX |
| GuiOpenCommsButton | TopLeft 20,50 | 250×50 | Open comms (si enable) / Link to comms |
| GuiButton (hack) | TopLeft 20,100 | 250×50 | Start hacking (si hackeable) |
| GuiToggleButton (link science) | TopLeft 20,150 | 250×50 | Link to science (si probe launcher) |
| GuiButton (place waypoint) | TopLeft 20,200 | 250×50 | Place waypoint → modo WaypointPlacement |
| GuiButton (delete waypoint) | TopLeft 20,250 | 250×50 | Delete waypoint (si waypoint seleccionado) |
| GuiButton (launch probe) | TopLeft 20,300 | 250×50 | Launch probe → modo LaunchProbe (si ammo) |
| GuiToggleButton (center ship) | TopLeft 20,350 | 250×50 | Center on ship (toggle auto-center) |
| GuiKeyValueDisplay (reputation) | TopLeft 20,400 | 250×40 | Faction reputation points |
| GuiKeyValueDisplay (clock) | TopLeft 20,440 | 250×40 | Mission elapsed time |
| GuiAlertLevelSelect | BottomRight −20,−70 | 300×? | Dropdown: RED / YELLOW / GREEN |
| GuiHackingDialog | Modal | Variable | Mini-game interface, progress bar |
| GuiCommsOverlay | Full | Max | Chat / Script comms interface |
| ShipsLog | Full | Max | Transaction/event log (si comms) |

### 5.3 Interacciones del Radar - Relay

**Mouse Down (clic en radar):**
- Modo TargetSelection:
  - Si click cerca waypoint (< 1000u): Modo → MoveWaypoint
  - Sino: Modo → TargetSelection (busca target)
- Almacena mouse_down_position

**Mouse Drag (arrastar en radar):**
- Modo TargetSelection:
  - Pan radar: `radar.setViewPosition(view_pos - (current - previous))`
- Modo MoveWaypoint:
  - Mueve waypoint: `commandMoveWaypoint(waypoint_idx, new_pos)`

**Mouse Up (soltar):**
- Modo TargetSelection:
  - `targets.setToClosestTo(position, 1000, TargetsContainer::Targetable)`
  - Selecciona target cercano (o limpia si nada)
- Modo WaypointPlacement:
  - `commandAddWaypoint(position)`
  - Modo → TargetSelection
  - Muestra option_buttons
- Modo MoveWaypoint:
  - Modo → TargetSelection
  - `targets.setWaypointIndex(drag_idx)`
- Modo LaunchProbe:
  - `commandLaunchProbe(position)`
  - Modo → TargetSelection

**Mouse Wheel (scroll en radar):**
- Calcula view_distance nuevo: `clamp(distance × (1 - value × 0.1), MIN, MAX)`
- Preserva world coordinates bajo cursor:
  1. Captura world_pos antes de zoom
  2. Aplica zoom
  3. Ajusta view_position: mantiene same world_pos bajo cursor

**Keybinds en onDraw():**
- `zoom_in` / `zoom_out`: Adjust zoom (−0.1 × 0.1 factor)
  - Rango clamped a MIN_ZOOM_DISTANCE - MAX_ZOOM_DISTANCE

### 5.4 Detalles Específicos - Relay

**Estados de Modo:**
- TargetSelection (default): Selecciona targets o waypoints
- WaypointPlacement: Espera clic para colocar waypoint
- MoveWaypoint: Arrastra waypoint existente
- LaunchProbe: Espera clic para lanzar probe

**Waypoint Interaction:**
- Click cercano (< 1000u): Inicia drag
- Drag: Mueve en tiempo real
- Drop: Envía posición final
- Display: Símbolo diamond + label en radar

**Target Validity Check (en onDraw):**
- Chequea si target sigue en rango de friendly radar
- Para cada entity con ShareShortRangeRadar:
  - Si Friendly relation y target dentro short_range
  - Si no: limpia target y cierra hacking dialog

**Fog of War - Friendlys Short Range:**
- Mostrar solo:
  - Entities que están en short_range de amigos (5000u típico)
  - Waypoints (siempre)
  - Callsigns de amigos conocidos
- Oscurece entities fuera de rango

**Hacking Mechanics:**
- Open target via `hacking_dialog.open(target)`
- Selecciona sistema a hackear (dropdown)
- Mini-game (Simon Says, etc.):
  - Success: Inhabilita sistema en target
  - Failure: Incrementa alert level
- Progress bar: Tiempo para completar

**Comms Opening Sequence:**
- Hailed state: Recibe llamada (target iniciando comunicaciones)
- Answer / Ignore buttons
- Si Answer: entra Chat o Script mode
- Si Ignore: cierra dialog

**Responsive Behavior:**
- Si target deja de ser válido: automáticamente limpia
- Si probe link roto: desactiva link button
- Si ammo de probe agotado: desactiva launch button

**Radar Auto-Pan:**
- Si center_on_ship toggle ON: radar centra continuamente en nave
- Si OFF: pan manual persiste (usuario puede mover vista)

---

## APÉNDICE: Constantes y Configuración Global

### Tamaños y Rangos Estándar

```cpp
// Screen dimensions
VIEWPORT: 1200 × 900 (virtual units)

// Radar ranges
SHORT_RANGE_TYPICAL: 5000 units
LONG_RANGE_TYPICAL: 100000 units
PROBE_ZOOM_DISTANCE: 100000 units (relay)
MIN_ZOOM_DISTANCE: 1000 units (relay)
MAX_ZOOM_DISTANCE: 500000 units (relay)

// Power/Coolant
POWER_MAX: 3.0 (300% if reactor present, else 1.0)
COOLANT_MAX_PER_SYSTEM: 10.0
COOLANT_TOTAL_TYPICAL: 100-200 units

// Missile
MAX_MISSILE_TYPES: 5 (Homing, Mine, EMP, Nuke, HVLI)

// Frequency
BEAM_MAX_FREQUENCY: 16
SHIELD_MAX_FREQUENCY: 16

// Combat Maneuver
COMBAT_CHARGE_TYPICAL: 100-200 HP
STRAFE_RANGE: −1.0 to 1.0
BOOST_RANGE: −1.0 to 1.0

// Aim Lock
AIM_DIAL_RANGE: −90° to 270° (covers 360°)

// Repair
ROOM_SIZE_TYPICAL: 48 pixels (engineering view)
```

### Alignment Constants

```cpp
Alignment::TopLeft      → (0, 0)
Alignment::TopCenter    → (0.5, 0)
Alignment::TopRight     → (1.0, 0)
Alignment::CenterLeft   → (0, 0.5)
Alignment::Center       → (0.5, 0.5)
Alignment::CenterRight  → (1.0, 0.5)
Alignment::BottomLeft   → (0, 1.0)
Alignment::BottomCenter → (0.5, 1.0)
Alignment::BottomRight  → (1.0, 1.0)
```

### GuiSizeMax Behavior

```cpp
GuiSizeMax: Widget expands to fill available space
GuiSizeMatchHeight: Width matches container height (usado en radares)
setSize(GuiElement::GuiSizeMax, 50)
  → Width = container width, Height = 50
```

---

## RESUMEN DE PARITY ENTRE CONSOLAS

### Elementos Comunes

| Elemento | Helm | Weapons | Engineering | Science | Relay |
|----------|------|---------|-------------|---------|-------|
| Radar (tipo) | Circular SR | Circular SR | — | Circular LR | Rectangular LR |
| Alert Overlay | ✓ | ✓ | ✓ | ✓ | — |
| Custom Functions | ✓ | ✓ | ✓ | ✓ | ✓ |
| Info Display Panel | ✓ | ✓ | ✓ | ✓ | ✓ |
| Keybind Support | ✓ | ✓ | ✓ | ✓ | ✓ |

### Diferencias Clave

- **Helm**: Control navegación + velocidad (Impulse/Warp/Jump)
- **Weapons**: Control fuego + frecuencias + apuntamiento (aim lock)
- **Engineering**: Distribución poder/coolant + reparaciones
- **Science**: Escaneo + recopilación inteligencia + database
- **Relay**: Comunicaciones + táctico + comms/hacking

### Resolución de Conflictos

- Weapons y Helm comparten radar: diferentes callbacks (weapons=targeting, helm=heading)
- Engineering sin radar: visual de interior de nave
- Science vs Probe: pueden togglear radar secundario
- Relay panel ancho: responde a resize dinámico (sidebar toggle <1435px)

