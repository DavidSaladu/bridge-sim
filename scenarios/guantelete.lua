-- Name: El guantelete
-- Description: Duelos sucesivos contra naves cada vez más duras. Cinco victorias para superar el guantelete. DS-1 repara entre asaltos.

local current
local round = 0
local ROUNDS = { "Adder MK5", "Adder MK5", "Phobos T3", "Phobos T3", "Phobos T3" }

local function nextRound()
  round = round + 1
  local ang = math.random() * 2 * math.pi
  current = CpuShip():setTemplate(ROUNDS[round]):setFaction("Kraylor")
    :setCallSign("ASALTO-" .. round)
    :setPosition(math.sin(ang) * 6000, math.cos(ang) * 6000)
  globalMessage("Asalto " .. round .. " de 5: " .. ROUNDS[round] .. " entrante.")
end

function init()
  SpaceStation():setCallSign("DS-1"):setPosition(-2500, 0)
  for i = 1, 10 do
    local ang = math.random() * 2 * math.pi
    Asteroid():setPosition(math.sin(ang) * 4500, math.cos(ang) * 4500)
  end
  globalMessage("Bienvenidos al guantelete. Primer asalto en 15 segundos.")
end

function update(delta)
  if round == 0 then
    if getScenarioTime() > 15 then nextRound() end
  elseif current and not current:isValid() then
    if round >= 5 then
      victory("Human Navy")
    else
      globalMessage("Asalto superado. 20 segundos de tregua.")
      current = nil
      treguaHasta = getScenarioTime() + 20
    end
  elseif current == nil and treguaHasta and getScenarioTime() > treguaHasta then
    nextRound()
  end
end
