/* The Data Center Boss — static game data (equipment, clients, events, quiz, glossary). */
(function (root) {
  const DCB = (root.DCB = root.DCB || {});

  DCB.CONFIG = {
    maxW: 12,
    maxH: 8,
    startW: 8,
    startH: 5,
    startMoney: 120000,
    startRep: 30,
    startGrid: 120, // kW utility feed
    roomTemp: 20, // °C supply air when fully cooled
    powerPrice: 0.12, // $ per kWh
    dieselPrice: 0.35, // $ per kWh generated on diesel
    carbonGrid: 0.4, // kg CO2 per kWh
    carbonGreen: 0.05,
    techSalary: 280, // $ per technician per day
    rentPerTile: 10, // $ per floor tile per day
    lightsKw: 3, // offices, lights, security
    repairHours: 8,
    tempWarn: 27, // ASHRAE recommended upper inlet temperature
    tempThrottle: 32,
    tempCritical: 38,
    bankruptcy: -50000,
    winCash: 1000000,
  };

  // heat defaults to power. radius uses Chebyshev distance (a square around the unit).
  DCB.EQUIPMENT = {
    rack: {
      name: 'Server Rack', cat: 'compute', cost: 8000, power: 5, compute: 10,
      desc: 'A 42U rack of general-purpose servers. +10 compute.',
      lesson: 'A standard rack holds 42 "rack units" (1U = 1.75 inches). A typical enterprise rack draws 5–10 kW.',
    },
    dense: {
      name: 'High-Density Rack', cat: 'compute', cost: 22000, power: 12, compute: 35,
      desc: 'Blade servers packed tight. +35 compute, but runs hot (12 kW).',
      lesson: 'Blade chassis pack many servers into one enclosure sharing power and fans. More compute per tile, but much more heat per tile.',
    },
    gpu: {
      name: 'GPU AI Rack', cat: 'compute', cost: 70000, power: 35, compute: 140, requires: 'liquid',
      desc: 'Accelerators for AI training. +140 compute, 35 kW! Needs liquid cooling nearby.',
      lesson: 'Modern AI racks can draw 40–130 kW. Air simply cannot carry that much heat away, so they use direct-to-chip liquid cooling.',
    },
    storage: {
      name: 'Storage Array', cat: 'compute', cost: 10000, power: 3, storage: 200,
      desc: 'Disk shelves. +200 TB of storage.',
      lesson: 'Storage arrays combine many drives. Spinning disks (HDD) are cheap per TB; flash (SSD) is faster but pricier.',
    },
    crac: {
      name: 'CRAC Unit', cat: 'cooling', cost: 9000, power: 0, heat: 0, idle: 1, cooling: 40, radius: 2, cop: 2.5,
      desc: 'Computer Room Air Conditioner. Removes 40 kW of heat within 2 tiles. COP 2.5.',
      lesson: 'CRAC units blow cold air under a raised floor or into the room. COP (coefficient of performance) 2.5 means 1 kW of electricity removes 2.5 kW of heat.',
    },
    inrow: {
      name: 'In-Row Cooler', cat: 'cooling', cost: 16000, power: 0, heat: 0, idle: 0.5, cooling: 35, radius: 1, cop: 4,
      desc: 'Sits right between racks. 35 kW within 1 tile, efficient (COP 4).',
      lesson: 'Putting cooling next to the heat source means fans move air a shorter distance, which saves a lot of energy.',
    },
    cdu: {
      name: 'Liquid Cooling CDU', cat: 'cooling', cost: 40000, power: 0, heat: 0, idle: 1, cooling: 120, radius: 1, cop: 8, liquid: true, requires: 'liquid',
      desc: 'Coolant Distribution Unit. 120 kW within 1 tile, super efficient (COP 8).',
      lesson: 'Water carries about 3,500× more heat than the same volume of air. Liquid cooling is how AI data centers keep up.',
    },
    crah: {
      name: 'CRAH (Chilled Water)', cat: 'cooling', cost: 11000, power: 0, heat: 0, cooling: 50, radius: 2, chw: true, fan: 2.5,
      desc: 'Computer Room Air Handler. Removes 50 kW within 2 tiles using chilled water from your chiller plant. Only its fans use power here; the chillers do the heavy lifting.',
      lesson: 'A CRAH has no compressor inside: it is a coil plus fans. Chilled water from a central plant absorbs the heat. Large sites use CRAHs because big central chillers are far more efficient than many small CRAC compressors.',
    },
    chiller_ac: {
      name: 'Air-Cooled Chiller', cat: 'plant', cost: 45000, power: 0, heat: 0, chwCap: 250, cop: 3.2,
      desc: 'Makes chilled water for CRAHs: 250 kW (71 tons). Rejects heat straight to outdoor air, so no water is used. COP 3.2, and it struggles in heat waves.',
      lesson: 'Chillers run a refrigeration cycle (compressor, condenser, expansion valve, evaporator) to make chilled water, typically around 7–15 °C. Air-cooled chillers are simpler and use no water, but are less efficient on hot days.',
    },
    chiller_wc: {
      name: 'Water-Cooled Chiller', cat: 'plant', cost: 70000, power: 0, heat: 0, chwCap: 400, cop: 6, needsTower: true,
      desc: 'High-efficiency centrifugal chiller: 400 kW (114 tons), COP 6. Needs a Cooling Tower to reject its heat.',
      lesson: 'Water-cooled centrifugal chillers are the most efficient way to make chilled water at scale, often 0.5–0.6 kW per ton. Their condenser water carries heat to a cooling tower.',
    },
    tower: {
      name: 'Cooling Tower', cat: 'plant', cost: 25000, power: 0, heat: 0, reject: 600, fan: 4,
      desc: 'Rejects up to 600 kW of heat from water-cooled chillers by evaporation. Uses water, so watch your WUE.',
      lesson: 'Cooling towers spray warm condenser water over fill media while a fan pulls air through. A little water evaporates, and evaporation carries away a lot of heat. That is why water-cooled plants save energy but consume water.',
    },
    switch: {
      name: 'Network Switch', cat: 'network', cost: 6000, power: 1, bw: 40,
      desc: 'Top-of-rack switching and uplinks. +40 Gbps bandwidth.',
      lesson: 'Bandwidth is how much data per second you can move. 1 Gbps ≈ 125 MB per second.',
    },
    firewall: {
      name: 'Firewall', cat: 'network', cost: 14000, power: 1, security: 1,
      desc: 'Filters malicious traffic. Blocks ransomware and absorbs most DDoS traffic. Banks require one.',
      lesson: 'Firewalls inspect traffic and block anything that does not match the rules. Defense in depth means layering several protections.',
    },
    bms: {
      name: 'BMS Controller', cat: 'controls', cost: 12000, power: 0.3, heat: 0, bmsCtl: true,
      desc: 'Building Management System. Unlocks the Controls screen: setpoints, plant sequences, alarms and trends. Gives early-warning alarms before equipment fails.',
      lesson: 'A BMS (also called a BAS) connects thousands of sensors, controllers and actuators, usually over BACnet. Operators watch graphics, alarms and trends, and control loops keep temperatures at setpoint 24/7.',
    },
    suppression: {
      name: 'Fire Detection & Suppression', cat: 'controls', cost: 18000, power: 0.3, heat: 0, fireSafe: true,
      desc: 'VESDA aspirating smoke detection plus clean-agent gas suppression. Catches fires early without drowning the servers in water.',
      lesson: 'VESDA (Very Early Smoke Detection Apparatus) samples air through pipes and can detect smoke before you can see or smell it. Clean agents put out fires without leaving water or residue on electronics.',
    },
    access: {
      name: 'Access Control & CCTV', cat: 'controls', cost: 8000, power: 0.2, heat: 0, accessCtl: true,
      desc: 'Badge readers, a mantrap and cameras. Stops intruders. Banks and governments require it.',
      lesson: 'Data centers layer physical security: fences, guards, badge plus PIN or biometrics, mantraps that let one person through at a time, and video surveillance tied to the access control system.',
    },
    ups: {
      name: 'UPS', cat: 'power', cost: 15000, power: 1, heat: 1, ups: 150,
      desc: 'Uninterruptible Power Supply. Batteries bridge up to 150 kW through power blips.',
      lesson: 'A UPS switches to batteries in milliseconds, so servers never notice a power blip. Batteries only last minutes, long enough for generators to start.',
    },
    generator: {
      name: 'Diesel Generator', cat: 'power', cost: 28000, power: 0.5, heat: 0, gen: 250,
      desc: 'Backup generator. Carries up to 250 kW during long outages (fuel $0.35/kWh).',
      lesson: 'Generators take 10–15 seconds to start and stabilize. Without a UPS to cover that gap, the servers crash anyway.',
    },
  };

  DCB.heatOf = (d) => (d.heat !== undefined ? d.heat : d.power);

  DCB.CATEGORIES = [
    { id: 'compute', name: 'Compute & Storage' },
    { id: 'cooling', name: 'Room Cooling (HVAC)' },
    { id: 'plant', name: 'Chiller Plant (HVAC)' },
    { id: 'power', name: 'Backup Power' },
    { id: 'network', name: 'Network & Security' },
    { id: 'controls', name: 'Controls, Fire & Security' },
  ];

  DCB.UPGRADES = {
    containment: {
      name: 'Hot/Cold Aisle Containment', cost: 25000, icon: '🧱',
      desc: 'All cooling units remove 25% more heat.',
      lesson: 'Racks face each other so cold air goes in the front and hot air leaves the back. Walls and doors keep hot and cold air from mixing, which makes cooling far more effective.',
    },
    virtualization: {
      name: 'Virtualization', cost: 35000, icon: '🧩',
      desc: 'Run many virtual machines per server: +30% compute from every rack.',
      lesson: 'Most physical servers sit idle much of the time. A hypervisor runs many virtual machines on one server, raising utilization from roughly 15% to over 60%.',
    },
    raid: {
      name: 'RAID & Backups', cost: 20000, icon: '💽',
      desc: 'Disk failures cause no data loss, and ransomware recovery is much faster.',
      lesson: 'RAID spreads data across several disks so one can die without losing data. The 3-2-1 rule: 3 copies, on 2 kinds of media, with 1 off-site.',
    },
    freeair: {
      name: 'Free-Air Economizer', cost: 30000, icon: '🌬️',
      desc: 'Uses cool outside air when it is cold out. Up to 60% less cooling power.',
      lesson: 'When it is cool outside, you can pull in filtered outdoor air instead of running compressors. That is why many data centers are built in cold climates.',
    },
    liquid: {
      name: 'Liquid Cooling Loop', cost: 60000, icon: '💧',
      desc: 'Plumbs chilled water to the floor. Unlocks Liquid CDUs and GPU AI Racks.',
      lesson: 'Direct-to-chip cooling pipes coolant through cold plates on top of CPUs and GPUs, taking heat straight from the source.',
    },
    dcim: {
      name: 'DCIM Monitoring', cost: 18000, icon: '📡',
      desc: 'Sensors everywhere. Equipment fails 40% less often (predictive maintenance).',
      lesson: 'Data Center Infrastructure Management software tracks power, temperature and health of every device, so you can fix problems before they cause outages.',
    },
    dualfiber: {
      name: 'Diverse Fiber Paths', cost: 22000, icon: '🛰️',
      desc: 'Two carriers entering from different sides of the building. Fiber cuts no longer take you offline.',
      lesson: 'Backhoes cut buried fiber surprisingly often. Having two carriers whose cables arrive by different routes is a classic redundancy practice.',
    },
    vfd: {
      name: 'Variable Frequency Drives', cost: 20000, icon: '🎚️',
      desc: 'Fans, pumps and tower fans slow down to match the load instead of running flat out.',
      lesson: 'Fan affinity laws: power rises with the cube of speed. A fan at 50% speed uses only about 12.5% of full power. VFDs are among the best-paying energy upgrades in any building.',
    },
    wse: {
      name: 'Waterside Economizer', cost: 35000, icon: '🔄',
      desc: 'A plate heat exchanger lets cold cooling-tower water make chilled water directly, so chillers can rest on cool days. Needs a Cooling Tower.',
      lesson: 'When outdoor wet-bulb temperature is low, the tower alone can make water cold enough. The BMS switches the plant into "free cooling" mode and turns chillers off. A higher chilled water setpoint means more free-cooling hours.',
    },
    optimizer: {
      name: 'Central Plant Optimization', cost: 30000, icon: '🧠',
      desc: 'Software on your BMS continuously tunes chiller, pump and tower setpoints: 12% less plant energy. Needs an online BMS.',
      lesson: 'Plant optimization software models the whole chilled water plant and picks the combination of chillers, pump speeds and tower setpoints that uses the least total power, minute by minute.',
    },
    commissioning: {
      name: 'Retro-Commissioning', cost: 15000, icon: '📋',
      desc: 'Engineers test every sequence and fix what drifted: 8% less cooling energy.',
      lesson: 'Commissioning (Cx) verifies that HVAC and controls work as designed. Over time, sensors drift and overrides get left on. Retro-commissioning typically saves 5–15% of energy.',
    },
    renewable: {
      name: 'Renewable Energy PPA', cost: 45000, icon: '☀️',
      desc: 'Buy wind and solar power at a fixed $0.13/kWh. Price spikes can no longer hurt you, and carbon drops 85%. Earns reputation.',
      lesson: 'A Power Purchase Agreement lets a company buy clean energy from a wind or solar farm at a locked-in price for 10–20 years.',
    },
  };

  // Client contract templates. sla is in percent.
  DCB.CLIENTS = [
    { id: 'bakery', name: "Rosie's Bakery Website", icon: '🥐', compute: 2, storage: 5, bw: 1, sla: 99, pay: 260, days: [20, 40], minRep: 0 },
    { id: 'blog', name: 'Retro Gaming Blog', icon: '👾', compute: 3, storage: 10, bw: 3, sla: 99, pay: 380, days: [20, 40], minRep: 0 },
    { id: 'school', name: 'School District Portal', icon: '🏫', compute: 6, storage: 25, bw: 4, sla: 99.5, pay: 750, days: [30, 60], minRep: 15 },
    { id: 'indie', name: 'Indie Game Studio', icon: '🎮', compute: 10, storage: 20, bw: 6, sla: 99.5, pay: 1150, days: [20, 45], minRep: 20 },
    { id: 'shop', name: 'Online Sneaker Store', icon: '👟', compute: 14, storage: 30, bw: 8, sla: 99.9, pay: 1800, days: [30, 60], minRep: 30 },
    { id: 'uni', name: 'University Research Lab', icon: '🎓', compute: 30, storage: 120, bw: 4, sla: 99, pay: 2600, days: [30, 60], minRep: 30 },
    { id: 'stream', name: 'Video Streaming Service', icon: '🎬', compute: 25, storage: 400, bw: 60, sla: 99.9, pay: 4600, days: [30, 60], minRep: 45 },
    { id: 'hospital', name: 'Hospital Health Records', icon: '🏥', compute: 12, storage: 150, bw: 4, sla: 99.99, pay: 3600, days: [30, 60], minRep: 50, needs: 'firewall' },
    { id: 'social', name: 'Social Media App', icon: '📱', compute: 60, storage: 250, bw: 50, sla: 99.9, pay: 8200, days: [30, 60], minRep: 55 },
    { id: 'bank', name: 'National Bank', icon: '🏦', compute: 40, storage: 80, bw: 8, sla: 99.99, pay: 8000, days: [40, 80], minRep: 60, needs: ['firewall', 'access'] },
    { id: 'pharma', name: 'Pharma Research Co.', icon: '💊', compute: 45, storage: 250, bw: 6, sla: 99.9, pay: 7000, days: [40, 70], minRep: 55, needs: ['access', 'suppression'] },
    { id: 'ai', name: 'Frontier AI Lab', icon: '🤖', compute: 260, storage: 300, bw: 20, sla: 99.9, pay: 36000, days: [30, 60], minRep: 65 },
    { id: 'gov', name: 'Government Agency', icon: '🏛️', compute: 50, storage: 200, bw: 10, sla: 99.99, pay: 11000, days: [60, 90], minRep: 75, needs: ['firewall', 'access', 'suppression'] },
  ];

  DCB.EVENTS = {
    outage: {
      title: 'Utility Power Outage!', icon: '⚡', weight: 10,
      text: 'A storm knocked out the power grid in your area. The lights just flickered…',
      lesson: 'Real data centers survive outages with a chain: UPS batteries take over instantly, then diesel generators start within seconds and run until the grid comes back.',
    },
    squirrel: {
      title: 'Squirrel Attack!', icon: '🐿️', weight: 5,
      text: 'A squirrel chewed through a cable at the local substation. Power is out.',
      lesson: 'This really happens! Squirrels and other animals cause a surprising share of power outages in the US every year.',
    },
    heatwave: {
      title: 'Heat Wave', icon: '🌡️', weight: 7,
      text: 'Outside temperatures are soaring for the next two days. Your chillers are working harder and cooling less.',
      lesson: 'Cooling equipment rejects heat to the outside air. The hotter it is outside, the harder (and less efficiently) it has to work.',
    },
    ddos: {
      title: 'DDoS Attack!', icon: '🌊', weight: 7,
      text: 'A botnet is flooding one of your clients with junk traffic, eating your bandwidth.',
      lesson: 'A Distributed Denial of Service attack uses thousands of hijacked devices to flood a target. Spare bandwidth and filtering (firewalls, scrubbing services) are the defense.',
    },
    fiber: {
      title: 'Fiber Cut!', icon: '🚜', weight: 5,
      text: 'A construction crew dug straight through your fiber-optic line.',
      lesson: 'Network engineers joke that the biggest threat to the internet is the backhoe. Diverse paths from different carriers are the fix.',
    },
    disk: {
      title: 'Disk Failure', icon: '💥', weight: 7,
      text: 'A hard drive in one of your storage arrays just died with a loud click.',
      lesson: 'Drives fail all the time. At scale, around 1–2% of hard drives die each year. RAID and backups turn a disaster into a routine swap.',
    },
    ransomware: {
      title: 'Ransomware Attempt', icon: '🦠', weight: 4,
      text: 'A phishing email tricked an employee, and ransomware is trying to encrypt your systems!',
      lesson: 'Ransomware encrypts files and demands payment. Good backups mean you can restore instead of paying, and firewalls stop many attacks at the door.',
    },
    spike: {
      title: 'Viral Traffic Spike!', icon: '🚀', weight: 6,
      text: 'One of your clients went viral! Demand for compute is up 40% for the next 12 hours.',
      lesson: 'Traffic can spike suddenly. Keeping spare capacity ("headroom") or being able to scale quickly is what lets services stay up during their big moment.',
    },
    pricespike: {
      title: 'Energy Price Spike', icon: '💸', weight: 5,
      text: 'Wholesale electricity prices tripled for the next 3 days.',
      lesson: 'Electricity is often the largest operating cost of a data center. Efficiency (low PUE) and fixed-price contracts protect you.',
    },
    cosmic: {
      title: 'Cosmic Ray Bit Flip', icon: '☄️', weight: 3,
      text: 'A high-energy particle from space flipped a bit in a server’s memory. ECC memory detected and fixed it.',
      lesson: 'Cosmic rays really do flip bits in RAM. ECC (Error-Correcting Code) memory detects and repairs single-bit errors, which is why servers use it.',
    },
    sale: {
      title: 'Vendor Flash Sale', icon: '🏷️', weight: 4,
      text: 'Your hardware vendor is clearing inventory: 25% off all equipment for the next 24 hours!',
      lesson: 'Hardware often gets a "refresh" every 3–5 years, since newer chips do much more work per watt.',
    },
    journalist: {
      title: 'Journalist Wants a Tour', icon: '📰', weight: 3,
      text: 'A tech journalist wants to write about your data center. Letting them in is good publicity, but they will write about what they see.',
      lesson: 'Real data centers have strict physical security: badges, mantraps, biometric scanners and cameras. Visitors are always escorted.',
      choices: ['Give the tour', 'Politely decline'],
    },
    fire: {
      title: 'Smoke Detected!', icon: '🔥', weight: 4,
      text: 'A power supply inside one of your racks overheated and started to smolder.',
      lesson: 'Data center fire protection has two jobs: detect very early (aspirating smoke detection) and suppress without destroying the equipment (clean agents or pre-action sprinklers that only fill with water when needed).',
    },
    intruder: {
      title: 'Intruder Alert', icon: '🕵️', weight: 3,
      text: 'Someone tailgated a delivery driver through the loading dock and is heading for your server hall.',
      lesson: 'Physical security is part of cybersecurity: someone with hands on a server can bypass most digital protections. Integrated access control and video let security respond in seconds.',
    },
    chiller_trip: {
      title: 'Chiller Tripped', icon: '🧊', weight: 5,
      text: 'A chiller shut itself down on a high-pressure safety fault.',
      lesson: 'Critical plants are designed N+1: enough spare chiller capacity that any one unit can fail or be serviced while the rest carry the load. A BMS restarts and re-stages chillers automatically.',
    },
    demand_response: {
      title: 'Utility Demand Response', icon: '🏭', weight: 4,
      text: 'The grid is stressed this afternoon. The utility will pay you to cut load for 4 hours by raising cooling setpoints 3 °C.',
      lesson: 'Demand response programs pay buildings to reduce power during grid peaks. A BMS can do it automatically: raise setpoints, pre-cool, or shift load, all within safe limits.',
      choices: ['Enroll: shed load via BMS', 'Decline'],
    },
    crypto: {
      title: 'Crypto Miner Offer', icon: '⛏️', weight: 3,
      text: 'A crypto-mining company offers $15,000 cash right now to use your spare power for a week. It will cost reputation with environmentally conscious clients.',
      lesson: 'Proof-of-work mining uses huge amounts of electricity. Bitcoin mining alone uses about as much power as a mid-sized country.',
      choices: ['Take the money', 'No thanks'],
    },
  };

  DCB.QUIZ = [
    { q: 'One "ton" of refrigeration equals how much cooling?', a: ['1,000 kg of ice per hour', 'About 3.5 kW (12,000 BTU/h)', '1 kW', '100 kW'], c: 1,
      e: 'One ton is 12,000 BTU/h ≈ 3.517 kW: the heat needed to melt one short ton of ice in 24 hours. Chillers in the US are sized in tons.' },
    { q: 'For a chiller plant, is a LOWER or HIGHER kW/ton better?', a: ['Lower', 'Higher', 'It does not matter', 'Exactly 1.0 is ideal'], c: 0,
      e: 'kW/ton = electricity used per ton of cooling delivered. A great water-cooled plant runs around 0.5–0.6 kW/ton; older plants can exceed 1.0.' },
    { q: 'What is the key difference between a CRAC and a CRAH?', a: ['CRAHs are bigger', 'A CRAH uses chilled water from a plant; a CRAC has its own compressor', 'CRACs use water', 'There is no difference'], c: 1,
      e: 'CRAC = Computer Room Air Conditioner (self-contained refrigerant/compressor). CRAH = Computer Room Air Handler (coil + fans fed by central chilled water).' },
    { q: 'By the fan affinity laws, a fan slowed to 50% speed uses roughly what share of full power?', a: ['50%', '25%', '12.5%', '90%'], c: 2,
      e: 'Power scales with the cube of speed: 0.5³ = 0.125. That is why Variable Frequency Drives save so much energy.' },
    { q: 'How does a cooling tower mainly reject heat?', a: ['Radiation into space', 'Evaporating a small amount of water', 'Burning fuel', 'Magnetism'], c: 1,
      e: 'Evaporating water absorbs a lot of heat. Towers are efficient, but they consume water, which is measured as WUE (Water Usage Effectiveness).' },
    { q: 'What does a waterside economizer do?', a: ['Saves water by turning off towers', 'Uses cold tower water to make chilled water so chillers can turn off', 'Heats the building in winter', 'Filters the water'], c: 1,
      e: 'When it is cold outside, cooling-tower water can cool the chilled water loop through a heat exchanger. This is "free cooling" with chillers off.' },
    { q: 'What is BACnet?', a: ['A backup network cable', 'An open communication protocol for building automation', 'A type of chiller', 'A fire code'], c: 1,
      e: 'BACnet (Building Automation and Control networks, ASHRAE Standard 135) lets controllers, sensors and equipment from different vendors talk to each other.' },
    { q: 'In a PID control loop, what does the controller try to minimize?', a: ['The error between setpoint and measured value', 'The number of sensors', 'Network traffic', 'Maintenance cost'], c: 0,
      e: 'Proportional-Integral-Derivative control constantly adjusts an output (valve, fan speed) to drive the error between setpoint and measurement to zero.' },
    { q: 'What usually happens to cooling energy if you raise the supply air setpoint from 20 °C to 24 °C (still within ASHRAE limits)?', a: ['It goes up', 'It goes down', 'No change', 'The chillers explode'], c: 1,
      e: 'Warmer setpoints let chillers run more efficiently and allow more economizer hours. Many data centers now run 24–27 °C supply air.' },
    { q: 'Why do data centers prefer clean-agent fire suppression over ordinary sprinklers?', a: ['It is cheaper', 'It puts out fires without water damage to electronics', 'It is louder', 'Sprinklers are illegal'], c: 1,
      e: 'Clean agents (inert gases or engineered chemicals) extinguish fires and leave no residue, so the rest of the servers survive.' },
    { q: 'What is a "deadband" in HVAC controls?', a: ['A broken sensor', 'A range around the setpoint where no action is taken, to avoid short-cycling', 'A radio frequency', 'A type of duct'], c: 1,
      e: 'Deadbands stop equipment from rapidly switching on and off (short-cycling), which wastes energy and wears out compressors.' },
    { q: 'What is a "sequence of operations"?', a: ['A written description of exactly how the control system should run the equipment', 'The order servers boot in', 'A maintenance schedule', 'A tax form'], c: 0,
      e: 'The sequence of operations tells controls programmers and commissioning agents how every mode should behave: startup, staging, economizer, alarms and failure responses.' },
    { q: 'What does commissioning (Cx) verify?', a: ['That the building was paid for', 'That systems perform as designed', 'That staff are trained in first aid', 'That the paint is dry'], c: 1,
      e: 'Commissioning tests equipment and controls against the design intent before handover and periodically afterwards (retro-commissioning).' },
    { q: 'With several chillers of different efficiency, which should the BMS load first?', a: ['The oldest', 'The most efficient', 'The noisiest', 'All equally, always'], c: 1,
      e: 'Chiller staging sequences run the most efficient machines first and add others only as load rises, lowering plant kW/ton.' },
    { q: 'Why does an air-cooled chiller use more power on a hot afternoon?', a: ['The water gets thicker', 'It must reject heat into hotter air, so the compressor works against a higher pressure', 'Servers run faster when hot', 'It does not'], c: 1,
      e: 'Higher outdoor temperature raises the condensing temperature and the compressor "lift". Water-cooled chillers suffer less because tower water stays cooler than the air.' },
    { q: 'What does WUE measure?', a: ['Wi-Fi usage', 'Liters of water used per kWh of IT energy', 'Wind speed', 'Work units per employee'], c: 1,
      e: 'Water Usage Effectiveness (L/kWh) is the water counterpart to PUE. Evaporative cooling improves PUE but raises WUE: a classic trade-off.' },
    { q: 'What does PUE stand for?', a: ['Power Usage Effectiveness', 'Peak Utility Energy', 'Processor Utilization Efficiency', 'Power Unit Exchange'], c: 0,
      e: 'PUE = total facility power ÷ IT equipment power. A perfect score is 1.0; the industry average is about 1.5.' },
    { q: 'A data center uses 150 kW total, and its servers use 100 kW. What is its PUE?', a: ['0.67', '1.5', '2.5', '50'], c: 1,
      e: '150 ÷ 100 = 1.5. So 50 kW goes to cooling, lights and power losses.' },
    { q: 'Roughly how much downtime per year does "four nines" (99.99%) uptime allow?', a: ['About 52 minutes', 'About 9 hours', 'About 3.6 days', 'Zero'], c: 0,
      e: '99.99% of a year is 52.6 minutes of downtime. 99.9% allows ~8.8 hours; 99.999% ("five nines") only ~5 minutes!' },
    { q: 'Where does almost all the electricity used by a server end up?', a: ['Stored in the hard drives', 'As heat', 'Sent over the network', 'Back in the power grid'], c: 1,
      e: 'Nearly every watt a server consumes becomes heat. That is why cooling is such a huge job.' },
    { q: 'What is the main job of a UPS?', a: ['Deliver packages', 'Bridge power instantly until generators start', 'Cool the servers', 'Speed up the network'], c: 1,
      e: 'An Uninterruptible Power Supply keeps power flowing on batteries for the seconds or minutes before generators take over.' },
    { q: 'What does "N+1" redundancy mean?', a: ['One more unit than you need', 'Only one unit total', 'Double everything', 'Each server has one fan'], c: 0,
      e: 'If you need N cooling units, you install N+1 so any single one can fail (or be serviced) without problems.' },
    { q: 'What inlet air temperature range does ASHRAE recommend for servers?', a: ['0–10 °C', '18–27 °C', '30–40 °C', '45–55 °C'], c: 1,
      e: 'ASHRAE recommends 18–27 °C (64–81 °F). Running warmer within that range saves cooling energy.' },
    { q: 'In hot/cold aisle containment, where do racks pull air in?', a: ['From the hot aisle', 'From the cold aisle', 'From the ceiling only', 'From outside'], c: 1,
      e: 'Racks take in cold air from the front (cold aisle) and exhaust hot air out the back (hot aisle).' },
    { q: 'What does RAID help protect against?', a: ['Bugs in code', 'Losing data when a disk fails', 'Power outages', 'Hackers'], c: 1,
      e: 'RAID stores data (or parity) across multiple drives so a single failure does not lose data. It is NOT a backup, though!' },
    { q: 'Why is liquid cooling used for AI racks?', a: ['It looks cool', 'Water carries far more heat than air', 'It makes GPUs faster by magic', 'Air is too expensive'], c: 1,
      e: 'Water has a far higher heat capacity than air, so it can pull away the 40+ kW that dense AI racks produce.' },
    { q: 'What is the 3-2-1 backup rule?', a: ['3 servers, 2 racks, 1 room', '3 copies, 2 media types, 1 off-site', '3 passwords, 2 users, 1 admin', 'Back up every 3 days, 2 times, for 1 hour'], c: 1,
      e: 'Keep 3 copies of data, on 2 different kinds of storage, with 1 copy somewhere else.' },
    { q: 'What does a DDoS attack try to do?', a: ['Steal passwords', 'Overwhelm a service with traffic', 'Encrypt files', 'Overheat the servers'], c: 1,
      e: 'Distributed Denial of Service floods a target with traffic from many machines so real users cannot get through.' },
    { q: 'How many inches tall is one rack unit (1U)?', a: ['1 inch', '1.75 inches', '3 inches', '12 inches'], c: 1,
      e: '1U = 1.75 in (44.45 mm). A standard full-height rack is 42U.' },
    { q: 'What is "free cooling"?', a: ['Cooling paid for by the government', 'Using cold outside air or water instead of compressors', 'Turning the servers off', 'Opening the windows in summer'], c: 1,
      e: 'Economizers use cool outside air or water when conditions allow, saving a lot of energy.' },
    { q: 'What does "latency" measure?', a: ['How much data fits in a cable', 'The delay for data to travel', 'The number of servers', 'The price of electricity'], c: 1,
      e: 'Latency is delay, usually in milliseconds. Light in fiber travels about 200 km per millisecond, so distance matters!' },
    { q: 'Which data center "Tier" is the most fault tolerant?', a: ['Tier I', 'Tier II', 'Tier III', 'Tier IV'], c: 3,
      e: 'Uptime Institute Tier IV means fully fault-tolerant, with 2N redundant power and cooling paths. Tier I has no redundancy.' },
    { q: 'What does virtualization let you do?', a: ['Run many virtual machines on one physical server', 'Make servers invisible', 'Play VR games', 'Download more RAM'], c: 0,
      e: 'A hypervisor splits one physical server into many isolated virtual machines, raising utilization.' },
    { q: 'What is a hyperscaler?', a: ['A very tall server rack', 'A company running cloud infrastructure at massive scale', 'A fast network switch', 'A type of cooling tower'], c: 1,
      e: 'Hyperscalers such as the big cloud providers run hundreds of data centers with millions of servers.' },
    { q: 'Which usually costs a data center the most to run over its lifetime?', a: ['Electricity', 'Paint', 'Parking', 'Coffee'], c: 0,
      e: 'Energy is the largest operating cost for most data centers, which is why efficiency matters so much.' },
    { q: 'What does ECC memory do?', a: ['Encrypts cloud computing', 'Detects and corrects memory bit errors', 'Makes RAM faster', 'Cools the CPU'], c: 1,
      e: 'Error-Correcting Code memory adds extra bits to find and fix single-bit errors, such as those caused by cosmic rays.' },
  ];

  DCB.GLOSSARY = [
    ['PUE', 'Power Usage Effectiveness = total facility power ÷ IT power. 1.0 is perfect. The global average is ~1.5; the best hyperscale sites reach ~1.1.'],
    ['IT Load', 'Power used by the servers, storage and network gear themselves. That is the "useful" part.'],
    ['kW / kWh', 'kW is power (how fast energy is used). kWh is energy: 1 kW for 1 hour = 1 kWh.'],
    ['Uptime & "Nines"', '99% = 3.65 days of downtime a year. 99.9% = 8.8 hours. 99.99% = 52 minutes. 99.999% = 5 minutes.'],
    ['SLA', 'Service Level Agreement: your promise to a client, like "99.9% uptime". Miss it and you owe service credits.'],
    ['UPS', 'Uninterruptible Power Supply. Batteries that take over instantly when grid power fails.'],
    ['Generator', 'Diesel engines that provide power during long outages. They take seconds to start, which is why you need a UPS as well.'],
    ['CRAC / CRAH', 'Computer Room Air Conditioner / Air Handler. The big cooling units in a server room.'],
    ['COP', 'Coefficient of Performance: heat removed ÷ electricity used. Higher is more efficient.'],
    ['Hot/Cold Aisle', 'Racks line up so fronts face fronts (cold aisle) and backs face backs (hot aisle). Containment stops the air mixing.'],
    ['ASHRAE Range', 'Recommended server inlet temperature: 18–27 °C. Hotter risks throttling and failures.'],
    ['Throttling', 'Chips slow themselves down when too hot to avoid damage. You lose performance.'],
    ['N+1 / 2N', 'N+1: one spare unit beyond what you need. 2N: a complete duplicate of everything.'],
    ['Tier I–IV', 'Uptime Institute ratings. Tier I = basic, Tier IV = fully fault-tolerant.'],
    ['Bandwidth', 'Maximum data per second over a link, e.g. 10 Gbps.'],
    ['Latency', 'Delay for data to travel. Physics limit: ~5 µs per km in fiber.'],
    ['RAID', 'Redundant Array of Independent Disks. Survives disk failures. It is not a backup!'],
    ['Virtualization', 'Running many virtual machines on one physical server using a hypervisor.'],
    ['DDoS', 'Distributed Denial of Service: flooding a target with traffic from many machines.'],
    ['Free Cooling', 'Using cold outside air or water instead of mechanical chillers.'],
    ['Liquid Cooling', 'Coolant piped to cold plates on chips, or servers immersed in fluid. Needed for dense AI racks.'],
    ['DCIM', 'Data Center Infrastructure Management: monitoring software for power, cooling and assets.'],
    ['Colocation', 'Renting space, power and cooling in someone else’s data center for your servers.'],
    ['Chiller', 'A machine that uses a refrigeration cycle to make chilled water for air handlers and CDUs. Air-cooled or water-cooled.'],
    ['Ton of Refrigeration', '12,000 BTU/h ≈ 3.517 kW of cooling. The standard unit for sizing chillers.'],
    ['kW/ton', 'Plant electricity per ton of cooling. Lower is better: ~0.5–0.6 excellent, >1.0 poor.'],
    ['CHW Supply / Return', 'Chilled water leaves the plant cold (supply) and comes back warmer (return). The difference is the ΔT.'],
    ['Cooling Tower', 'Rejects condenser heat by evaporating water. Efficient, but uses water.'],
    ['Economizer', 'Free cooling. Airside brings in cool outdoor air; waterside uses cold tower water via a heat exchanger.'],
    ['VFD', 'Variable Frequency Drive. Lets motors (fans, pumps) run at partial speed. Power ∝ speed³.'],
    ['BMS / BAS', 'Building Management (Automation) System: the controllers, sensors, graphics, alarms and trends that run the building.'],
    ['BACnet', 'Open protocol (ASHRAE 135) that lets building automation devices from different vendors communicate.'],
    ['Setpoint', 'The target value a control loop maintains, like a 22 °C supply air temperature.'],
    ['PID Loop', 'Proportional-Integral-Derivative control: adjusts an output to hold a measured value at setpoint.'],
    ['Deadband', 'A range around the setpoint where the controller takes no action, to avoid short-cycling.'],
    ['Sequence of Operations', 'The written logic describing how the controls run each system in every mode.'],
    ['Commissioning (Cx)', 'The process of verifying that building systems perform as designed.'],
    ['Demand Response', 'Getting paid by the utility to cut load during grid peaks, usually automated by the BMS.'],
    ['WUE', 'Water Usage Effectiveness = liters of water ÷ kWh of IT energy.'],
    ['VESDA', 'Very Early Smoke Detection Apparatus: pipes that sample air for tiny smoke particles.'],
    ['Clean Agent', 'Gas fire suppression that leaves no residue or water on electronics.'],
    ['Access Control', 'Badges, PINs, biometrics and mantraps that control who can enter which space.'],
    ['Carbon Footprint', 'CO₂ emitted to make your electricity. Cleaner energy and a lower PUE both shrink it.'],
  ];

  // Goals are checked in sim.js; order = career progression.
  DCB.GOALS = [
    { id: 'first_rack', title: 'Rack ’em up', desc: 'Build your first Server Rack.', reward: 0 },
    { id: 'cooled', title: 'Keep it cool', desc: 'Have a working rack below 27 °C (the ASHRAE upper limit).', reward: 2000 },
    { id: 'first_client', title: 'Open for business', desc: 'Sign your first client contract.', reward: 3000 },
    { id: 'backup', title: 'Belt and braces', desc: 'Own both a UPS and a Diesel Generator.', reward: 5000 },
    { id: 'five_clients', title: 'Growing colo', desc: 'Have 5 active clients at once.', reward: 10000 },
    { id: 'pue15', title: 'Efficiency expert', desc: 'Reach PUE below 1.50 with at least 30 kW IT load.', reward: 15000 },
    { id: 'rev100k', title: 'Six figures', desc: 'Earn $100,000 in total revenue.', reward: 10000 },
    { id: 'survive', title: 'Lights stayed on', desc: 'Get through a power outage with zero downtime.', reward: 20000 },
    { id: 'four_nines', title: 'Four nines', desc: 'Complete a 99.99% SLA contract without breaching it.', reward: 30000 },
    { id: 'pue125', title: 'Hyperscale efficiency', desc: 'Reach PUE below 1.25 with at least 100 kW IT load.', reward: 40000 },
    { id: 'ai_host', title: 'AI factory', desc: 'Host a Frontier AI Lab.', reward: 50000 },
    { id: 'plant', title: 'Plant operator', desc: 'Run a chilled water plant: a Water-Cooled Chiller, a Cooling Tower and a working CRAH carrying load.', reward: 20000 },
    { id: 'smart', title: 'Smart building', desc: 'With an online BMS, raise the supply air setpoint to 24 °C or more with no overheating equipment and at least 20 kW IT.', reward: 20000 },
    { id: 'life_safety', title: 'Life safety', desc: 'Install Fire Detection & Suppression and Access Control.', reward: 10000 },
    { id: 'kwton', title: 'Plant wizard', desc: 'Run the chiller plant at 0.60 kW/ton or better while carrying at least 50 tons.', reward: 40000 },
    { id: 'millionaire', title: 'Hyperscaler', desc: 'Reach $1,000,000 in cash. You win!', reward: 0 },
  ];

  DCB.RANKS = [
    'Junior Server Wrangler',
    'Server Room Supervisor',
    'Colo Manager',
    'Operations Director',
    'Data Center Boss',
    'Cloud Tycoon',
    'Hyperscale Legend',
  ];

  DCB.FACTS = [
    'Warren Johnson patented the electric room thermostat in 1883 and founded what became Johnson Controls in 1885.',
    'A single large centrifugal chiller can deliver over 2,000 tons of cooling, enough for a whole campus.',
    'The word "ton" in cooling comes from the ice trade: the heat needed to melt one ton of ice in a day.',
    'Many modern data centers run warmer than your office. Supply air of 24–27 °C is common.',
    'A big data center BMS can monitor over 100,000 points: temperatures, pressures, valve positions, alarms and more.',
    'Cooling towers can evaporate millions of liters of water a year, so water-free cooling designs are growing fast.',
    'VFDs on fans and pumps are one of the fastest paybacks in building energy retrofits.',
    'Data centers use roughly 1–2% of all electricity in the world.',
    'Google reports a fleet-wide PUE of about 1.10.',
    'Some data centers are cooled with seawater, and Microsoft once tested one on the sea floor!',
    'The first "computer bug" was a real moth found in a relay of the Harvard Mark II in 1947.',
    'Light in optical fiber travels about 200,000 km per second, about 2/3 the speed of light in a vacuum.',
    'Undersea cables carry about 99% of intercontinental internet traffic.',
    'Some data centers pipe their waste heat into nearby homes and swimming pools.',
    'Hard drives are so sensitive that shouting at them can measurably slow them down.',
    'A single AI training cluster can draw more power than a small town.',
    'Data centers in Nordic countries use cold climates for nearly free cooling most of the year.',
    'Raised floors in older data centers were used to route cold air and cables underneath the racks.',
    'Many data centers keep enough diesel on site to run their generators for 24–48 hours.',
    'A 42U rack is a little over 2 meters tall.',
    'Server fans can spin at more than 15,000 RPM.',
  ];
})(typeof window !== 'undefined' ? window : globalThis);
