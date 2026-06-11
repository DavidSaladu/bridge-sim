-- Name: Primer contacto
-- Description: Dos cruceros Kraylor acechan el sector. Identifícalos, negocia o destrúyelos. La estación DS-1 ofrece reparaciones.

local kr7, kr12

function init()
  SpaceStation():setCallSign("DS-1"):setPosition(-1800, -1400)

  for i = 1, 24 do
    local ang = math.random() * 2 * math.pi
    local d = 2500 + math.random() * 4000
    Asteroid():setPosition(math.sin(ang) * d, math.cos(ang) * d)
  end

  Nebula():setPosition(6500, 1500):setRadius(3000)
  Nebula():setPosition(-4000, 7000):setRadius(2600)

  for i = 0, 7 do
    local ang = i / 8 * 2 * math.pi
    Mine():setPosition(6500 + math.sin(ang) * 3600, 1500 + math.cos(ang) * 3600)
  end

  kr7 = CpuShip():setTemplate("Phobos T3"):setFaction("Kraylor"):setCallSign("KR-7"):setPosition(7000, 1800)
  kr12 = CpuShip():setTemplate("Adder MK5"):setFaction("Kraylor"):setCallSign("KR-12"):setPosition(-2500, 3200)
  CpuShip():setTemplate("Flavia Falcon"):setFaction("Independent"):setCallSign("FT-3"):setPosition(-900, -2600)

  globalMessage("Sector Aldebarán: contactos sin identificar detectados.")
end

function update(delta)
  if kr7 and kr12 and not kr7:isValid() and not kr12:isValid() then
    victory("Human Navy")
  end
end
