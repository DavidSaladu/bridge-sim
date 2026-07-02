# Informe de compatibilidad Lua con Empty Epsilon

Generado por `scripts/compat-harness.mjs` contra 37 escenarios oficiales de EE.

- Escenarios que cargan e inician sin error (entorno instrumentado): **6/37**
- Cobertura de símbolos: globales **24/43**, métodos **32/56**

### Globales/constructores: 24/43 cubiertos (56%)

**Faltantes por uso (top 40):**

| Símbolo | Usos |
|---|---|
| `stockTemplate` | 49 |
| `createEntity` | 3 |
| `placeStation` | 2 |
| `y2` | 1 |
| `y1` | 1 |
| `WormHole` | 1 |
| `y` | 1 |
| `Artifact` | 1 |
| `starhammerV` | 1 |
| `atlantisY42` | 1 |
| `tyr` | 1 |
| `enforcer` | 1 |
| `cucaracha` | 1 |
| `maniapak` | 1 |
| `starhammerIII` | 1 |
| `gnat` | 1 |
| `farco11` | 1 |
| `racePoint2y` | 1 |
| `enemy_config_selection` | 1 |

### Métodos: 32/56 cubiertos (57%)

**Faltantes por uso (top 40):**

| Símbolo | Usos |
|---|---|
| `setBeamWeapon` | 10 |
| `setWeaponStorage` | 10 |
| `setWeaponStorageMax` | 9 |
| `setSystemPower` | 9 |
| `commandSetSystemPowerRequest` | 9 |
| `setDescriptionForScanState` | 5 |
| `addReputationPoints` | 4 |
| `setWeaponTubeCount` | 4 |
| `orderFlyFormation` | 3 |
| `sendCommsMessage` | 3 |
| `setScanningParameters` | 3 |
| `hasWarpDrive` | 1 |
| `addToShipLog` | 1 |
| `setTargetPosition` | 1 |
| `setWeaponTubeDirection` | 1 |
| `setTypeName` | 1 |
| `setRadarSignatureInfo` | 1 |
| `commandDock` | 1 |
| `commandTargetRotation` | 1 |
| `setRadarTraceColor` | 1 |
| `setJumpDrive` | 1 |
| `setWarpDrive` | 1 |
| `setLongRangeRadarRange` | 1 |
| `onDestroyed` | 1 |

### Escenarios con errores de ejecución en el harness

| Escenario | Fase | Error |
|---|---|---|
| scenario_00_basic.lua | init | [string "-- Name: Basic Battle..."]:386: attempt to perform arithmetic on a nil value (local 'cy')
stack traceback:
	[string "if type(init) == "function" then i |
| scenario_03_waves.lua | init | [string "-- Name: Waves..."]:69: attempt to perform arithmetic on a nil value (local 'y')
stack traceback:
	[string "if type(init) == "function" then init() end |
| scenario_05_beacon.lua | update | [string "-- Name: Beacon of Light series..."]:418: attempt to perform arithmetic on a nil value (local 'y1')
stack traceback:
	[string "-- Name: Beacon of Light |
| scenario_06_edgeofspace.lua | update | [string "-- Name: The Edge-of-Space..."]:751: attempt to perform arithmetic on a function value (global 'y1')
stack traceback:
	[string "-- Name: The Edge-of-Sp |
| scenario_08_atlantis.lua | init | [string "-- Name: Birth of the Atlantis..."]:160: bad argument #1 to 'format' (string expected, got table)
stack traceback:
	[string "-- Name: Birth of the Atla |
| scenario_27_liberation.lua | init | [string "-- Name: Liberation Day..."]:194: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Liberation Day..."]:61: in function 'ini |
| scenario_29_surf.lua | init | [string "-- Name: Surf's Up!..."]:252: attempt to perform arithmetic on a nil value (local 'station_y')
stack traceback:
	[string "-- Name: Surf's Up!..."]:58:  |
| scenario_30_brokenglass.lua | init | [string "-- Name: Broken Glass..."]:941: bad argument #1 to 'find' (string expected, got table)
stack traceback:
	[string "-- Name: Broken Glass..."]:941: in fu |
| scenario_31_payload.lua | init | [string "-- Name: Push The Payload..."]:45: attempt to perform arithmetic on a nil value
stack traceback:
	[string "if type(init) == "function" then init() end" |
| scenario_32_devour.lua | init | [string "-- Name: Planet Devourer..."]:69: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Planet Devourer..."]:45: in function ' |
| scenario_33_early.lua | init | [string "-- Name: Early Evaluation Exercise..."]:98: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Early Evaluation Exercise..."] |
| scenario_34_cadet.lua | carga | harness timeout (escenario gigante, omitido) |
| scenario_39_locusts.lua | init | [string "-- Name: Locust Swarm..."]:46: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Locust Swarm..."]:33: in function 'init'
	[ |
| scenario_44_outpost.lua | init | [string "-- Name: Doomed Outpost..."]:97: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Doomed Outpost..."]:72: in function 'in |
| scenario_47_scavenger.lua | init | [string "-- Name: Scurvy Scavenger..."]:199: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Scurvy Scavenger..."]:38: in function  |
| scenario_48_visitors.lua | init | [string "-- Name: Unwanted Visitors..."]:538: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Unwanted Visitors..."]:67: in functio |
| scenario_49_allies.lua | init | [string "-- Name: Allies and Enemies..."]:153: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Allies and Enemies..."]:44: in funct |
| scenario_50_gaps.lua | init | [string "-- Name: Close the Gaps..."]:279: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Close the Gaps..."]:40: in function 'ini |
| scenario_51_deliverAmbassador.lua | init | [string "-- Name: Deliver Ambassador Gremus..."]:89: attempt to index a nil value (field '?')
stack traceback:
	[string "if type(init) == "function" then init() |
| scenario_53_escape.lua | init | [string "-- Name: Escape..."]:292: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Escape..."]:33: in function 'init'
	[string "if  |
| scenario_54_PatrolDuty.lua | init | [string "-- Name: Delta quadrant patrol duty..."]:177: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Delta quadrant patrol duty.. |
| scenario_55_defenderHunter.lua | init | [string "-- Name: Defender Hunter..."]:96: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Defender Hunter..."]:77: in function 'in |
| scenario_56_carrierTurret.lua | init | [string "-- Name: Carrier and Fighters..."]:393: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Carrier and Fighters..."]:80: in f |
| scenario_57_shoreline.lua | init | [string "-- Name: Shoreline..."]:284: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Shoreline..."]:219: in function 'init'
	[stri |
| scenario_58_race.lua | init | [string "-- Name: Fermi 500..."]:432: attempt to perform arithmetic on a function value (global 'racePoint2y')
stack traceback:
	[string "if type(init) == "func |
| scenario_59_border.lua | init | [string "-- Name: Borderline Fever..."]:202: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Borderline Fever..."]:71: in functio |
| scenario_60_captureFlag.lua | init | [string "-- Name: Capture the Flag..."]:766: attempt to index a function value (global 'enemy_config_selection')
stack traceback:
	[string "-- Name: Capture the |
| scenario_62_whatTheDickens.lua | init | [string "-- Name: What the Dickens..."]:318: bad argument #1 to 'find' (string expected, got table)
stack traceback:
	[string "-- Name: What the Dickens..."]:31 |
| scenario_74_omicron.lua | init | [string "-- Name: The Omicron Plague..."]:87: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: The Omicron Plague..."]:62: in func |
| scenario_79_kessler.lua | init | [string "-- Name: Kessler..."]:432: bad argument #1 to 'floor' (number expected, got table)
stack traceback:
	[string "-- Name: Kessler..."]:432: in function 'p |
| scenario_81_pvp.lua | init | [string "-- Name: Clash in Shangri-La (PVP)..."]:419: bad argument #1 to 'cos' (number expected, got table)
stack traceback:
	[string "-- Name: Clash in Shangri |
| scenario_88_chaos.lua | init | [string "-- Name: Chaos of War..."]:96: attempt to index a nil value (field '?')
stack traceback:
	[string "-- Name: Chaos of War..."]:72: in function 'init'
	[ |

> Nota: el harness mide *demanda* de API (qué usan los escenarios). La lista de faltantes ordenada por uso es el burn-down de compatibilidad.
