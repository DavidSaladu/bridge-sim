-- Name: Emboscada en la nebulosa
-- Description: Oleadas Kraylor emergen de una nebulosa enorme. Sobrevive a las tres oleadas. Sin estación: administra bien la munición.

local wave = 0
local enemies = {}
local nextWaveAt = 10

local function aliveCount()
  local n = 0
  for _, e in ipairs(enemies) do
    if e:isValid() then n = n + 1 end
  end
  return n
end

local function spawnWave()
  wave = wave + 1
  enemies = {}
  globalMessage("¡Oleada " .. wave .. " detectada!")
  local count = wave + 1
  for i = 1, count do
    local ang = math.random() * 2 * math.pi
    local tpl = (wave >= 3 and i == 1) and "Phobos T3" or "Adder MK5"
    local e = CpuShip():setTemplate(tpl):setFaction("Kraylor")
      :setCallSign("W" .. wave .. "-" .. i)
      :setPosition(math.sin(ang) * 9000, 4000 + math.cos(ang) * 3000)
    table.insert(enemies, e)
  end
end

function init()
  Nebula():setPosition(0, 6000):setRadius(4500)
  for i = 1, 16 do
    local ang = math.random() * 2 * math.pi
    local d = 3000 + math.random() * 3000
    Asteroid():setPosition(math.sin(ang) * d, math.cos(ang) * d)
  end
  globalMessage("Algo se mueve dentro de la gran nebulosa…")
end

function update(delta)
  nextWaveAt = nextWaveAt - delta
  if wave == 0 and nextWaveAt <= 0 then
    spawnWave()
  elseif wave > 0 and wave < 3 and aliveCount() == 0 then
    spawnWave()
  elseif wave >= 3 and aliveCount() == 0 then
    victory("Human Navy")
  end
end
