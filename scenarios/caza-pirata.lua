-- Name: Caza del pirata
-- Description: Un Adder pirata se esconde entre las nebulosas con un cargamento robado. Encuéntralo con sondas y neutralízalo antes de 10 minutos.

local pirate
local TIME_LIMIT = 600

function init()
  SpaceStation():setCallSign("DS-1"):setPosition(0, -3000)
  Nebula():setPosition(8000, 4000):setRadius(3500)
  Nebula():setPosition(-7000, 6000):setRadius(3000)
  Nebula():setPosition(1000, 11000):setRadius(4000)
  for i = 1, 14 do
    local ang = math.random() * 2 * math.pi
    local d = 3000 + math.random() * 5000
    Asteroid():setPosition(math.sin(ang) * d, 4000 + math.cos(ang) * d)
  end
  -- El pirata empieza escondido en una nebulosa al azar
  local spots = { {8000, 4000}, {-7000, 6000}, {1000, 11000} }
  local spot = spots[math.random(1, 3)]
  pirate = CpuShip():setTemplate("Adder MK5"):setFaction("Kraylor")
    :setCallSign("CORSARIO"):setPosition(spot[1], spot[2])
  globalMessage("Un pirata se oculta en las nebulosas. Las sondas son tus ojos. 10 minutos.")
end

function update(delta)
  if pirate and not pirate:isValid() then
    victory("Human Navy")
  elseif getScenarioTime() > TIME_LIMIT then
    globalMessage("El pirata ha escapado con el cargamento…")
    victory("Kraylor")
  elseif getScenarioTime() > TIME_LIMIT - 60 and not warned then
    warned = true
    globalMessage("⏱ ¡Queda 1 minuto!")
  end
end
